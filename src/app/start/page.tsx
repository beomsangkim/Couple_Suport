import Link from "next/link";
import { redirect } from "next/navigation";
import { load } from "@/server/page";
import { overview } from "@/server/services/household";
import { CreateHouseholdButton } from "./CreateHouseholdButton";
import { logoutAction } from "@/app/actions";

export default async function StartPage() {
  const o = await load(overview);
  if (o.householdId) redirect("/");
  return (
    <main className="shell">
      <div className="stack section">
        <h1>{o.me.displayName} 님, 반가워요</h1>
        <p className="muted">함께 사는 사람과 생활비·집안일·생활 약속을 정리하는 공간을 만들어요.</p>
        <div className="panel stack">
          <h2>함께 쓸 공간 만들기</h2>
          <p className="muted small">공간을 만든 뒤 함께 사용할 사람을 초대할 수 있어요. 지금 초대하지 않아도 괜찮아요.</p>
          <CreateHouseholdButton />
        </div>
        <div className="panel stack-sm">
          <h2>초대를 받았나요?</h2>
          <p className="muted small">받은 초대 링크를 이 브라우저에서 열어 주세요.</p>
        </div>
        {o.endedSnapshotUntil && (
          <Link href="/ended" className="btn btn-secondary">종료된 공간 기록 보기</Link>
        )}
        <Link href="/talk" className="btn btn-ghost">대화 카드 둘러보기</Link>
        <form action={logoutAction}>
          <button className="btn btn-ghost" type="submit">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
