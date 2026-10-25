"use client";

import { useState } from "react";
import { confirmInvitationAction, createInvitationAction, revokeInvitationAction } from "@/app/actions";
import { useAction } from "./ActionProvider";

export function InvitePanel({ invitation }: { invitation: { id: string; expiresAt: number; hasRequest: boolean } | null }) {
  const { run, pending } = useAction();
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");

  return (
    <div className="panel stack">
      <p className="muted small">
        링크를 받은 사람이 수락 요청을 보내면 그 사람 화면에 6자리 코드가 떠요. 직접 만나거나 통화해서 그 코드를 듣고 여기에 입력해야 연결돼요.
        링크가 다른 사람에게 잘못 전달돼도 코드 없이는 들어올 수 없어요.
      </p>

      {url && (
        <div className="stack-sm">
          <label htmlFor="invite-url">초대 링크 (24시간 동안 한 번 쓸 수 있어요)</label>
          <input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(url)}>
            링크 복사하기
          </button>
          <p className="hint">이 링크는 지금만 보여요. 다시 필요하면 새로 만들어 주세요.</p>
        </div>
      )}

      {invitation?.hasRequest ? (
        <form
          className="stack-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => confirmInvitationAction(invitation.id, code), { success: "연결됐어요. 이제 함께 사용할 수 있어요." });
            if (r.ok) setUrl(null);
          }}
        >
          <div className="notice">수락 요청이 왔어요. 받은 사람에게 화면의 코드를 물어보세요.</div>
          <label htmlFor="invite-code">확인 코드 6자리</label>
          <input
            id="invite-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn" disabled={pending || code.length !== 6}>코드 확인하고 연결하기</button>
        </form>
      ) : invitation ? (
        <p className="small">초대 링크가 열려 있어요. 아직 수락 요청은 없어요.</p>
      ) : null}

      <div className="row wrap">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={async () => {
            const r = await run(() => createInvitationAction());
            if (r.ok) setUrl(r.data.url);
          }}
        >
          {invitation ? "새 링크 만들기 (이전 링크 취소)" : "함께 사용할 사람 초대하기"}
        </button>
        {invitation && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={async () => {
              const r = await run(() => revokeInvitationAction(invitation.id), { success: "초대를 취소했어요." });
              if (r.ok) setUrl(null);
            }}
          >
            초대 취소
          </button>
        )}
      </div>
    </div>
  );
}
