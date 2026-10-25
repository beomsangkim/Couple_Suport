import { describe, expect, it } from "vitest";
import { netBalance, splitAmount } from "@/lib/money";
import { isValidRatio, roundedIncomeRatio } from "@/lib/income";

describe("splitAmount", () => {
  it("나머지 1원은 결제자가 부담한다", () => {
    expect(splitAmount(10001, { a: 1, b: 1 }, "a")).toEqual({ a: 5001, b: 5000 });
    expect(splitAmount(10001, { a: 1, b: 1 }, "b")).toEqual({ a: 5000, b: 5001 });
  });

  it("합계는 언제나 원 금액과 같다", () => {
    for (const total of [1, 7, 999, 54210, 87301, 99_999_999]) {
      for (const w of [{ a: 60, b: 40 }, { a: 55, b: 45 }, { a: 1_100_000, b: 900_000 }, { a: 1, b: 1 }]) {
        const s = splitAmount(total, w, "a");
        expect(s.a! + s.b!).toBe(total);
        expect(s.a).toBeGreaterThanOrEqual(0);
        expect(s.b).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("60:40 예시", () => {
    expect(splitAmount(2_000_000, { a: 60, b: 40 }, "b")).toEqual({ a: 1_200_000, b: 800_000 });
  });

  it("잘못된 입력은 거부한다", () => {
    expect(() => splitAmount(0, { a: 1, b: 1 }, "a")).toThrow();
    expect(() => splitAmount(10.5, { a: 1, b: 1 }, "a")).toThrow();
    expect(() => splitAmount(100, { a: 1, b: 1 }, "c")).toThrow();
    expect(() => splitAmount(100, { a: 0.5, b: 1 }, "a")).toThrow();
  });
});

describe("netBalance", () => {
  it("서로 낸 돈을 상계한다", () => {
    const r = netBalance(
      [
        { amount: 10000, paidBy: "a", shares: { a: 6000, b: 4000 } },
        { amount: 5000, paidBy: "b", shares: { a: 3000, b: 2000 } },
      ],
      ["a", "b"],
    );
    expect(r).toEqual({ from: "b", to: "a", amount: 1000 });
  });
});

describe("소득 비례 계산기", () => {
  it("결과를 5% 단위로 반올림한다(정밀 비율을 공유하지 않음)", () => {
    expect(roundedIncomeRatio(300, 200)).toEqual([60, 40]);
    expect(roundedIncomeRatio(350, 250)).toEqual([60, 40]); // 58.3% → 60%
    expect(roundedIncomeRatio(1000, 1)).toEqual([95, 5]);
  });

  it("비율 검증", () => {
    expect(isValidRatio(60, 40)).toBe(true);
    expect(isValidRatio(58, 42)).toBe(false);
    expect(isValidRatio(100, 0)).toBe(false);
  });
});
