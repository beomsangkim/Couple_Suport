import Link from "next/link";
import { load } from "@/server/page";
import { myOpenInvitation, myProfile, overview } from "@/server/services/household";
import { listSessions } from "@/server/services/auth";
import { ProfileForm } from "@/components/ProfileForm";
import { InvitePanel } from "@/components/InvitePanel";
import { SessionsPanel, ExportButton } from "@/components/AccountPanels";
import { LeavePanel } from "@/components/LeavePanel";
import { logoutAction } from "@/app/actions";
import { Person } from "@/components/Avatar";

export default async function SettingsPage() {
  const d = await load((ctx) => ({
    o: overview(ctx),
    profile: myProfile(ctx),
    invitation: myOpenInvitation(ctx),
    sessions: listSessions(ctx),
  }));

  return (
    <div className="stack">
      <h1>설정</h1>

      <section className="section" aria-labelledby="profile-title">
        <h2 id="profile-title">내 정보</h2>
        <ProfileForm displayName={d.profile.displayName} color={d.profile.color} colors={[...d.profile.colors]} />
        <p className="small muted">
          이메일({d.profile.email})은 나에게만 보여요. 함께하는 사람에게는 표시 이름과 색만 보여요.
        </p>
      </section>

      <section id="invite" className="section" aria-labelledby="partner-title">
        <h2 id="partner-title">함께하는 사람</h2>
        {d.o.partner ? (
          <div className="panel row-between">
            <Person name={d.o.partner.displayName} color={d.o.partner.color} />
            <span className="small muted">같은 권한으로 함께 사용 중</span>
          </div>
        ) : (
          <InvitePanel invitation={d.invitation} />
        )}
      </section>

      <section className="section" aria-labelledby="sessions-title">
        <h2 id="sessions-title">로그인한 기기</h2>
        <SessionsPanel sessions={d.sessions} />
      </section>

      <section className="section stack-sm" aria-labelledby="data-title">
        <h2 id="data-title">내 데이터</h2>
        <p className="small muted">내가 볼 수 있는 기록만 내려받아요. 상대의 개인 정보는 포함되지 않아요.</p>
        <ExportButton />
      </section>

      <section className="section stack-sm" aria-labelledby="notify-title">
        <h2 id="notify-title">알림 미리보기</h2>
        <p className="small muted">
          잠금 화면 알림에는 ‘확인할 항목이 있어요’만 표시해요. 이름·금액·약속 내용은 앱을 열어야 보여요. (프로토타입에는 알림 발송이 없어요)
        </p>
      </section>

      <section className="section" aria-labelledby="leave-title">
        <h2 id="leave-title">연결 해제</h2>
        <LeavePanel hasPartner={Boolean(d.o.partner)} />
      </section>

      <section className="section stack-sm">
        <Link href="/talk" className="btn btn-secondary">대화 카드</Link>
        <form action={logoutAction}>
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </section>
    </div>
  );
}
