import "server-only";
import { fail } from "../errors";
import { addDays, toISODate, type Store } from "../store";
import type { Household, ISODate, Session, User } from "../types";

/** 모든 서비스 함수의 첫 인자. 사용자 ID가 아니라 세션 ID만 받는다. */
export interface Ctx {
  store: Store;
  sessionId: string | undefined;
}

export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;
export const SNAPSHOT_DAYS = 30;

export function today(ctx: Ctx): ISODate {
  return toISODate(ctx.store.clock());
}

/** 세션에서 사용자를 정한다. 클라이언트가 보낸 user_id는 어디에서도 받지 않는다. */
export function auth(ctx: Ctx): { user: User; session: Session } {
  const session = ctx.store.sessions.find((s) => s.id === ctx.sessionId && !s.revoked);
  if (!session) fail("unauthenticated");
  const user = ctx.store.users.find((u) => u.id === session.userId);
  if (!user) fail("unauthenticated");
  return { user, session };
}

export function requireStepUp(ctx: Ctx, session: Session): void {
  if (!session.stepUpAt || ctx.store.clock() - session.stepUpAt > STEP_UP_WINDOW_MS) fail("step_up_required");
}

export function activeHouseholdOf(store: Store, userId: string): Household | undefined {
  const m = store.memberships.find((x) => x.userId === userId && x.status === "active");
  if (!m) return undefined;
  const h = store.households.find((x) => x.id === m.householdId);
  return h?.status === "active" ? h : undefined;
}

export function activeMemberIds(store: Store, householdId: string): string[] {
  return store.memberships.filter((m) => m.householdId === householdId && m.status === "active").map((m) => m.userId);
}

/**
 * 공동 데이터 쓰기·읽기의 관문. 매 요청마다 멤버십 테이블에서 소속을 다시 확인한다
 * (토큰·쿠키에 소속을 넣지 않으므로 연결 해제 즉시 반영된다).
 */
export function requireHousehold(ctx: Ctx) {
  const { user, session } = auth(ctx);
  const household = activeHouseholdOf(ctx.store, user.id);
  if (!household) {
    const hadEnded = ctx.store.memberships.some((m) => m.userId === user.id && m.status === "ended");
    fail(hadEnded ? "access_revoked" : "not_found");
  }
  const memberIds = activeMemberIds(ctx.store, household.id);
  const partnerId = memberIds.find((id) => id !== user.id) ?? null;
  return { user, session, household, memberIds, partnerId };
}

/** 두 사람이 모두 있어야 하는 기능(약속·정산)에서 쓴다. */
export function requirePair(ctx: Ctx) {
  const h = requireHousehold(ctx);
  if (!h.partnerId) fail("invalid_state", "함께 사용할 사람을 먼저 초대해 주세요.");
  return { ...h, partnerId: h.partnerId, pair: [h.user.id, h.partnerId] as [string, string] };
}

/**
 * 같은 공간의 기록만 꺼낸다. 다른 공간의 ID면 존재 여부를 드러내지 않고 not_found.
 */
export function findInHousehold<T extends { id: string; householdId: string }>(
  rows: T[],
  id: string,
  householdId: string,
): T {
  const row = rows.find((r) => r.id === id);
  if (!row || row.householdId !== householdId) fail("not_found");
  return row;
}

/** 연결 해제 후 읽기 전용으로 열람할 수 있는 종료 공간(30일 이내). */
export function readableEndedHousehold(ctx: Ctx, userId: string): Household | undefined {
  const t = today(ctx);
  const endedIds = ctx.store.memberships
    .filter((m) => m.userId === userId && m.status === "ended")
    .map((m) => m.householdId);
  return ctx.store.households
    .filter((h) => endedIds.includes(h.id) && h.status === "ended" && h.endedOn)
    .filter((h) => addDays(h.endedOn!, SNAPSHOT_DAYS) > t)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
}
