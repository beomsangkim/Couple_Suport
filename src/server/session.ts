import "server-only";
import { cookies } from "next/headers";
import { getStore } from "./store";
import type { Ctx } from "./services/access";

const secure = process.env.NODE_ENV === "production";

// 운영 환경에서는 __Host- 접두어를 쓴다. 이 쿠키는 Secure·Path=/ 이어야 하고 Domain을 가질 수 없어서,
// 정확히 앱 호스트에만 전달된다. 광고를 싣는 가이드 사이트(다른 서브도메인)가 읽거나 덮어쓸 수 없다(개정안 §11.1).
// 개발 서버(http)에서는 Secure를 쓸 수 없어 접두어 없이 쓴다.
const prefix = secure ? "__Host-" : "";
export const SESSION_COOKIE = `${prefix}sid`;
export const INVITE_COOKIE = `${prefix}invite`;

export const cookieOptions = {
  httpOnly: true, // 브라우저 스크립트가 읽을 수 없게(개정안 S-8 8-7)
  sameSite: "lax" as const,
  secure,
  path: "/",
};

/** __Host- 쿠키는 같은 속성(Secure·Path)으로 만료시켜야 지워진다. */
export async function clearCookie(name: string): Promise<void> {
  (await cookies()).set(name, "", { ...cookieOptions, maxAge: 0 });
}

export async function getCtx(): Promise<Ctx> {
  const jar = await cookies();
  return { store: getStore(), sessionId: jar.get(SESSION_COOKIE)?.value };
}
