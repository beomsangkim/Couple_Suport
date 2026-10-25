import "server-only";
import { cookies } from "next/headers";
import { getStore } from "./store";
import type { Ctx } from "./services/access";

export const SESSION_COOKIE = "sid";
export const INVITE_COOKIE = "invite";

export const cookieOptions = {
  httpOnly: true, // 브라우저 스크립트가 읽을 수 없게(개정안 S-8 8-7)
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function getCtx(): Promise<Ctx> {
  const jar = await cookies();
  return { store: getStore(), sessionId: jar.get(SESSION_COOKIE)?.value };
}
