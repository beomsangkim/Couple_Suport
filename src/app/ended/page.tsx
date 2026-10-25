import Link from "next/link";
import { redirect } from "next/navigation";
import { load } from "@/server/page";
import { endedSnapshot, overview } from "@/server/services/household";
import { formatWon } from "@/lib/money";
import { describeContent, formatDate } from "@/components/agreement-format";
import { ExportButton } from "@/components/AccountPanels";
import { CreateHouseholdButton } from "@/app/start/CreateHouseholdButton";
import { logoutAction } from "@/app/actions";

export default async function EndedPage() {
  const { o, snap } = await load((ctx) => ({ o: overview(ctx), snap: endedSnapshot(ctx) }));
  if (o.householdId) redirect("/");

  return (
    <main className="shell">
      <div className="stack section">
        <h1>함께 쓰던 공간이 종료됐어요</h1>
        {!snap ? (
          <p className="muted">볼 수 있는 이전 기록이 없어요.</p>
        ) : (
          <>
            <div className="notice">
              {formatDate(snap.readableUntil)}까지 읽기만 할 수 있어요. 그 뒤에는 삭제돼요.
              {snap.redacted && " 글 내용은 숨겨져 있어요."}
            </div>
            <ExportButton />
            <section aria-labelledby="ended-ag">
              <h2 id="ended-ag">약속</h2>
              {snap.agreements.length === 0 && <p className="muted small">남은 약속이 없어요.</p>}
              <ul className="list">
                {snap.agreements.map((a) => (
                  <li key={a.title + a.history[0]?.versionId} className="stack-sm">
                    <strong>{a.title}</strong>
                    <span className="small muted">{a.history[0] ? describeContent(a.history[0].content, snap.members) : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="ended-ex">
              <h2 id="ended-ex">지출</h2>
              {snap.expenses.length === 0 && <p className="muted small">남은 지출 기록이 없어요.</p>}
              <ul className="list">
                {snap.expenses.map((e) => (
                  <li key={e.id} className="row-between">
                    <span>
                      {e.description} <span className="small muted">{e.spentOn}</span>
                    </span>
                    <span className="num small">
                      {formatWon(e.amount)} · 내 부담 {formatWon(e.myShare)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        <div className="panel stack-sm">
          <h2>새로 시작하기</h2>
          <p className="small muted">새 공간에는 이전 기록이 옮겨지지 않아요.</p>
          <CreateHouseholdButton />
        </div>
        <Link href="/talk" className="btn btn-ghost">대화 카드</Link>
        <form action={logoutAction}>
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
