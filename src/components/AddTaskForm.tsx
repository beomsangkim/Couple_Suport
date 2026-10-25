"use client";

import { useState } from "react";
import type { MemberView } from "@/server/services/views";
import { createTaskAction } from "@/app/actions";
import { useAction } from "./ActionProvider";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function AddTaskForm({ members }: { members: MemberView[] }) {
  const { run, pending } = useAction();
  const me = members.find((m) => m.isMe)!;
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [assignee, setAssignee] = useState(me.id);
  const [days, setDays] = useState<number[]>([]);

  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => createTaskAction({ title, criteria, assignee, weekdays: days }), { success: "집안일을 추가했어요." });
        if (r.ok) {
          setTitle("");
          setCriteria("");
          setDays([]);
        }
      }}
    >
      <div className="field">
        <label htmlFor="task-title">할 일</label>
        <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} required />
      </div>
      <div className="field">
        <label htmlFor="task-criteria">완료 기준</label>
        <input id="task-criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} maxLength={200} placeholder="예: 세탁·건조·개기·수납까지" />
      </div>
      <fieldset className="field">
        <legend className="small"><strong>담당</strong></legend>
        <div className="segmented">
          {members.map((m) => (
            <button type="button" key={m.id} aria-pressed={assignee === m.id} onClick={() => setAssignee(m.id)}>
              {m.isMe ? "나" : m.displayName}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="small"><strong>반복 요일</strong></legend>
        <div className="row wrap">
          {WEEKDAYS.map((w, i) => (
            <label key={w} className="check">
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={(e) => setDays(e.target.checked ? [...days, i] : days.filter((d) => d !== i))}
              />
              {w}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn" disabled={pending || !title || days.length === 0}>추가하기</button>
    </form>
  );
}
