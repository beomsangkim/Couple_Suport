import Link from "next/link";
import { formatWon } from "@/lib/money";
import { load } from "@/server/page";
import { overview } from "@/server/services/household";
import { listAgreements } from "@/server/services/agreements";
import { monthSummary } from "@/server/services/expenses";
import { listTasks } from "@/server/services/tasks";
import { today } from "@/server/services/access";
import { TaskItem } from "@/components/TaskItem";
import { AddTaskForm } from "@/components/AddTaskForm";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function HomePage() {
  const data = await load((ctx) => {
    const o = overview(ctx);
    const t = today(ctx);
    return {
      o,
      t,
      agreements: o.partner ? listAgreements(ctx) : [],
      money: o.partner ? monthSummary(ctx, t.slice(0, 7)) : null,
      tasks: listTasks(ctx),
    };
  });
  const { o, t, agreements, money, tasks } = data;
  const nameOf = (id: string) => o.members.find((m) => m.id === id);
  const waiting = agreements.filter((a) => a.pending && !a.pending.approvedByMe);
  const swapsForMe = tasks.filter((x) => x.swapRequest?.waitingForMe);
  const todayTasks = tasks.filter((x) => x.dueToday);
  const otherTasks = tasks.filter((x) => !x.dueToday);
  const d = new Date(`${t}T00:00:00Z`);

  return (
    <div className="stack">
      <h1>
        {d.getUTCMonth() + 1}월 {d.getUTCDate()}일 {WEEKDAYS[d.getUTCDay()]}요일
      </h1>

      {!o.partner && (
        <div className="notice">
          아직 혼자 쓰고 있어요. <Link href="/settings#invite">함께 사용할 사람 초대하기</Link>
        </div>
      )}

      {(waiting.length > 0 || swapsForMe.length > 0) && (
        <section aria-labelledby="todo-confirm" className="panel stack-sm">
          <h2 id="todo-confirm">확인할 항목</h2>
          {waiting.map((a) => (
            <Link key={a.agreementId} href={`/agreements/${a.agreementId}`} className="row-between">
              <span>‘{a.title}’ 제안</span>
              <span className="badge badge-accent">내 답변을 기다려요</span>
            </Link>
          ))}
          {swapsForMe.map((x) => (
            <p key={x.id}>‘{x.title}’ 담당을 바꿔달라는 요청이 있어요. 아래 할 일에서 답할 수 있어요.</p>
          ))}
        </section>
      )}

      <section aria-labelledby="today-tasks" className="section">
        <h2 id="today-tasks">오늘 할 일</h2>
        {todayTasks.length === 0 ? (
          <p className="muted">오늘은 정해진 집안일이 없어요.</p>
        ) : (
          <ul className="list">
            {todayTasks.map((x) => (
              <TaskItem key={x.id} task={x} assignee={nameOf(x.assignee)!} hasPartner={Boolean(o.partner)} />
            ))}
          </ul>
        )}
        <details className="section">
          <summary>다른 날 할 일 {otherTasks.length}개</summary>
          <ul className="list">
            {otherTasks.map((x) => (
              <TaskItem key={x.id} task={x} assignee={nameOf(x.assignee)!} hasPartner={Boolean(o.partner)} />
            ))}
          </ul>
        </details>
        <details>
          <summary>집안일 추가하기</summary>
          <AddTaskForm members={o.members} />
        </details>
      </section>

      {money && (
        <section aria-labelledby="month-money" className="section">
          <h2 id="month-money">이번 달 생활비</h2>
          <Link href="/money" className="panel stack-sm plain-link">
            <span className="muted small">아직 정산하지 않은 공동 지출</span>
            <span className="big-number">{formatWon(money.total)}</span>
            <span>
              내 부담 <strong className="num">{formatWon(money.myShareTotal)}</strong>
            </span>
            {money.balance && (
              <span className="muted small">
                {nameOf(money.balance.from)?.isMe ? "내가" : `${nameOf(money.balance.from)?.displayName} 님이`}{" "}
                {nameOf(money.balance.to)?.isMe ? "나에게" : `${nameOf(money.balance.to)?.displayName} 님에게`}{" "}
                {formatWon(money.balance.amount)} 보내면 정산돼요
              </span>
            )}
          </Link>
          <Link href="/money#add" className="btn btn-block section">지출 기록하기</Link>
        </section>
      )}
    </div>
  );
}
