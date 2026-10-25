"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberView } from "@/server/services/views";
import type { AgreementContent } from "@/server/types";
import { proposeAction } from "@/app/actions";
import { formatWon, splitAmount } from "@/lib/money";
import { useAction } from "./ActionProvider";
import { IncomeCalculator } from "./IncomeCalculator";
import { describeContent, formatDate } from "./agreement-format";

type Kind = "equal" | "ratio" | "amount";

interface Props {
  template: "split" | "text";
  agreementId: string | null;
  members: MemberView[];
  today: string;
  defaultEffective: string;
  base: { title: string; content: AgreementContent } | null;
}

export function ProposeForm({ template, agreementId, members, today, defaultEffective, base }: Props) {
  const router = useRouter();
  const { run, pending } = useAction();
  const me = members.find((m) => m.isMe)!;
  const partner = members.find((m) => !m.isMe)!;

  const baseRule = base?.content.type === "split" ? base.content.rule : null;
  const [kind, setKind] = useState<Kind>(baseRule?.kind ?? "equal");
  const [myPct, setMyPct] = useState(baseRule?.kind === "ratio" ? (baseRule.weights[me.id] ?? 50) : 50);
  const [myAmount, setMyAmount] = useState(baseRule?.kind === "amount" ? String(baseRule.weights[me.id] ?? "") : "");
  const [partnerAmount, setPartnerAmount] = useState(baseRule?.kind === "amount" ? String(baseRule.weights[partner.id] ?? "") : "");

  const [title, setTitle] = useState(template === "split" ? "생활비 나누기" : (base?.title ?? ""));
  const [body, setBody] = useState(base?.content.type === "text" ? base.content.body : "");
  const [effectiveFrom, setEffectiveFrom] = useState(defaultEffective);
  const [reviewOn, setReviewOn] = useState("");

  const num = (s: string) => Number(s.replace(/[^\d]/g, ""));

  const content: AgreementContent | null =
    template === "text"
      ? body.trim()
        ? { type: "text", body: body.trim() }
        : null
      : kind === "equal"
        ? { type: "split", rule: { kind, weights: { [me.id]: 1, [partner.id]: 1 } } }
        : kind === "ratio"
          ? { type: "split", rule: { kind, weights: { [me.id]: myPct, [partner.id]: 100 - myPct } } }
          : num(myAmount) > 0 && num(partnerAmount) > 0
            ? { type: "split", rule: { kind, weights: { [me.id]: num(myAmount), [partner.id]: num(partnerAmount) } } }
            : null;

  const example = 1_000_000;
  const preview =
    content?.type === "split" ? splitAmount(example, content.rule.weights, me.id) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content) return;
    const r = await run(
      () => proposeAction({ agreementId, title: title.trim(), content, effectiveFrom, reviewOn: reviewOn || null }),
      { success: "제안을 보냈어요. 두 사람이 동의하면 적용돼요." },
    );
    if (r.ok) router.push(`/agreements/${r.data.agreementId}`);
  };

  return (
    <form className="stack" onSubmit={submit}>
      {template === "split" ? (
        <>
          <div className="segmented" role="group" aria-label="나누는 방식">
            <button type="button" aria-pressed={kind === "equal"} onClick={() => setKind("equal")}>반반 나누기</button>
            <button type="button" aria-pressed={kind === "ratio"} onClick={() => setKind("ratio")}>비율 정하기</button>
            <button type="button" aria-pressed={kind === "amount"} onClick={() => setKind("amount")}>금액 정하기</button>
          </div>

          {kind === "ratio" && (
            <div className="panel stack">
              <div className="pair">
                {[me, partner].map((m) => (
                  <div key={m.id} className="stack-sm">
                    <span className="small muted">{m.isMe ? "나" : m.displayName}</span>
                    <span className="big-number">{m.isMe ? myPct : 100 - myPct}%</span>
                  </div>
                ))}
              </div>
              <div className="row">
                <button type="button" className="btn btn-secondary btn-block" onClick={() => setMyPct((p) => Math.max(5, p - 5))} disabled={myPct <= 5} aria-label="내 비율 5% 줄이기">
                  내 비율 −5%
                </button>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => setMyPct((p) => Math.min(95, p + 5))} disabled={myPct >= 95} aria-label="내 비율 5% 늘리기">
                  내 비율 +5%
                </button>
              </div>
              <p className="small muted" aria-live="polite">비율은 5% 단위로 정해요.</p>
              <IncomeCalculator onApply={setMyPct} partnerName={partner.displayName} />
            </div>
          )}

          {kind === "amount" && (
            <div className="panel stack">
              <p className="small muted">한 달 공동생활비를 각자 얼마씩 낼지 정해요. 지출은 이 금액의 비율로 나눠요.</p>
              {[
                { id: "amt-me", label: "내가 낼 금액", value: myAmount, set: setMyAmount },
                { id: "amt-partner", label: `${partner.displayName} 님이 낼 금액`, value: partnerAmount, set: setPartnerAmount },
              ].map((f) => (
                <div className="field" key={f.id}>
                  <label htmlFor={f.id}>{f.label}</label>
                  <div className="money-input">
                    <input id={f.id} inputMode="numeric" autoComplete="off" value={f.value} onChange={(e) => f.set(e.target.value)} />
                    <span aria-hidden="true">원</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {preview && (
            <div className="panel stack-sm" aria-live="polite">
              <span className="small muted">공동생활비가 {formatWon(example)}이라면</span>
              <div className="pair">
                {[me, partner].map((m) => (
                  <div key={m.id}>
                    <span className="small muted">{m.isMe ? "나" : m.displayName}</span>
                    <div className="num"><strong>{formatWon(preview[m.id] ?? 0)}</strong></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="ag-title">약속 이름</label>
            <input id="ag-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="예: 손님 초대" required />
          </div>
          <div className="field">
            <label htmlFor="ag-body">내용</label>
            <textarea id="ag-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="예: 친구를 재우기 전에는 하루 전까지 서로 물어봐요." aria-describedby="ag-body-hint" required />
            <p id="ag-body-hint" className="hint">
              서로의 경계를 적어 주세요. 상대의 행동을 확인하거나 감시하는 약속은 권하지 않아요. 건강·성생활처럼 민감한 내용은 적지 않는 것을 권해요.
            </p>
          </div>
        </>
      )}

      <details>
        <summary>적용일·다시 이야기할 날</summary>
        <div className="stack">
          <div className="field">
            <label htmlFor="ag-from">적용 시작일</label>
            <input id="ag-from" type="date" value={effectiveFrom} min={today} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ag-review">다시 이야기할 날 (선택)</label>
            <input id="ag-review" type="date" value={reviewOn} min={effectiveFrom} onChange={(e) => setReviewOn(e.target.value)} />
          </div>
        </div>
      </details>

      {content && (
        <section className="panel stack-sm" aria-label="보내기 전 확인">
          <h2>보내기 전에 확인해 주세요</h2>
          <p className="small">받는 사람: {partner.displayName}</p>
          <p className="small">내용: {describeContent(content, members)}</p>
          <p className="small">적용 시작일: {formatDate(effectiveFrom)}</p>
          <p className="small muted">상대가 동의하기 전까지는 지금 약속이 그대로 유지돼요.</p>
        </section>
      )}

      <button className="btn btn-block" disabled={pending || !content || !title.trim()}>
        이 내용으로 제안하기 (나는 동의해요)
      </button>
    </form>
  );
}
