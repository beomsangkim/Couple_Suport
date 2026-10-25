import "server-only";
import { z } from "zod";
import { netBalance, splitAmount } from "@/lib/money";
import { fail } from "../errors";
import { canonicalJson, newId, sha256, type Store } from "../store";
import type { Expense, ISODate, Settlement } from "../types";
import { findInHousehold, requirePair, requireStepUp, today, type Ctx } from "./access";
import { currentSplitVersion } from "./agreements";

const MAX_AMOUNT = 100_000_000; // 1억 원

const splitSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("rule") }),
  z.object({ mode: z.literal("equal") }),
  z.object({ mode: z.literal("custom"), myShare: z.number().int().nonnegative() }),
]);

const expenseSchema = z.object({
  amount: z.number().int().positive().max(MAX_AMOUNT),
  description: z.string().trim().min(1).max(80),
  paidBy: z.string().max(80),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  split: splitSchema,
});

const createSchema = expenseSchema.extend({ idempotencyKey: z.string().min(8).max(80) });

export type ExpenseInput = z.input<typeof expenseSchema>;

function resolveWeights(
  store: Store,
  householdId: string,
  meId: string,
  pair: [string, string],
  data: z.infer<typeof expenseSchema>,
): { weights: Record<string, number>; ruleVersionId: string | null } {
  const [a, b] = pair;
  switch (data.split.mode) {
    case "rule": {
      const v = currentSplitVersion(store, householdId, data.spentOn);
      if (!v || v.content.type !== "split") fail("validation", "적용 중인 생활비 약속이 없어요. 이번 지출의 분담을 직접 정해 주세요.");
      return { weights: v.content.rule.weights, ruleVersionId: v.id };
    }
    case "equal":
      return { weights: { [a]: 1, [b]: 1 }, ruleVersionId: null };
    case "custom": {
      if (data.split.myShare > data.amount) fail("validation", "내 부담이 전체 금액보다 클 수 없어요.");
      const partner = a === meId ? b : a;
      return { weights: { [meId]: data.split.myShare, [partner]: data.amount - data.split.myShare }, ruleVersionId: null };
    }
  }
}

function computeShares(amount: number, weights: Record<string, number>, paidBy: string) {
  // 직접 금액으로 정한 경우 결제자 몫이 0일 수 있다. 가중치 합이 0이면 반반으로 처리하지 않고 거부한다.
  if (Object.values(weights).reduce((s, w) => s + w, 0) === 0) fail("validation");
  return splitAmount(amount, weights, paidBy);
}

export function createExpense(ctx: Ctx, input: ExpenseInput & { idempotencyKey: string }): { id: string } {
  const { user, household, pair } = requirePair(ctx);
  const data = createSchema.parse(input);
  if (!pair.includes(data.paidBy)) fail("validation");
  if (data.spentOn > today(ctx)) fail("validation", "미래 날짜는 기록할 수 없어요.");

  // 같은 요청이 다시 와도(재시도·두 번 누름) 한 번만 기록한다.
  const dup = ctx.store.expenses.find((e) => e.createdBy === user.id && e.idempotencyKey === data.idempotencyKey);
  if (dup) return { id: dup.id };

  const { weights, ruleVersionId } = resolveWeights(ctx.store, household.id, user.id, pair, data);
  const expense: Expense = {
    id: newId("e"),
    householdId: household.id,
    amount: data.amount,
    description: data.description,
    paidBy: data.paidBy,
    createdBy: user.id,
    spentOn: data.spentOn,
    weights,
    shares: computeShares(data.amount, weights, data.paidBy),
    ruleVersionId,
    disputedBy: null,
    settlementId: null,
    version: 1,
    idempotencyKey: data.idempotencyKey,
  };
  ctx.store.expenses.push(expense);
  return { id: expense.id };
}

function editable(ctx: Ctx, id: string, expectedVersion: number) {
  const h = requirePair(ctx);
  const e = findInHousehold(ctx.store.expenses, id, h.household.id);
  // 작성자만, 정산 확정 전까지만 수정한다. 상대는 '확인 필요' 표시만 할 수 있다.
  if (e.createdBy !== h.user.id || e.settlementId) fail("invalid_state");
  if (e.version !== expectedVersion) fail("conflict");
  return { ...h, e };
}

export function updateExpense(ctx: Ctx, id: string, expectedVersion: number, input: ExpenseInput): void {
  const { e, user, household, pair } = editable(ctx, id, expectedVersion);
  const data = expenseSchema.parse(input);
  if (!pair.includes(data.paidBy)) fail("validation");
  const { weights, ruleVersionId } = resolveWeights(ctx.store, household.id, user.id, pair, data);
  Object.assign(e, {
    amount: data.amount,
    description: data.description,
    paidBy: data.paidBy,
    spentOn: data.spentOn,
    weights,
    ruleVersionId,
    shares: computeShares(data.amount, weights, data.paidBy),
    disputedBy: null,
    version: e.version + 1,
  });
}

export function deleteExpense(ctx: Ctx, id: string, expectedVersion: number): void {
  const { e } = editable(ctx, id, expectedVersion);
  ctx.store.expenses.splice(ctx.store.expenses.indexOf(e), 1);
}

/** 상대가 작성한 지출에 '확인 필요'를 표시하거나 해제한다. */
export function setDispute(ctx: Ctx, id: string, disputed: boolean): void {
  const { user, household } = requirePair(ctx);
  const e = findInHousehold(ctx.store.expenses, id, household.id);
  if (e.settlementId) fail("invalid_state");
  if (disputed) {
    if (e.createdBy === user.id) fail("invalid_state");
    e.disputedBy = user.id;
  } else {
    if (e.disputedBy !== user.id) fail("invalid_state");
    e.disputedBy = null;
  }
  e.version += 1;
}

// ---------------------------------------------------------------------------
// 정산

function monthExpenses(store: Store, householdId: string, month: string): Expense[] {
  return store.expenses.filter((e) => e.householdId === householdId && e.spentOn.startsWith(month) && !e.settlementId);
}

function snapshotHash(expenses: Expense[]): string {
  return sha256(canonicalJson(expenses.map((e) => [e.id, e.version]).sort()));
}

export function startSettlement(ctx: Ctx, month: string): { settlementId: string; snapshotHash: string } {
  const { household } = requirePair(ctx);
  if (!/^\d{4}-\d{2}$/.test(month)) fail("validation");
  const expenses = monthExpenses(ctx.store, household.id, month);
  if (expenses.length === 0) fail("invalid_state", "정산할 지출이 없어요.");
  const disputed = expenses.filter((e) => e.disputedBy).length;
  if (disputed > 0) fail("invalid_state", `확인 필요 지출 ${disputed}건을 먼저 정리해 주세요.`);

  const hash = snapshotHash(expenses);
  const pending = ctx.store.settlements.find((s) => s.householdId === household.id && s.month === month && s.status === "pending");
  if (pending && pending.snapshotHash === hash) return { settlementId: pending.id, snapshotHash: hash };
  if (pending) ctx.store.settlements.splice(ctx.store.settlements.indexOf(pending), 1); // 내용이 바뀌었으면 확인을 처음부터

  const s: Settlement = {
    id: newId("st"),
    householdId: household.id,
    month,
    expenseIds: expenses.map((e) => e.id),
    snapshotHash: hash,
    confirmedBy: [],
    status: "pending",
  };
  ctx.store.settlements.push(s);
  return { settlementId: s.id, snapshotHash: hash };
}

/** 두 사람이 같은 계산 결과를 확인하면 확정된다. 같은 사람이 다시 눌러도 결과는 같다. */
export function confirmSettlement(ctx: Ctx, settlementId: string, hash: string): { status: Settlement["status"] } {
  const { user, session, household } = requirePair(ctx);
  requireStepUp(ctx, session);
  const s = findInHousehold(ctx.store.settlements, settlementId, household.id);
  if (s.status === "confirmed") return { status: s.status };
  // 그 달의 미정산 지출 전체가 시작 시점과 같아야 한다(추가·수정·삭제 모두 감지).
  const current = monthExpenses(ctx.store, household.id, s.month);
  if (snapshotHash(current) !== s.snapshotHash || hash !== s.snapshotHash) fail("stale_content");
  if (current.some((e) => e.disputedBy)) fail("invalid_state");
  if (!s.confirmedBy.includes(user.id)) s.confirmedBy.push(user.id);
  if (s.confirmedBy.length === 2) {
    s.status = "confirmed";
    for (const e of current) e.settlementId = s.id;
  }
  return { status: s.status };
}

// ---------------------------------------------------------------------------
// 조회

export interface ExpenseView {
  id: string;
  amount: number;
  description: string;
  paidBy: string;
  spentOn: ISODate;
  myShare: number;
  partnerShare: number;
  byRule: boolean;
  createdByMe: boolean;
  disputed: boolean;
  disputedByMe: boolean;
  settled: boolean;
  version: number;
}

export function expenseView(e: Expense, meId: string, redact = false): ExpenseView {
  const partnerShare = Object.entries(e.shares).find(([id]) => id !== meId)?.[1] ?? 0;
  return {
    id: e.id,
    amount: e.amount,
    description: redact ? "(내용 숨김)" : e.description,
    paidBy: e.paidBy,
    spentOn: e.spentOn,
    myShare: e.shares[meId] ?? 0,
    partnerShare,
    byRule: e.ruleVersionId !== null,
    createdByMe: e.createdBy === meId,
    disputed: e.disputedBy !== null,
    disputedByMe: e.disputedBy === meId,
    settled: e.settlementId !== null,
    version: e.version,
  };
}

export interface MonthSummary {
  month: string;
  expenses: ExpenseView[];
  total: number;
  myShareTotal: number;
  balance: { from: string; to: string; amount: number } | null;
  disputedCount: number;
  settlement: { id: string; snapshotHash: string; confirmedByMe: boolean; confirmedByPartner: boolean; status: Settlement["status"]; stale: boolean } | null;
  settledCount: number;
  defaultRule: { versionId: string; weights: Record<string, number>; kind: string } | null;
}

export function monthSummary(ctx: Ctx, month: string): MonthSummary {
  const { user, household, pair, partnerId } = requirePair(ctx);
  const all = ctx.store.expenses
    .filter((e) => e.householdId === household.id && e.spentOn.startsWith(month))
    .sort((a, b) => (a.spentOn < b.spentOn ? 1 : -1));
  const open = all.filter((e) => !e.settlementId);
  const s =
    ctx.store.settlements.find((x) => x.householdId === household.id && x.month === month && x.status === "pending") ??
    ctx.store.settlements.find((x) => x.householdId === household.id && x.month === month && x.status === "confirmed");
  const rule = currentSplitVersion(ctx.store, household.id, today(ctx));
  return {
    month,
    expenses: all.map((e) => expenseView(e, user.id)),
    total: open.reduce((n, e) => n + e.amount, 0),
    myShareTotal: open.reduce((n, e) => n + (e.shares[user.id] ?? 0), 0),
    balance: netBalance(open, pair),
    disputedCount: open.filter((e) => e.disputedBy).length,
    settlement: s
      ? {
          id: s.id,
          snapshotHash: s.snapshotHash,
          confirmedByMe: s.confirmedBy.includes(user.id),
          confirmedByPartner: s.confirmedBy.includes(partnerId),
          status: s.status,
          stale: s.status === "pending" && snapshotHash(open) !== s.snapshotHash,
        }
      : null,
    settledCount: all.length - open.length,
    defaultRule:
      rule && rule.content.type === "split"
        ? { versionId: rule.id, weights: rule.content.rule.weights, kind: rule.content.rule.kind }
        : null,
  };
}
