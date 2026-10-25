"use client";

import type { TaskView } from "@/server/services/tasks";
import type { MemberView } from "@/server/services/views";
import { answerSwapAction, completeTaskAction, requestSwapAction, undoTaskAction } from "@/app/actions";
import { useAction } from "./ActionProvider";
import { Person } from "./Avatar";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function daysLabel(days: number[]) {
  return days.length === 7 ? "매일" : days.map((d) => WEEKDAYS[d]).join("·");
}

export function TaskItem({ task, assignee, hasPartner }: { task: TaskView; assignee: MemberView; hasPartner: boolean }) {
  const { run, pending } = useAction();
  return (
    <li className="stack-sm">
      <div className="row-between">
        <div className="stack-sm">
          <strong>{task.title}</strong>
          <span className="small muted">
            {daysLabel(task.weekdays)} · 완료 기준: {task.criteria || "정하지 않음"}
          </span>
          <Person name={assignee.displayName} color={assignee.color} isMe={assignee.isMe} />
        </div>
        {task.dueToday &&
          (task.doneToday ? (
            task.doneTodayByMe ? (
              <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => undoTaskAction(task.id))}>
                완료 취소
              </button>
            ) : (
              <span className="badge badge-accent">오늘 완료</span>
            )
          ) : (
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() => run(() => completeTaskAction(task.id), { success: `‘${task.title}’ 완료로 기록했어요.` })}
            >
              완료
            </button>
          ))}
      </div>
      {task.swapRequest ? (
        task.swapRequest.waitingForMe ? (
          <div className="notice row-between wrap">
            <span>담당을 바꿔달라는 요청이 있어요.</span>
            <span className="row">
              <button className="btn btn-sm" disabled={pending} onClick={() => run(() => answerSwapAction(task.id, true), { success: "담당을 바꿨어요." })}>
                바꾸기
              </button>
              <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => answerSwapAction(task.id, false))}>
                이번엔 어려워요
              </button>
            </span>
          </div>
        ) : (
          <div className="row-between small muted">
            <span>담당 변경 요청을 보냈어요. 상대가 답하기 전까지 지금 담당이 유지돼요.</span>
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => answerSwapAction(task.id, false))}>
              요청 취소
            </button>
          </div>
        )
      ) : (
        hasPartner && (
          <div>
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => requestSwapAction(task.id), { success: "담당 변경을 요청했어요." })}>
              담당 바꾸기 요청
            </button>
          </div>
        )
      )}
    </li>
  );
}
