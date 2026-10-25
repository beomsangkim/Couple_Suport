import "server-only";
import { redirect } from "next/navigation";
import { AppError } from "./errors";
import { getCtx } from "./session";
import type { Ctx } from "./services/access";

/** 서버 컴포넌트에서 서비스를 호출한다. 권한 오류는 알맞은 화면으로 보낸다. */
export async function load<T>(fn: (ctx: Ctx) => T): Promise<T> {
  const ctx = await getCtx();
  try {
    return fn(ctx);
  } catch (e) {
    if (e instanceof AppError) {
      if (e.code === "unauthenticated") redirect("/login");
      if (e.code === "access_revoked") redirect("/ended");
      if (e.code === "not_found" || (e.code === "invalid_state" && e.detail?.includes("초대"))) redirect("/start");
    }
    throw e;
  }
}
