"use client";

import { exportAction, revokeOtherSessionsAction } from "@/app/actions";
import { useAction } from "./ActionProvider";

export function SessionsPanel({ sessions }: { sessions: { id: string; device: string; createdOn: string; current: boolean }[] }) {
  const { run, pending } = useAction();
  return (
    <div className="stack-sm">
      <ul className="list">
        {sessions.map((s) => (
          <li key={s.id} className="row-between">
            <span>{s.device}</span>
            <span className="small muted">{s.current ? "지금 이 기기" : `${s.createdOn} 로그인`}</span>
          </li>
        ))}
      </ul>
      <p className="small muted">정확한 위치나 IP 주소는 보여주지 않아요.</p>
      {sessions.length > 1 && (
        <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => revokeOtherSessionsAction(), { success: "다른 기기에서 로그아웃했어요." })}>
          다른 기기 모두 로그아웃
        </button>
      )}
    </div>
  );
}

export function ExportButton() {
  const { run, pending } = useAction();
  return (
    <button
      className="btn btn-secondary"
      disabled={pending}
      onClick={async () => {
        const r = await run(() => exportAction());
        if (!r.ok) return;
        const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `함께살이-내보내기-${r.data.exportedOn}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
    >
      내 기록 내려받기
    </button>
  );
}
