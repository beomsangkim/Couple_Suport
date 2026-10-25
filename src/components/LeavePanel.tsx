"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { leaveHouseholdAction } from "@/app/actions";
import { useAction } from "./ActionProvider";

/** 연결 해제는 상대 동의 없이, 단계 인증 없이 할 수 있다. 빠져나가는 길에 장애물을 두지 않는다. */
export function LeavePanel({ hasPartner }: { hasPartner: boolean }) {
  const { run, pending } = useAction();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [redactText, setRedactText] = useState(false);
  const [blockPartner, setBlockPartner] = useState(false);

  return (
    <div className="panel stack-sm">
      <p className="small">
        상대의 허락 없이 언제든 연결을 끊을 수 있어요. 계정은 그대로 남아요.
      </p>
      <button className="btn btn-danger" onClick={() => ref.current?.showModal()}>
        연결 해제하기
      </button>
      <dialog ref={ref} aria-labelledby="leave-dialog-title">
        <div className="stack">
          <h2 id="leave-dialog-title">연결을 해제할까요?</h2>
          <ul className="small">
            <li>두 사람 모두 공동 기록에 더 이상 쓸 수 없어요.</li>
            <li>종료 시점의 기록은 두 사람이 30일 동안 읽기만 할 수 있고, 그 뒤 삭제돼요.</li>
            <li>이미 본 화면이나 내려받은 파일은 회수할 수 없어요.</li>
          </ul>
          {hasPartner && (
            <>
              <label className="check">
                <input type="checkbox" checked={redactText} onChange={(e) => setRedactText(e.target.checked)} />
                <span>지출 설명·약속 본문 같은 글은 지금 바로 숨기기 (금액·날짜만 남아요)</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={blockPartner} onChange={(e) => setBlockPartner(e.target.checked)} />
                <span>이 사람이 보내는 초대를 받지 않기</span>
              </label>
            </>
          )}
          <button
            className="btn btn-danger btn-block"
            disabled={pending}
            onClick={async () => {
              const r = await run(() => leaveHouseholdAction({ redactText, blockPartner }), { success: "연결을 해제했어요." });
              if (r.ok) {
                ref.current?.close();
                router.push("/ended");
              }
            }}
          >
            해제하기
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => ref.current?.close()}>
            취소
          </button>
          <p className="small muted">
            관계 속에서 불안하거나 위험하다고 느낀다면 여성긴급전화 1366(24시간)에서 상담을 받을 수 있어요.
          </p>
        </div>
      </dialog>
    </div>
  );
}
