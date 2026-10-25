"use client";

import { useMemo, useState } from "react";
import type { MemberView } from "@/server/services/views";
import { createExpenseAction, updateExpenseAction } from "@/app/actions";
import { formatWon, splitAmount } from "@/lib/money";
import { useAction } from "./ActionProvider";

type Mode = "rule" | "equal" | "custom";

interface Props {
  members: MemberView[];
  defaultRule: { weights: Record<string, number> } | null;
  today: string;
  editing?: { id: string; version: number; amount: number; description: string; paidBy: string; spentOn: string; myShare: number; byRule: boolean };
  onDone?: () => void;
}

function newKey() {
  return crypto.randomUUID();
}

export function ExpenseForm({ members, defaultRule, today, editing, onDone }: Props) {
  const { run, pending } = useAction();
  const me = members.find((m) => m.isMe)!;
  const partner = members.find((m) => !m.isMe)!;
  // 입력값은 문자열 그대로 보존한다(오류가 나도 지우지 않음).
  const [amountRaw, setAmountRaw] = useState(editing ? String(editing.amount) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? me.id);
  const [spentOn, setSpentOn] = useState(editing?.spentOn ?? today);
  const [mode, setMode] = useState<Mode>(editing ? (editing.byRule && defaultRule ? "rule" : "custom") : defaultRule ? "rule" : "equal");
  const [myShareRaw, setMyShareRaw] = useState(editing ? String(editing.myShare) : "");
  const [idempotencyKey, setKey] = useState(newKey);

  const amount = Number(amountRaw.replace(/[^\d]/g, ""));
  const myShare = Number(myShareRaw.replace(/[^\d]/g, ""));
  const amountError = amountRaw && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000) ? "1원부터 1억 원까지 입력할 수 있어요." : null;
  const shareError = mode === "custom" && myShareRaw && myShare > amount ? "내 부담이 전체 금액보다 클 수 없어요." : null;

  // 기본값이 누가 얼마를 부담하게 하는지 저장 전에 보여준다.
  const preview = useMemo(() => {
    if (!amount || amountError) return null;
    try {
      const weights =
        mode === "rule" && defaultRule
          ? defaultRule.weights
          : mode === "equal"
            ? { [me.id]: 1, [partner.id]: 1 }
            : { [me.id]: myShare, [partner.id]: Math.max(0, amount - myShare) };
      return splitAmount(amount, weights, paidBy);
    } catch {
      return null;
    }
  }, [amount, amountError, mode, defaultRule, me.id, partner.id, myShare, paidBy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      amount,
      description,
      paidBy,
      spentOn,
      split: mode === "custom" ? { mode, myShare } : { mode },
    } as const;
    const r = editing
      ? await run(() => updateExpenseAction(editing.id, editing.version, input), { success: "지출을 고쳤어요." })
      : await run(() => createExpenseAction({ ...input, idempotencyKey }), { success: "지출을 기록했어요." });
    if (r.ok) {
      if (!editing) {
        setAmountRaw("");
        setDescription("");
        setMyShareRaw("");
        setKey(newKey());
      }
      onDone?.();
    }
  };

  const idp = editing ? `edit-${editing.id}` : "new";

  return (
    <form className="panel stack" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${idp}-amount`}>금액</label>
        <div className="money-input">
          <input
            id={`${idp}-amount`}
            inputMode="numeric"
            autoComplete="off"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            aria-invalid={Boolean(amountError)}
            aria-describedby={amountError ? `${idp}-amount-err` : undefined}
            placeholder="0"
            required
          />
          <span aria-hidden="true">원</span>
        </div>
        {amountError && <p id={`${idp}-amount-err`} className="error-text">{amountError}</p>}
      </div>

      <div className="field">
        <label htmlFor={`${idp}-desc`}>내용</label>
        <input id={`${idp}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={80} placeholder="예: 주말 장보기" required />
      </div>

      <fieldset className="field">
        <legend className="small"><strong>결제한 사람</strong></legend>
        <div className="segmented">
          {[me, partner].map((m) => (
            <button type="button" key={m.id} aria-pressed={paidBy === m.id} onClick={() => setPaidBy(m.id)}>
              {m.isMe ? "나" : m.displayName}
            </button>
          ))}
        </div>
      </fieldset>

      <details>
        <summary>날짜·분담 방식 바꾸기</summary>
        <div className="stack">
          <div className="field">
            <label htmlFor={`${idp}-date`}>날짜</label>
            <input id={`${idp}-date`} type="date" value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} />
          </div>
          <fieldset className="field">
            <legend className="small"><strong>나누는 방식</strong></legend>
            <div className="segmented">
              {defaultRule && (
                <button type="button" aria-pressed={mode === "rule"} onClick={() => setMode("rule")}>약속대로</button>
              )}
              <button type="button" aria-pressed={mode === "equal"} onClick={() => setMode("equal")}>반반</button>
              <button type="button" aria-pressed={mode === "custom"} onClick={() => setMode("custom")}>직접 정하기</button>
            </div>
          </fieldset>
          {mode === "custom" && (
            <div className="field">
              <label htmlFor={`${idp}-myshare`}>이번 지출에서 내 부담</label>
              <div className="money-input">
                <input id={`${idp}-myshare`} inputMode="numeric" autoComplete="off" value={myShareRaw} onChange={(e) => setMyShareRaw(e.target.value)} aria-invalid={Boolean(shareError)} />
                <span aria-hidden="true">원</span>
              </div>
              {shareError && <p className="error-text">{shareError}</p>}
            </div>
          )}
        </div>
      </details>

      {preview && (
        <p className="small" aria-live="polite">
          {[me, partner].map((m) => `${m.isMe ? "나" : m.displayName} ${formatWon(preview[m.id] ?? 0)}`).join(" · ")} 부담
          {mode === "rule" ? " (적용 중인 약속 기준)" : ""}
        </p>
      )}

      <div className="row">
        <button className="btn btn-block" disabled={pending || !amount || Boolean(amountError) || Boolean(shareError) || !description.trim()}>
          {editing ? "고친 내용 저장하기" : "기록하기"}
        </button>
        {editing && (
          <button type="button" className="btn btn-secondary" onClick={onDone}>취소</button>
        )}
      </div>
    </form>
  );
}
