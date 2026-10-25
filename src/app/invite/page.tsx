import Link from "next/link";
import { cookies } from "next/headers";
import { getCtx, INVITE_COOKIE } from "@/server/session";
import { auth } from "@/server/services/access";
import { overview } from "@/server/services/household";
import { AcceptPanel } from "./AcceptPanel";
import { clearInviteCookieAction } from "@/app/actions";

export default async function InvitePage() {
  const hasToken = Boolean((await cookies()).get(INVITE_COOKIE)?.value);
  const ctx = await getCtx();
  let loggedIn = true;
  try {
    auth(ctx);
  } catch {
    loggedIn = false;
  }
  const o = loggedIn ? overview(ctx) : null;

  return (
    <main className="shell">
      <div className="stack section">
        {/* 초대자 이름·관계 정보는 초대자가 코드를 확인하기 전까지 보여주지 않는다. */}
        <h1>초대 링크예요</h1>
        {!hasToken ? (
          <p className="muted">열린 초대가 없어요. 받은 링크를 다시 열어 주세요.</p>
        ) : !loggedIn ? (
          <>
            <p className="muted">로그인하면 수락 요청을 보낼 수 있어요. 링크를 열기만 해서는 아무것도 연결되지 않아요.</p>
            <Link href="/login" className="btn">로그인하기</Link>
          </>
        ) : o?.householdId ? (
          <>
            <p className="muted">이미 함께 쓰는 공간이 있어서 이 초대를 받을 수 없어요.</p>
            <form action={clearInviteCookieAction}>
              <button className="btn btn-secondary" type="submit">초대 링크 지우고 홈으로</button>
            </form>
          </>
        ) : (
          <AcceptPanel />
        )}
      </div>
    </main>
  );
}
