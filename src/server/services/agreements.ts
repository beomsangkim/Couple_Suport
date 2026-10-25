import "server-only";
import { z } from "zod";
import { isValidRatio } from "@/lib/income";
import { fail } from "../errors";
import { newId, versionHash, type Store } from "../store";
import type { AgreementContent, AgreementVersion, ISODate, SplitRule } from "../types";
import { findInHousehold, requireHousehold, requirePair, requireStepUp, today, type Ctx } from "./access";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const splitRuleSchema = z.object({
  kind: z.enum(["equal", "ratio", "amount"]),
  weights: z.record(z.string(), z.number().int().nonnegative().max(1_000_000_000)),
});

const proposeSchema = z.object({
  agreementId: z.string().max(80).nullable(),
  title: z.string().trim().min(1).max(60),
  content: z.discriminatedUnion("type", [
    z.object({ type: z.literal("split"), rule: splitRuleSchema }),
    z.object({ type: z.literal("text"), body: z.string().trim().min(1).max(2000) }),
  ]),
  effectiveFrom: isoDate,
  reviewOn: isoDate.nullable(),
});

export type ProposeInput = z.input<typeof proposeSchema>;

function validateRule(rule: SplitRule, pair: [string, string]): void {
  const keys = Object.keys(rule.weights).sort();
  if (keys.length !== 2 || keys[0] !== [...pair].sort()[0] || keys[1] !== [...pair].sort()[1]) {
    fail("validation", "두 사람 모두의 분담이 필요해요.");
  }
  const [a, b] = pair.map((id) => rule.weights[id]!) as [number, number];
  if (rule.kind === "equal" && (a !== 1 || b !== 1)) fail("validation");
  if (rule.kind === "ratio" && !isValidRatio(a, b)) fail("validation", "비율은 5% 단위로 정해 주세요.");
  if (rule.kind === "amount" && (a <= 0 || b <= 0)) fail("validation");
}

/** 적용일이 지난 '적용 대기' 버전을 적용 중으로 바꾼다. 읽기 전에 호출한다. */
export function refreshSchedules(store: Store, householdId: string, on: ISODate): void {
  for (const v of store.versions) {
    if (v.householdId === householdId && v.status === "scheduled" && v.effectiveFrom <= on) activate(store, v);
  }
}

function activate(store: Store, v: AgreementVersion): void {
  for (const other of store.versions) {
    if (other.agreementId === v.agreementId && other.id !== v.id && other.status === "active") other.status = "superseded";
  }
  v.status = "active";
}

export function proposeVersion(ctx: Ctx, input: ProposeInput): { versionId: string; agreementId: string } {
  const { user, household, pair } = requirePair(ctx);
  const data = proposeSchema.parse(input);
  if (data.content.type === "split") validateRule(data.content.rule, pair);
  const t = today(ctx);
  if (data.effectiveFrom < t) fail("validation", "적용일은 오늘 이후로 정해 주세요.");
  if (data.reviewOn && data.reviewOn < data.effectiveFrom) fail("validation");

  let agreementId = data.agreementId;
  let previous: AgreementVersion | undefined;
  if (agreementId) {
    const existing = ctx.store.versions.filter((v) => v.agreementId === agreementId && v.householdId === household.id);
    if (existing.length === 0) fail("not_found");
    previous = existing.find((v) => v.status === "active") ?? existing.at(-1);
    // 같은 약속에 대기 중인 제안이 있으면 이 제안이 수정안으로 대체한다(기존 동의는 재사용하지 않음).
    for (const v of existing) if (v.status === "proposed") v.status = "superseded";
  } else {
    agreementId = newId("a");
  }

  const content = data.content as AgreementContent;
  const version: AgreementVersion = {
    id: newId("v"),
    agreementId,
    householdId: household.id,
    title: data.title,
    content,
    effectiveFrom: data.effectiveFrom,
    reviewOn: data.reviewOn,
    contentHash: versionHash({ title: data.title, content, effectiveFrom: data.effectiveFrom, reviewOn: data.reviewOn }),
    status: "proposed",
    createdBy: user.id,
    createdOn: t,
    previousVersionId: previous?.id ?? null,
    withdrawnBy: null,
    withdrawnOn: null,
  };
  ctx.store.versions.push(version);
  // 제안 보내기 = 제안자의 동의(개정안 §6.2). 버튼 문구로 명시한다.
  ctx.store.approvals.push({ versionId: version.id, userId: user.id, contentHash: version.contentHash });
  return { versionId: version.id, agreementId };
}

/**
 * 동의. 화면이 받은 content_hash와 현재 버전의 해시가 같아야 한다.
 * 금전 약속은 단계 인증이 필요하다.
 */
export function approveVersion(ctx: Ctx, versionId: string, contentHash: string): { status: AgreementVersion["status"] } {
  const { user, session, household, memberIds } = requirePair(ctx);
  const v = findInHousehold(ctx.store.versions, versionId, household.id);
  if (v.content.type === "split") requireStepUp(ctx, session);
  if (v.status !== "proposed") fail("invalid_state");
  if (v.contentHash !== contentHash) fail("stale_content");

  if (!ctx.store.approvals.some((a) => a.versionId === v.id && a.userId === user.id)) {
    ctx.store.approvals.push({ versionId: v.id, userId: user.id, contentHash });
  }
  const approvedBy = new Set(
    ctx.store.approvals
      .filter((a) => a.versionId === v.id && a.contentHash === v.contentHash && memberIds.includes(a.userId))
      .map((a) => a.userId),
  );
  if (approvedBy.size === 2) {
    if (v.effectiveFrom <= today(ctx)) activate(ctx.store, v);
    else v.status = "scheduled";
  }
  return { status: v.status };
}

/** 제안자가 아직 합의되지 않은 제안을 거둔다. */
export function cancelProposal(ctx: Ctx, versionId: string): void {
  const { user, household } = requireHousehold(ctx);
  const v = findInHousehold(ctx.store.versions, versionId, household.id);
  if (v.status !== "proposed" || v.createdBy !== user.id) fail("invalid_state");
  v.status = "cancelled";
}

/**
 * 철회. 적용 중이거나 적용 대기인 약속을 어느 구성원이든 혼자서, 이유 없이, 즉시 철회한다.
 * 변경은 둘이, 철회는 혼자서(개정안 S-2).
 */
export function withdrawAgreement(ctx: Ctx, versionId: string): void {
  const { user, household } = requireHousehold(ctx);
  const v = findInHousehold(ctx.store.versions, versionId, household.id);
  if (v.status !== "active" && v.status !== "scheduled") fail("invalid_state");
  v.status = "withdrawn";
  v.withdrawnBy = user.id;
  v.withdrawnOn = today(ctx);
}

/** 지출 기본값으로 쓸 현재 생활비 규칙. 철회됐으면 null(매번 직접 정함). */
export function currentSplitVersion(store: Store, householdId: string, on: ISODate): AgreementVersion | null {
  refreshSchedules(store, householdId, on);
  return (
    store.versions.find(
      (v) => v.householdId === householdId && v.status === "active" && v.content.type === "split" && v.effectiveFrom <= on,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// 조회

export interface VersionView {
  versionId: string;
  title: string;
  content: AgreementContent;
  effectiveFrom: ISODate;
  reviewOn: ISODate | null;
  contentHash: string;
  status: AgreementVersion["status"];
  createdByMe: boolean;
  approvedByMe: boolean;
  approvedByPartner: boolean;
  withdrawnByMe: boolean | null;
  withdrawnOn: ISODate | null;
}

export interface AgreementView {
  agreementId: string;
  title: string;
  current: VersionView | null; // 적용 중
  scheduled: VersionView | null; // 동의 완료, 적용일 대기
  pending: VersionView | null; // 동의를 기다리는 제안
  pendingBase: VersionView | null; // 제안이 바꾸려는 이전 버전(차이 비교용)
  history: VersionView[];
  state: "pending" | "active" | "scheduled" | "withdrawn" | "ended";
}

function versionView(store: Store, v: AgreementVersion, meId: string): VersionView {
  const approvers = store.approvals.filter((a) => a.versionId === v.id && a.contentHash === v.contentHash).map((a) => a.userId);
  return {
    versionId: v.id,
    title: v.title,
    content: v.content,
    effectiveFrom: v.effectiveFrom,
    reviewOn: v.reviewOn,
    contentHash: v.contentHash,
    status: v.status,
    createdByMe: v.createdBy === meId,
    approvedByMe: approvers.includes(meId),
    approvedByPartner: approvers.some((id) => id !== meId),
    withdrawnByMe: v.withdrawnBy ? v.withdrawnBy === meId : null,
    withdrawnOn: v.withdrawnOn,
  };
}

export function listAgreements(ctx: Ctx): AgreementView[] {
  const { user, household } = requireHousehold(ctx);
  refreshSchedules(ctx.store, household.id, today(ctx));
  return agreementViews(ctx.store, household.id, user.id);
}

export function agreementViews(store: Store, householdId: string, meId: string): AgreementView[] {
  const byAgreement = new Map<string, AgreementVersion[]>();
  for (const v of store.versions) {
    if (v.householdId !== householdId) continue;
    byAgreement.set(v.agreementId, [...(byAgreement.get(v.agreementId) ?? []), v]);
  }
  const views: AgreementView[] = [];
  for (const [agreementId, versions] of byAgreement) {
    const view = (v: AgreementVersion | undefined) => (v ? versionView(store, v, meId) : null);
    const current = versions.find((v) => v.status === "active");
    const scheduled = versions.find((v) => v.status === "scheduled");
    const pending = versions.find((v) => v.status === "proposed");
    const pendingBase = pending?.previousVersionId ? versions.find((v) => v.id === pending.previousVersionId) : undefined;
    const latest = versions.at(-1)!;
    const visible = current ?? scheduled ?? pending;
    if (!visible && versions.every((v) => v.status === "cancelled")) continue;
    views.push({
      agreementId,
      title: (pending ?? current ?? latest).title,
      current: view(current),
      scheduled: view(scheduled),
      pending: view(pending),
      pendingBase: view(pendingBase),
      history: versions.map((v) => versionView(store, v, meId)).reverse(),
      state: pending
        ? "pending"
        : current
          ? "active"
          : scheduled
            ? "scheduled"
            : versions.some((v) => v.status === "withdrawn")
              ? "withdrawn"
              : "ended",
    });
  }
  return views;
}
