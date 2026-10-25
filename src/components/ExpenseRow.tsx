"use client";

import { useState } from "react";
import type { ExpenseView } from "@/server/services/expenses";
import type { MemberView } from "@/server/services/views";
import { deleteExpenseAction, disputeAction } from "@/app/actions";
import { formatWon } from "@/lib/money";
import { useAction } from "./ActionProvider";
import { ExpenseForm } from "./ExpenseForm";

export function ExpenseRow({ expense: e, payer, members, today }: { expense: ExpenseView; payer: MemberView; members: MemberView[]; today: string }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <ExpenseForm
          members={members}
          defaultRule={null}
          today={today}
          editing={{ id: e.id, version: e.version, amount: e.amount, description: e.description, paidBy: e.paidBy, spentOn: e.spentOn, myShare: e.myShare, byRule: false }}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="stack-sm">
      <div className="row-between">
        <div className="stack-sm">
          <strong>{e.description}</strong>
          <span className="small muted">
            {Number(e.spentOn.slice(5, 7))}월 {Number(e.spentOn.slice(8, 10))}일 · {payer.isMe ? "내가" : `${payer.displayName} 님이`} 결제
            {e.byRule ? " · 약속대로" : " · 직접 정함"}
          </span>
        </div>
        <div className="stack-sm">
          <strong className="num">{formatWon(e.amount)}</strong>
          <span className="small muted num">내 부담 {formatWon(e.myShare)}</span>
        </div>
      </div>
      <div className="row wrap">
        {e.settled && <span className="badge">정산 완료</span>}
        {e.disputed && <span className="badge badge-warn">확인 필요</span>}
        {!e.settled && e.createdByMe && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>고치기</button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (confirm(`‘${e.description}’ 지출을 지울까요?`)) run(() => deleteExpenseAction(e.id, e.version), { success: "지출을 지웠어요." });
              }}
            >
              지우기
            </button>
          </>
        )}
        {!e.settled && !e.createdByMe && !e.disputed && (
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => disputeAction(e.id, true), { success: "확인 필요로 표시했어요. 기록한 사람이 고칠 수 있어요." })}>
            확인 필요로 표시
          </button>
        )}
        {!e.settled && e.disputedByMe && (
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => disputeAction(e.id, false))}>
            확인 필요 해제
          </button>
        )}
      </div>
    </li>
  );
}
