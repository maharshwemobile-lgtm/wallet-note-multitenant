import { describe, it, expect } from "vitest";
import { convertAmount, exchangeProfit } from "../src/services/exchangeService";
import { agingBucket } from "../src/services/creditService";

describe("exchange conversion", () => {
  it("THB → MMK multiplies by rate", () => {
    // 1,000 THB @ 130 = 130,000 MMK
    expect(convertAmount(100000n, "THB", "MMK", "130")).toBe(13000000n);
  });

  it("MMK → THB divides by rate", () => {
    // 130,000 MMK @ 130 = 1,000 THB
    expect(convertAmount(13000000n, "MMK", "THB", "130")).toBe(100000n);
  });

  it("rounds half-up on division", () => {
    // 100 MMK @ 130 → 0.7692… THB → 77 satang-minor
    expect(convertAmount(10000n, "MMK", "THB", "130")).toBe(77n);
  });

  it("rejects same-currency conversion", () => {
    expect(() => convertAmount(100n, "MMK", "MMK", "1")).toThrow();
  });

  it("rejects zero or negative rate", () => {
    expect(() => convertAmount(100n, "THB", "MMK", "0")).toThrow();
  });
});

describe("exchange profit", () => {
  it("buying THB below board rate is profit", () => {
    // buy 1,000 THB at 129 when board buy is 129.5 → 0.5 × 1,000 = 500 MMK
    const p = exchangeProfit({ type: "BUY_THB", thbAmount: 100000n, dealRate: "129", baseRate: "129.5", serviceFee: 0n, additionalCost: 0n });
    expect(p).toBe(50000n);
  });

  it("selling THB above board rate is profit, fees added", () => {
    const p = exchangeProfit({ type: "SELL_THB", thbAmount: 100000n, dealRate: "131.5", baseRate: "131", serviceFee: 100000n, additionalCost: 20000n });
    expect(p).toBe(50000n + 100000n - 20000n);
  });

  it("selling below board is a loss", () => {
    const p = exchangeProfit({ type: "SELL_THB", thbAmount: 100000n, dealRate: "130", baseRate: "131", serviceFee: 0n, additionalCost: 0n });
    expect(p).toBe(-100000n);
  });
});

describe("aging buckets", () => {
  const today = "2026-07-24";
  it("classifies due dates", () => {
    expect(agingBucket(null, today)).toBe("CURRENT");
    expect(agingBucket("2026-07-25", today)).toBe("CURRENT");
    expect(agingBucket("2026-07-24", today)).toBe("CURRENT");
    expect(agingBucket("2026-07-20", today)).toBe("1-7");
    expect(agingBucket("2026-07-01", today)).toBe("8-30");
    expect(agingBucket("2026-06-01", today)).toBe("31-60");
    expect(agingBucket("2026-01-01", today)).toBe("60+");
  });
});
