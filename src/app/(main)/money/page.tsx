import Link from "next/link";
import { formatWon } from "@/lib/money";
import { load } from "@/server/page";
import { overview } from "@/server/services/household";
import { monthSummary } from "@/server/services/expenses";
import { today } from "@/server/services/access";
import { ExpenseForm } from "@/components/ExpenseForm";
import { ExpenseRow } from "@/components/ExpenseRow";
import { SettlementPanel } from "@/components/SettlementPanel";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const data = await load((ctx) => {
    const t = today(ctx);
    const month = m && /^\d{4}-\d{2}$/.test(m) ? m : t.slice(0, 7);
    const o = overview(ctx);
    return { o, t, month, s: o.partner ? monthSummary(ctx, month) : null };
  });
  const { o, t, month, s } = data;

  if (!s) {
    return (
      <div className="stack">
        <h1>생활비</h1>
        <p className="muted">함께 사용할 사람이 연결되면 공동 지출을 기록하고 나눌 수 있어요.</p>
        <Link href="/settings#invite" className="btn">함께 사용할 사람 초대하기</Link>
      </div>
    );
  }

  const nameOf = (id: string) => o.members.find((x) => x.id === id)!;
  const [y, mm] = month.split("-");
  const isCurrent = month === t.slice(0, 7);

  return (
    <div className="stack">
      <div className="row-between">
        <h1>생활비</h1>
        <nav className="row" aria-label="월 이동">
          <Link className="btn btn-ghost btn-sm" href={`/money?m=${shiftMonth(month, -1)}`} aria-label="이전 달">‹</Link>
          <span className="num">{y}년 {Number(mm)}월</span>
          {!isCurrent && <Link className="btn btn-ghost btn-sm" href={`/money?m=${shiftMonth(month, 1)}`} aria-label="다음 달">›</Link>}
        </nav>
      </div>

      <section className="panel stack-sm" aria-label="이번 달 요약">
        <span className="muted small">정산 전 공동 지출</span>
        <span className="big-number">{formatWon(s.total)}</span>
        <div className="pair">
          {o.members.map((p) => {
            const share = s.expenses.filter((e) => !e.settled).reduce((n, e) => n + (p.isMe ? e.myShare : e.partnerShare), 0);
            return (
              <div key={p.id}>
                <span className="small muted">{p.isMe ? "나" : p.displayName} 부담</span>
                <div className="num"><strong>{formatWon(share)}</strong></div>
              </div>
            );
          })}
        </div>
        <p className="small muted">
          {s.defaultRule
            ? `기본 분담: 적용 중인 약속(${ruleLabel(s.defaultRule, o.members)})`
            : "적용 중인 생활비 약속이 없어요. 지출마다 분담을 직접 정해요."}
        </p>
      </section>

      <SettlementPanel summary={s} members={o.members} />

      <section id="add" aria-labelledby="add-title" className="section">
        <h2 id="add-title">지출 기록하기</h2>
        <ExpenseForm members={o.members} defaultRule={s.defaultRule} today={t} />
      </section>

      <section aria-labelledby="list-title" className="section">
        <h2 id="list-title">지출 내역</h2>
        {s.expenses.length === 0 ? (
          <p className="muted">이 달에 기록한 지출이 없어요.</p>
        ) : (
          <ul className="list">
            {s.expenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} payer={nameOf(e.paidBy)} members={o.members} today={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ruleLabel(rule: { kind: string; weights: Record<string, number> }, members: { id: string; displayName: string; isMe: boolean }[]) {
  if (rule.kind === "equal") return "반반";
  const total = Object.values(rule.weights).reduce((a, b) => a + b, 0);
  return members
    .map((m) => `${m.isMe ? "나" : m.displayName} ${Math.round(((rule.weights[m.id] ?? 0) / total) * 100)}%`)
    .join(" · ");
}
