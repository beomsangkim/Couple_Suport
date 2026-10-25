"use client";

import Link from "next/link";
import { useRef } from "react";
import { approveAction, cancelProposalAction, withdrawAction } from "@/app/actions";
import { useAction } from "./ActionProvider";

export function ApproveButtons(p: {
  versionId: string;
  contentHash: string;
  approvedByMe: boolean;
  createdByMe: boolean;
  isMoney: boolean;
  reviseHref: string;
}) {
  const { run, pending } = useAction();
  if (p.approvedByMe) {
    return (
      <div className="stack-sm">
        <p className="small">제안을 보냈어요. 두 사람이 동의하면 적용돼요.</p>
        {p.createdByMe && (
          <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => cancelProposalAction(p.versionId), { success: "제안을 거뒀어요." })}>
            제안 거두기
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="stack-sm">
      <button
        className="btn btn-block"
        disabled={pending}
        // 화면이 받은 내용 해시를 함께 보낸다. 그 사이 내용이 바뀌었으면 서버가 거부한다.
        onClick={() => run(() => approveAction(p.versionId, p.contentHash), { success: "동의했어요." })}
      >
        {p.isMoney ? "이 비율로 동의하기" : "이 내용에 동의하기"}
      </button>
      <Link href={p.reviseHref} className="btn btn-secondary btn-block">수정 제안하기</Link>
      <Link href="/agreements" className="btn btn-ghost btn-block">나중에 보기</Link>
    </div>
  );
}

export function WithdrawButton({ versionId, isMoney }: { versionId: string; isMoney: boolean }) {
  const { run, pending } = useAction();
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => ref.current?.showModal()}>
        이 약속 철회하기
      </button>
      <dialog ref={ref} aria-labelledby={`wd-${versionId}`}>
        <div className="stack">
          <h2 id={`wd-${versionId}`}>약속을 철회할까요?</h2>
          <p className="muted">
            상대의 동의 없이 바로 철회돼요. 철회 사실은 상대에게 알려져요.
            {isMoney && " 앞으로 기록하는 지출은 기본 분담 없이 매번 직접 정하게 돼요. 이미 기록하거나 정산한 지출은 바뀌지 않아요."}
          </p>
          <button
            className="btn btn-danger btn-block"
            disabled={pending}
            onClick={async () => {
              const r = await run(() => withdrawAction(versionId), { success: "약속을 철회했어요." });
              if (r.ok) ref.current?.close();
            }}
          >
            철회하기
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => ref.current?.close()}>
            그대로 두기
          </button>
        </div>
      </dialog>
    </>
  );
}
