"use client";

import type { MonthSummary } from "@/server/services/expenses";
import type { MemberView } from "@/server/services/views";
import { confirmSettlementAction, startSettlementAction } from "@/app/actions";
import { formatWon } from "@/lib/money";
import { useAction } from "./ActionProvider";

export function SettlementPanel({ summary: s, members }: { summary: MonthSummary; members: MemberView[] }) {
  const { run, pending } = useAction();
  const name = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m?.isMe ? "나" : `${m?.displayName ?? "이전 구성원"} 님`;
  };
  const open = s.expenses.filter((e) => !e.settled).length;
  const settlement = s.settlement?.status === "pending" ? s.settlement : null;

  if (open === 0) {
    return s.settledCount > 0 ? <div className="notice">이 달 지출은 두 사람이 모두 확인해 정산을 확정했어요.</div> : null;
  }

  return (
    <section className="panel stack" aria-labelledby="settle-title">
      <h2 id="settle-title">정산</h2>
      {s.balance ? (
        <p>
          {name(s.balance.from) === "나" ? "내가 " : `${name(s.balance.from)}이 `}
          {name(s.balance.to) === "나" ? "나에게 " : `${name(s.balance.to)}에게 `}
          <strong className="num">{formatWon(s.balance.amount)}</strong>을 보내면 돼요.
        </p>
      ) : (
        <p>서로 보낼 돈이 없어요.</p>
      )}
      {s.disputedCount > 0 && (
        <div className="notice notice-warn">확인 필요 지출 {s.disputedCount}건을 먼저 정리해야 정산을 확정할 수 있어요.</div>
      )}

      {!settlement || settlement.stale ? (
        <>
          {settlement?.stale && <div className="notice notice-warn">확인 이후 지출이 바뀌어서 다시 확인해야 해요.</div>}
          <button
            className="btn"
            disabled={pending || s.disputedCount > 0}
            onClick={() => run(() => startSettlementAction(s.month), { success: "정산 확인을 시작했어요." })}
          >
            이 금액으로 정산 확인 시작하기
          </button>
        </>
      ) : (
        <div className="stack-sm">
          <p className="small">
            나: {settlement.confirmedByMe ? "확인했어요" : "확인 전"} · 상대: {settlement.confirmedByPartner ? "확인했어요" : "확인 전"}
          </p>
          {!settlement.confirmedByMe && (
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                run(() => confirmSettlementAction(settlement.id, settlement.snapshotHash), {
                  success: settlement.confirmedByPartner ? "정산을 확정했어요." : "확인했어요. 상대도 확인하면 확정돼요.",
                })
              }
            >
              이 계산이 맞아요
            </button>
          )}
        </div>
      )}
      <p className="small muted">
        앱은 실제로 돈을 보내거나 입금을 확인하지 않아요. 확정은 두 사람이 같은 계산 결과를 확인했다는 기록이에요.
      </p>
    </section>
  );
}
