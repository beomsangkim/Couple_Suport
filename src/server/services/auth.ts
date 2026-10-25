import "server-only";
import { fail } from "../errors";
import { newId } from "../store";
import { auth, requireStepUp, type Ctx } from "./access";

// 프로토타입은 실제 인증 대신 가상 사용자를 고르는 데모 로그인을 쓴다.
// 실제 구현은 관리형 인증(패스키 우선)으로 대체한다. 세션 ID는 HttpOnly 쿠키로만 전달한다.

export function demoLogin(ctx: Ctx, userId: string, device: string): string {
  if (!ctx.store.users.some((u) => u.id === userId)) fail("not_found");
  const session = {
    id: newId("s"),
    userId,
    device: device.slice(0, 60) || "알 수 없는 기기",
    createdAt: ctx.store.clock(),
    stepUpAt: null,
    revoked: false,
  };
  ctx.store.sessions.push(session);
  return session.id;
}

export function logout(ctx: Ctx): void {
  const s = ctx.store.sessions.find((x) => x.id === ctx.sessionId);
  if (s) s.revoked = true;
}

/** 패스키 단계 인증의 자리. 실제 구현은 WebAuthn assertion 검증 후 시각을 기록한다. */
export function stepUp(ctx: Ctx): void {
  const { session } = auth(ctx);
  session.stepUpAt = ctx.store.clock();
}

export function listSessions(ctx: Ctx) {
  const { user, session } = auth(ctx);
  // 정밀 위치·IP는 보여주지 않는다(같은 집의 사람에게 오히려 정보가 된다).
  return ctx.store.sessions
    .filter((s) => s.userId === user.id && !s.revoked)
    .map((s) => ({ id: s.id, device: s.device, createdOn: new Date(s.createdAt).toISOString().slice(0, 10), current: s.id === session.id }));
}

export function revokeOtherSessions(ctx: Ctx): number {
  const { user, session } = auth(ctx);
  requireStepUp(ctx, session);
  let n = 0;
  for (const s of ctx.store.sessions) {
    if (s.userId === user.id && s.id !== session.id && !s.revoked) {
      s.revoked = true;
      n++;
    }
  }
  return n;
}
