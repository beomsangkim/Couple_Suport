import Link from "next/link";
import { load } from "@/server/page";
import { overview } from "@/server/services/household";
import { listAgreements, type AgreementView } from "@/server/services/agreements";
import { describeContent } from "@/components/agreement-format";

export default async function AgreementsPage() {
  const { o, list } = await load((ctx) => {
    const o = overview(ctx);
    return { o, list: o.partner ? listAgreements(ctx) : [] };
  });

  if (!o.partner) {
    return (
      <div className="stack">
        <h1>우리의 약속</h1>
        <p className="muted">함께 사용할 사람이 연결되면 약속을 제안하고 함께 정할 수 있어요.</p>
        <Link href="/settings#invite" className="btn">함께 사용할 사람 초대하기</Link>
      </div>
    );
  }

  const groups: { title: string; items: AgreementView[] }[] = [
    { title: "합의 중", items: list.filter((a) => a.state === "pending") },
    { title: "적용 중·적용 예정", items: list.filter((a) => a.state === "active" || a.state === "scheduled") },
    { title: "철회·종료", items: list.filter((a) => a.state === "withdrawn" || a.state === "ended") },
  ];

  return (
    <div className="stack">
      <div className="row-between">
        <h1>우리의 약속</h1>
      </div>
      <div className="row wrap">
        <Link href="/agreements/new?template=split" className="btn">생활비 나누기 제안</Link>
        <Link href="/agreements/new?template=text" className="btn btn-secondary">다른 약속 제안</Link>
      </div>
      <p className="small muted">
        약속을 바꾸려면 두 사람이 모두 동의해야 해요. 철회는 한 사람이 혼자서 언제든 할 수 있어요.
      </p>

      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <section key={g.title} className="section" aria-label={g.title}>
            <h2>{g.title}</h2>
            <ul className="list">
              {g.items.map((a) => {
                const shown = a.pending ?? a.current ?? a.scheduled ?? a.history[0]!;
                return (
                  <li key={a.agreementId}>
                    <Link href={`/agreements/${a.agreementId}`} className="stack-sm plain-link">
                      <span className="row-between">
                        <strong>{a.title}</strong>
                        <StateBadge a={a} />
                      </span>
                      <span className="small muted">{describeContent(shown.content, o.members)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}

      <section className="section panel stack-sm">
        <h2>대화 카드</h2>
        <p className="small muted">기록으로 남기지 않고 둘이 이야기해 볼 주제들이에요. 카드를 열어도 아무것도 저장되지 않아요.</p>
        <Link href="/talk" className="btn btn-secondary">대화 카드 보기</Link>
      </section>
    </div>
  );
}

function StateBadge({ a }: { a: AgreementView }) {
  if (a.state === "pending") {
    return a.pending!.approvedByMe ? (
      <span className="badge">상대의 답변을 기다려요</span>
    ) : (
      <span className="badge badge-accent">내 답변을 기다려요</span>
    );
  }
  if (a.state === "active") return <span className="badge badge-accent">적용 중</span>;
  if (a.state === "scheduled") return <span className="badge">적용 예정</span>;
  if (a.state === "withdrawn") return <span className="badge badge-warn">철회됨</span>;
  return <span className="badge">종료</span>;
}
