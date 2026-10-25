"use client";

import { useState } from "react";
import { roundedIncomeRatio } from "@/lib/income";

/**
 * 소득에 맞춰 나누기 계산기.
 * - 입력값은 이 컴포넌트의 메모리에만 있고 서버·로그·URL로 보내지 않는다.
 * - 결과는 5% 단위로 반올림한 비율만 넘긴다. 약속에는 '비율'로만 남고 계산 방식은 남지 않는다.
 */
export function IncomeCalculator({ onApply, partnerName }: { onApply: (myPct: number) => void; partnerName: string }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState("");
  const [theirs, setTheirs] = useState("");
  const a = Number(mine.replace(/[^\d]/g, ""));
  const b = Number(theirs.replace(/[^\d]/g, ""));
  const result = a > 0 && b > 0 ? roundedIncomeRatio(a, b) : null;

  const clear = () => {
    setMine("");
    setTheirs("");
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        소득에 맞춰 계산해 보기
      </button>
    );
  }

  return (
    <div className="stack" role="group" aria-labelledby="income-title">
      <h3 id="income-title">소득에 맞춰 계산해 보기</h3>
      <div className="notice notice-warn small">
        소득은 저장하지 않고 이 화면에서만 계산해요. 다만 나눌 비율을 보면 서로의 소득 차이를 짐작할 수 있어요.
      </div>
      <div className="field">
        <label htmlFor="inc-me">내 월 소득</label>
        <div className="money-input">
          <input id="inc-me" inputMode="numeric" autoComplete="off" value={mine} onChange={(e) => setMine(e.target.value)} />
          <span aria-hidden="true">원</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="inc-partner">{partnerName} 님 월 소득</label>
        <div className="money-input">
          <input id="inc-partner" inputMode="numeric" autoComplete="off" value={theirs} onChange={(e) => setTheirs(e.target.value)} />
          <span aria-hidden="true">원</span>
        </div>
        <p className="hint">상대에게 직접 들은 금액을 넣어 주세요.</p>
      </div>
      {result && (
        <p aria-live="polite">
          나 <strong>{result[0]}%</strong> · {partnerName} <strong>{result[1]}%</strong> (5% 단위로 반올림)
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="btn btn-block"
          disabled={!result}
          onClick={() => {
            if (result) onApply(result[0]);
            clear();
            setOpen(false);
          }}
        >
          이 비율 쓰기
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            clear();
            setOpen(false);
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
