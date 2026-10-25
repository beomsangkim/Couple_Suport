import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AgreementContent,
  AgreementVersion,
  Approval,
  Expense,
  Household,
  Invitation,
  ISODate,
  Membership,
  Session,
  Settlement,
  Task,
  User,
} from "./types";
import { splitAmount } from "@/lib/money";

// 프로토타입용 메모리 저장소. 실제 구현에서는 PostgreSQL + RLS(db/ 참고)로 대체한다.
// 이 모듈의 데이터는 서비스 계층(services.ts)을 거쳐서만 접근한다.

export interface Store {
  users: User[];
  sessions: Session[];
  households: Household[];
  memberships: Membership[];
  versions: AgreementVersion[];
  approvals: Approval[];
  expenses: Expense[];
  settlements: Settlement[];
  tasks: Task[];
  invitations: Invitation[];
  clock: () => number;
}

export const TIME_ZONE = "Asia/Seoul";

export function toISODate(ms: number): ISODate {
  // en-CA 형식은 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(ms));
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 키 순서를 고정한 JSON. 해시 입력으로 쓴다. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function versionHash(v: {
  title: string;
  content: AgreementContent;
  effectiveFrom: ISODate;
  reviewOn: ISODate | null;
}): string {
  return sha256(
    canonicalJson({ title: v.title, content: v.content, effectiveFrom: v.effectiveFrom, reviewOn: v.reviewOn }),
  );
}

// ---------------------------------------------------------------------------
// 가상 데이터

export const DEMO_PERSONAS = [
  { id: "u_min", note: "공간 A · 지우와 함께 사용 중" },
  { id: "u_jiwoo", note: "공간 A · 민과 함께 사용 중" },
  { id: "u_haneul", note: "아직 공간 없음 · 초대해 보기" },
  { id: "u_haesol", note: "아직 공간 없음 · 초대 받아 보기" },
  { id: "u_seojun", note: "공간 B · 격리 확인용" },
] as const;

export function createSeededStore(now: number = Date.now()): Store {
  const today = toISODate(now);
  const month = today.slice(0, 7);
  const lastMonthStart = addDays(`${month}-01`, -1).slice(0, 7) + "-01";

  const user = (id: string, displayName: string, color: string): User => ({
    id,
    displayName,
    color,
    email: `${id.slice(2)}@example.test`,
    inviteBlocks: [],
  });

  const store: Store = {
    users: [
      user("u_min", "민", "teal"),
      user("u_jiwoo", "지우", "amber"),
      user("u_haneul", "하늘", "indigo"),
      user("u_haesol", "해솔", "rose"),
      user("u_seojun", "서준", "teal"),
      user("u_yoon", "윤", "amber"),
    ],
    sessions: [],
    households: [
      { id: "h_a", status: "active", createdAt: now, endedAt: null, endedOn: null, redactText: false },
      { id: "h_b", status: "active", createdAt: now, endedAt: null, endedOn: null, redactText: false },
    ],
    memberships: [
      { householdId: "h_a", userId: "u_min", status: "active" },
      { householdId: "h_a", userId: "u_jiwoo", status: "active" },
      { householdId: "h_b", userId: "u_seojun", status: "active" },
      { householdId: "h_b", userId: "u_yoon", status: "active" },
    ],
    versions: [],
    approvals: [],
    expenses: [],
    settlements: [],
    tasks: [],
    invitations: [],
    clock: () => now,
  };

  const addVersion = (
    v: Omit<AgreementVersion, "contentHash" | "previousVersionId" | "withdrawnBy" | "withdrawnOn">,
    approvers: string[],
    previousVersionId: string | null = null,
  ) => {
    const full: AgreementVersion = {
      ...v,
      contentHash: versionHash(v),
      previousVersionId,
      withdrawnBy: null,
      withdrawnOn: null,
    };
    store.versions.push(full);
    for (const userId of approvers) store.approvals.push({ versionId: full.id, userId, contentHash: full.contentHash });
    return full;
  };

  const split6040 = addVersion(
    {
      id: "v_split_1",
      agreementId: "a_split",
      householdId: "h_a",
      title: "생활비 나누기",
      content: { type: "split", rule: { kind: "ratio", weights: { u_min: 60, u_jiwoo: 40 } } },
      effectiveFrom: lastMonthStart,
      reviewOn: addDays(today, 40),
      status: "active",
      createdBy: "u_min",
      createdOn: lastMonthStart,
    },
    ["u_min", "u_jiwoo"],
  );

  addVersion(
    {
      id: "v_split_2",
      agreementId: "a_split",
      householdId: "h_a",
      title: "생활비 나누기",
      content: { type: "split", rule: { kind: "equal", weights: { u_min: 1, u_jiwoo: 1 } } },
      effectiveFrom: addDays(`${month}-01`, 31).slice(0, 7) + "-01",
      reviewOn: null,
      status: "proposed",
      createdBy: "u_jiwoo",
      createdOn: addDays(today, -1),
    },
    ["u_jiwoo"],
    split6040.id,
  );

  addVersion(
    {
      id: "v_quiet_1",
      agreementId: "a_quiet",
      householdId: "h_a",
      title: "조용한 시간",
      content: { type: "text", body: "평일 밤 11시 이후에는 TV·게임 소리를 줄이고, 통화는 작은 방에서 해요." },
      effectiveFrom: lastMonthStart,
      reviewOn: null,
      status: "active",
      createdBy: "u_jiwoo",
      createdOn: lastMonthStart,
    },
    ["u_min", "u_jiwoo"],
  );

  addVersion(
    {
      id: "v_b_split",
      agreementId: "a_b_split",
      householdId: "h_b",
      title: "생활비 나누기",
      content: { type: "split", rule: { kind: "equal", weights: { u_seojun: 1, u_yoon: 1 } } },
      effectiveFrom: lastMonthStart,
      reviewOn: null,
      status: "active",
      createdBy: "u_seojun",
      createdOn: lastMonthStart,
    },
    ["u_seojun", "u_yoon"],
  );

  const weights = { u_min: 60, u_jiwoo: 40 };
  const addExpense = (id: string, amount: number, description: string, paidBy: string, daysAgo: number) => {
    store.expenses.push({
      id,
      householdId: "h_a",
      amount,
      description,
      paidBy,
      createdBy: paidBy,
      spentOn: addDays(today, -daysAgo),
      weights,
      shares: splitAmount(amount, weights, paidBy),
      ruleVersionId: split6040.id,
      disputedBy: null,
      settlementId: null,
      version: 1,
      idempotencyKey: id,
    });
  };
  const daysIntoMonth = Number(today.slice(8, 10)) - 1;
  addExpense("e_1", 650000, "월세 일부", "u_min", Math.min(daysIntoMonth, 20));
  addExpense("e_2", 87300, "전기·가스 요금", "u_jiwoo", Math.min(daysIntoMonth, 12));
  addExpense("e_3", 54210, "주말 장보기", "u_jiwoo", Math.min(daysIntoMonth, 5));
  addExpense("e_4", 23900, "세제·휴지", "u_min", Math.min(daysIntoMonth, 2));

  store.expenses.push({
    id: "e_b_1",
    householdId: "h_b",
    amount: 120000,
    description: "공간 B의 관리비",
    paidBy: "u_seojun",
    createdBy: "u_seojun",
    spentOn: today,
    weights: { u_seojun: 1, u_yoon: 1 },
    shares: splitAmount(120000, { u_seojun: 1, u_yoon: 1 }, "u_seojun"),
    ruleVersionId: "v_b_split",
    disputedBy: null,
    settlementId: null,
    version: 1,
    idempotencyKey: "e_b_1",
  });

  const addTask = (id: string, title: string, assignee: string, criteria: string, weekdays: number[]) =>
    store.tasks.push({ id, householdId: "h_a", title, assignee, criteria, weekdays, completions: [], swapRequest: null });
  addTask("t_laundry", "빨래", "u_min", "세탁·건조·개기·수납까지", [2, 6]);
  addTask("t_recycle", "분리수거", "u_jiwoo", "현관 앞 모음통 비우고 새 봉투 넣기", [3]);
  addTask("t_dishes", "설거지", "u_jiwoo", "건조대 정리와 싱크대 물기 닦기까지", [0, 1, 2, 3, 4, 5, 6]);
  addTask("t_stock", "생필품 확인", "u_min", "세제·휴지 남은 양 확인하고 장보기 목록에 적기", [0]);

  return store;
}

// Next.js 개발 서버의 모듈 재로딩에도 같은 저장소를 쓰기 위해 globalThis에 둔다.
const g = globalThis as unknown as { __coupleStore?: Store };

export function getStore(): Store {
  if (!g.__coupleStore) g.__coupleStore = createSeededStore();
  return g.__coupleStore;
}

export function resetStore(): void {
  g.__coupleStore = createSeededStore();
}
