import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fail } from "../errors";
import { addDays, newId, newToken, sha256 } from "../store";
import type { Invitation } from "../types";
import {
  activeHouseholdOf,
  activeMemberIds,
  auth,
  readableEndedHousehold,
  requireHousehold,
  requireStepUp,
  SNAPSHOT_DAYS,
  today,
  type Ctx,
} from "./access";
import { agreementViews } from "./agreements";
import { expenseView } from "./expenses";
import { memberView } from "./views";

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CONFIRM_ATTEMPTS = 5;
const COLORS = ["teal", "amber", "indigo", "rose", "olive", "slate"] as const;

// ---------------------------------------------------------------------------
// 프로필

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(20),
  color: z.enum(COLORS),
});

export function updateProfile(ctx: Ctx, input: z.input<typeof profileSchema>): void {
  const { user } = auth(ctx);
  const data = profileSchema.parse(input);
  user.displayName = data.displayName;
  user.color = data.color;
}

export function myProfile(ctx: Ctx) {
  const { user } = auth(ctx);
  // 이메일은 본인에게만 내려간다(파트너용 MemberView에는 없음).
  return { id: user.id, displayName: user.displayName, color: user.color, email: user.email, colors: COLORS };
}

/** 화면 상단에서 쓰는 내 상태. 공간이 없거나 종료돼도 실패하지 않는다. */
export function overview(ctx: Ctx) {
  const { user } = auth(ctx);
  const household = activeHouseholdOf(ctx.store, user.id);
  // 나를 항상 먼저 둔다(두 사람을 같은 위계로 보여주되 순서는 일관되게).
  const members = household
    ? activeMemberIds(ctx.store, household.id)
        .map((id) => memberView(ctx.store, id, user.id))
        .sort((a, b) => Number(b.isMe) - Number(a.isMe))
    : [];
  const ended = readableEndedHousehold(ctx, user.id);
  return {
    me: memberView(ctx.store, user.id, user.id),
    householdId: household?.id ?? null,
    members,
    partner: members.find((m) => !m.isMe) ?? null,
    endedSnapshotUntil: ended?.endedOn ? addDays(ended.endedOn, SNAPSHOT_DAYS) : null,
  };
}

export function createHousehold(ctx: Ctx): void {
  const { user } = auth(ctx);
  if (activeHouseholdOf(ctx.store, user.id)) fail("invalid_state");
  const id = newId("h");
  ctx.store.households.push({ id, status: "active", createdAt: ctx.store.clock(), endedAt: null, endedOn: null, redactText: false });
  ctx.store.memberships.push({ householdId: id, userId: user.id, status: "active" });
}

// ---------------------------------------------------------------------------
// 초대 — 링크 + 양쪽 확인 코드(개정안 S-9)

function openInvitation(ctx: Ctx, inv: Invitation): boolean {
  return !inv.revokedAt && !inv.confirmedAt && inv.expiresAt > ctx.store.clock();
}

/** 초대 링크를 만든다. 원문 토큰은 이 응답에서 한 번만 돌려주고 서버에는 해시만 둔다. */
export function createInvitation(ctx: Ctx): { token: string; expiresAt: number } {
  const { user, household, memberIds } = requireHousehold(ctx);
  if (memberIds.length >= 2) fail("invalid_state", "이미 두 사람이 함께 쓰고 있어요.");
  const now = ctx.store.clock();
  const recent = ctx.store.invitations.filter((i) => i.inviterId === user.id && now - (i.expiresAt - INVITE_TTL_MS) < INVITE_TTL_MS);
  if (recent.length >= 10) fail("invalid_state", "오늘은 초대 링크를 더 만들 수 없어요.");
  for (const inv of ctx.store.invitations) if (inv.householdId === household.id && openInvitation(ctx, inv)) inv.revokedAt = now;

  const token = newToken();
  ctx.store.invitations.push({
    id: newId("i"),
    householdId: household.id,
    inviterId: user.id,
    tokenHash: sha256(token),
    expiresAt: now + INVITE_TTL_MS,
    pendingAcceptorId: null,
    codeHash: null,
    confirmAttempts: 0,
    confirmedAt: null,
    revokedAt: null,
  });
  return { token, expiresAt: now + INVITE_TTL_MS };
}

function findByToken(ctx: Ctx, token: string): Invitation | undefined {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return undefined;
  const hash = sha256(token);
  return ctx.store.invitations.find((i) => i.tokenHash === hash);
}

/**
 * 받는 사람의 수락 요청. 아직 공간에 들어가지 않는다.
 * 초대자 이름·공간 정보는 초대자가 코드를 확인하기 전까지 보여주지 않는다.
 * 실패 사유(만료·취소·차단·이미 사용)는 구분하지 않고 같은 문구를 쓴다.
 */
export function requestAcceptance(ctx: Ctx, token: string): { code: string } {
  const { user } = auth(ctx);
  const inv = findByToken(ctx, token);
  const unusable: () => never = () => fail("invalid_state", "이 초대는 사용할 수 없어요. 새 링크를 요청해 주세요.");
  if (!inv || !openInvitation(ctx, inv)) unusable();
  if (inv.inviterId === user.id) unusable();
  if (activeHouseholdOf(ctx.store, user.id)) fail("invalid_state", "이미 함께 쓰는 공간이 있어요.");
  if (user.inviteBlocks.includes(inv.inviterId)) unusable();
  if (inv.pendingAcceptorId && inv.pendingAcceptorId !== user.id) unusable(); // 먼저 연 사람이 있으면 가로채지 못함

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  inv.pendingAcceptorId = user.id;
  inv.codeHash = sha256(`${inv.id}:${code}`);
  inv.confirmAttempts = 0;
  return { code };
}

/** 초대자 화면용. 받는 사람의 이름은 코드 확인 전까지 보여주지 않는다. */
export function myOpenInvitation(ctx: Ctx) {
  const { user, household } = requireHousehold(ctx);
  const inv = ctx.store.invitations.find((i) => i.householdId === household.id && i.inviterId === user.id && openInvitation(ctx, i));
  if (!inv) return null;
  return { id: inv.id, expiresAt: inv.expiresAt, hasRequest: inv.pendingAcceptorId !== null };
}

/** 초대자가 받는 사람에게 들은 6자리 코드를 입력해 확인한다. 이때 멤버십이 생긴다. */
export function confirmInvitation(ctx: Ctx, invitationId: string, code: string): void {
  const { user, household } = requireHousehold(ctx);
  const inv = ctx.store.invitations.find((i) => i.id === invitationId && i.householdId === household.id && i.inviterId === user.id);
  if (!inv || !openInvitation(ctx, inv) || !inv.pendingAcceptorId || !inv.codeHash) fail("not_found");

  inv.confirmAttempts += 1;
  const expected = Buffer.from(inv.codeHash, "hex");
  const actual = Buffer.from(sha256(`${inv.id}:${String(code).trim()}`), "hex");
  if (!timingSafeEqual(expected, actual)) {
    if (inv.confirmAttempts >= MAX_CONFIRM_ATTEMPTS) inv.revokedAt = ctx.store.clock();
    fail("validation", inv.revokedAt ? "확인 코드가 여러 번 틀려 초대를 취소했어요. 새 링크를 만들어 주세요." : "확인 코드가 맞지 않아요.");
  }

  // 정원·중복 소속 불변식. 실제 DB에서는 트랜잭션 + 제약으로 강제한다(db/ 참고).
  if (activeMemberIds(ctx.store, household.id).length >= 2) fail("invalid_state");
  if (activeHouseholdOf(ctx.store, inv.pendingAcceptorId)) fail("invalid_state");
  ctx.store.memberships.push({ householdId: household.id, userId: inv.pendingAcceptorId, status: "active" });
  inv.confirmedAt = ctx.store.clock();
}

export function revokeInvitation(ctx: Ctx, invitationId: string): void {
  const { household } = requireHousehold(ctx);
  const inv = ctx.store.invitations.find((i) => i.id === invitationId && i.householdId === household.id);
  if (!inv) fail("not_found");
  inv.revokedAt ??= ctx.store.clock();
}

// ---------------------------------------------------------------------------
// 연결 해제 — 혼자서, 단계 인증 없이(개정안 S-10)

const leaveSchema = z.object({ redactText: z.boolean(), blockPartner: z.boolean() });

export function leaveHousehold(ctx: Ctx, input: z.input<typeof leaveSchema>): void {
  const { user, household, partnerId } = requireHousehold(ctx);
  const opts = leaveSchema.parse(input);
  const now = ctx.store.clock();
  const t = today(ctx);

  for (const m of ctx.store.memberships) if (m.householdId === household.id && m.status === "active") m.status = "ended";
  household.status = "ended";
  household.endedAt = now;
  household.endedOn = t;
  household.redactText = opts.redactText;
  for (const inv of ctx.store.invitations) if (inv.householdId === household.id) inv.revokedAt ??= now;
  for (const v of ctx.store.versions) if (v.householdId === household.id && v.status === "proposed") v.status = "cancelled";
  for (const task of ctx.store.tasks) if (task.householdId === household.id) task.swapRequest = null;
  for (const s of ctx.store.settlements) if (s.householdId === household.id && s.status === "pending") s.confirmedBy = [];
  if (opts.blockPartner && partnerId && !user.inviteBlocks.includes(partnerId)) user.inviteBlocks.push(partnerId);
}

/** 종료된 공간의 읽기 전용 기록(30일). 자유 본문 숨기기를 골랐다면 설명·약속 본문을 가린다. */
export function endedSnapshot(ctx: Ctx) {
  const { user } = auth(ctx);
  const h = readableEndedHousehold(ctx, user.id);
  if (!h) return null;
  const memberIds = ctx.store.memberships.filter((m) => m.householdId === h.id).map((m) => m.userId);
  const agreements = agreementViews(ctx.store, h.id, user.id).map((a) => ({
    ...a,
    history: a.history.map((v) =>
      h.redactText && v.content.type === "text" ? { ...v, content: { type: "text" as const, body: "(내용 숨김)" } } : v,
    ),
  }));
  return {
    endedOn: h.endedOn!,
    readableUntil: addDays(h.endedOn!, SNAPSHOT_DAYS),
    redacted: h.redactText,
    members: memberIds.map((id) => memberView(ctx.store, id, user.id)),
    expenses: ctx.store.expenses.filter((e) => e.householdId === h.id).map((e) => expenseView(e, user.id, h.redactText)),
    agreements: agreements.map((a) => ({ title: a.title, history: a.history })),
  };
}

/** 내가 볼 수 있는 것만 내보낸다. 단계 인증 필요. */
export function exportMyData(ctx: Ctx) {
  const { user, session } = auth(ctx);
  requireStepUp(ctx, session);
  const household = activeHouseholdOf(ctx.store, user.id);
  const snapshot = endedSnapshot(ctx);
  return {
    exportedOn: today(ctx),
    profile: myProfile(ctx),
    activeHousehold: household
      ? {
          agreements: agreementViews(ctx.store, household.id, user.id),
          expenses: ctx.store.expenses.filter((e) => e.householdId === household.id).map((e) => expenseView(e, user.id)),
        }
      : null,
    endedHousehold: snapshot,
  };
}
