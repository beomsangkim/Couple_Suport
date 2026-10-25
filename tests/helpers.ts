import { createSeededStore, type Store } from "@/server/store";
import { demoLogin, stepUp } from "@/server/services/auth";
import type { Ctx } from "@/server/services/access";
import { AppError, type ErrorCode } from "@/server/errors";
import { expect } from "vitest";

// 2026-10-25 12:00 KST (일요일)
export const NOW = Date.parse("2026-10-25T03:00:00Z");

export function setup(now = NOW): Store {
  return createSeededStore(now);
}

export function as(store: Store, userId: string, opts: { stepUp?: boolean } = {}): Ctx {
  const ctx: Ctx = { store, sessionId: undefined };
  ctx.sessionId = demoLogin(ctx, userId, "테스트 기기");
  if (opts.stepUp) stepUp(ctx);
  return ctx;
}

export function expectCode(fn: () => unknown, code: ErrorCode): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError(${code}) but call succeeded`);
}
