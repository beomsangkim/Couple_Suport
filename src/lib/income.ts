// 소득 비례 계산기. 브라우저 메모리에서만 쓰고 서버로 보내지 않는다.
// 결과 비율은 5% 단위로 반올림한다(정밀 비율이 공유되면 상대 소득이 그대로 역산되기 때문).

export const RATIO_STEP = 5;

/** 두 소득으로 A의 부담 비율(%)을 5% 단위로 계산한다. 결과는 [5, 95] 범위. */
export function roundedIncomeRatio(incomeA: number, incomeB: number): [number, number] {
  if (!(incomeA > 0) || !(incomeB > 0)) throw new Error("incomes must be positive");
  const raw = (incomeA / (incomeA + incomeB)) * 100;
  const a = Math.min(95, Math.max(5, Math.round(raw / RATIO_STEP) * RATIO_STEP));
  return [a, 100 - a];
}

export function isValidRatio(a: number, b: number): boolean {
  return (
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a + b === 100 &&
    a >= 5 &&
    b >= 5 &&
    a % RATIO_STEP === 0
  );
}
