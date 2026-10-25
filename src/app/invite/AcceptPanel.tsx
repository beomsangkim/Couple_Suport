"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearInviteCookieAction, requestAcceptanceAction } from "@/app/actions";
import { useAction } from "@/components/ActionProvider";

export function AcceptPanel() {
  const { run, pending } = useAction();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);

  if (code) {
    return (
      <div className="panel stack">
        <p>초대한 사람에게 이 코드를 직접 알려 주세요.</p>
        <p className="code-display" aria-label={`확인 코드 ${code.split("").join(" ")}`}>{code}</p>
        <p className="small muted">
          초대한 사람이 코드를 입력하면 함께 쓰기 시작해요. 메신저보다 직접 만나거나 통화로 알려 주는 것을 권해요.
        </p>
        <button className="btn" onClick={() => router.push("/")}>연결됐는지 확인하기</button>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <p>수락 요청을 보내면 확인 코드가 나와요. 초대한 사람이 그 코드를 확인해야 연결돼요.</p>
      <p className="small muted">연결되면 공동 지출·약속·집안일을 함께 보게 돼요. 나의 이메일과 로그인 기기는 공유되지 않아요.</p>
      <button
        className="btn"
        disabled={pending}
        onClick={async () => {
          const r = await run(() => requestAcceptanceAction());
          if (r.ok) setCode(r.data.code);
        }}
      >
        수락 요청 보내기
      </button>
      <form action={clearInviteCookieAction}>
        <button className="btn btn-ghost btn-block" type="submit">이 초대 받지 않기</button>
      </form>
    </div>
  );
}
