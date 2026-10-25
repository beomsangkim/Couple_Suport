import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE, cookieOptions } from "@/server/session";

// 초대 링크 진입점. 아무 상태도 바꾸지 않는다(메신저 미리보기 봇의 GET이 초대를 소모하지 않게).
// 토큰을 HttpOnly 쿠키로 옮기고 토큰 없는 주소로 보내, 주소창·방문 기록·Referer에 남지 않게 한다.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = NextResponse.redirect(new URL("/invite", request.url), 303);
  if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    res.cookies.set(INVITE_COOKIE, token, { ...cookieOptions, maxAge: 60 * 60 * 24 });
  }
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
