// 금액 계산. 원 단위 정수만 다루고 부동소수점 결과를 저장하지 않는다.

export type Shares = Record<string, number>;

/**
 * total을 weights 비율로 나눈다.
 * 결제자가 아닌 사람의 몫은 내림하고, 나머지(1원 단위 오차)는 결제자가 부담한다.
 * 이미 돈을 낸 사람이 더 돌려받는 방향의 오차를 피하기 위한 규칙이다.
 */
export function splitAmount(total: number, weights: Record<string, number>, payerId: string): Shares {
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("total must be a positive integer");
  const ids = Object.keys(weights);
  if (!ids.includes(payerId)) throw new Error("payer must be a participant");
  const sum = ids.reduce((s, id) => s + (weights[id] ?? 0), 0);
  if (sum <= 0 || ids.some((id) => !Number.isSafeInteger(weights[id]) || weights[id]! < 0)) {
    throw new Error("weights must be non-negative integers");
  }

  const shares: Shares = {};
  let assigned = 0;
  for (const id of ids) {
    if (id === payerId) continue;
    // BigInt로 곱셈 오버플로를 피한다. BigInt 나눗셈은 내림이다.
    const share = Number((BigInt(total) * BigInt(weights[id]!)) / BigInt(sum));
    shares[id] = share;
    assigned += share;
  }
  shares[payerId] = total - assigned;
  return shares;
}

/** 지출 목록에서 누가 누구에게 얼마를 보내야 하는지 계산한다(두 사람 기준). */
export function netBalance(
  expenses: { amount: number; paidBy: string; shares: Shares }[],
  members: [string, string],
): { from: string; to: string; amount: number } | null {
  const [a, b] = members;
  // a가 b에게 받을 돈(양수) / 줄 돈(음수)
  let aToReceive = 0;
  for (const e of expenses) {
    if (e.paidBy === a) aToReceive += e.shares[b] ?? 0;
    else if (e.paidBy === b) aToReceive -= e.shares[a] ?? 0;
  }
  if (aToReceive === 0) return null;
  return aToReceive > 0 ? { from: b, to: a, amount: aToReceive } : { from: a, to: b, amount: -aToReceive };
}

export function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
