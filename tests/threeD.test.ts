import { describe, it, expect } from "vitest";
import { computeThreeD, parseBulkLines } from "../src/services/threeDService";

describe("3D calculations", () => {
  it("computes payout, commission and net amount", () => {
    // 5,000 MMK bet, odds 500, 10% commission
    const r = computeThreeD(500000n, "500", "10");
    expect(r.potentialPayout).toBe(250000000n); // 2,500,000 MMK
    expect(r.commissionAmount).toBe(50000n); // 500 MMK
    expect(r.netAmount).toBe(450000n); // 4,500 MMK
  });

  it("handles zero commission", () => {
    const r = computeThreeD(100000n, "700", "0");
    expect(r.potentialPayout).toBe(70000000n);
    expect(r.commissionAmount).toBe(0n);
    expect(r.netAmount).toBe(100000n);
  });

  it("handles fractional odds", () => {
    const r = computeThreeD(100000n, "80.5", "5");
    expect(r.potentialPayout).toBe(8050000n);
    expect(r.commissionAmount).toBe(5000n);
  });
});

describe("bulk entry parsing", () => {
  it("parses number=amount lines", () => {
    const { rows, errors } = parseBulkLines("123=5000\n456=3000\n007=2000");
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { number: "123", amount: "5000" },
      { number: "456", amount: "3000" },
      { number: "007", amount: "2000" },
    ]);
  });

  it("preserves leading zeros as distinct numbers", () => {
    const { rows } = parseBulkLines("001=100\n010=100\n100=100");
    expect(rows.map((r) => r.number)).toEqual(["001", "010", "100"]);
  });

  it("accepts separators = - : and space, strips commas in amounts", () => {
    const { rows, errors } = parseBulkLines("123=1,000\n456 - 2000\n789: 3000");
    expect(errors).toHaveLength(0);
    expect(rows[0].amount).toBe("1000");
  });

  it("reports invalid lines with line numbers", () => {
    const { rows, errors } = parseBulkLines("123=5000\n12=100\nabc=5\n\n456=1");
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(2);
    expect(errors[1].line).toBe(3);
  });

  it("skips blank lines", () => {
    const { rows, errors } = parseBulkLines("\n\n123=100\n\n");
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });
});

describe("settlement math (pure)", () => {
  it("net profit = gross - commission - payout", () => {
    // three bets: 123=5000, 456=3000, 123=2000; odds 500; commission 10%; result 123
    const bets = [
      { number: "123", amount: 500000n },
      { number: "456", amount: 300000n },
      { number: "123", amount: 200000n },
    ];
    const odds = "500", commission = "10";
    let gross = 0n, comm = 0n, payout = 0n;
    for (const b of bets) {
      const r = computeThreeD(b.amount, odds, commission);
      gross += b.amount;
      comm += r.commissionAmount;
      if (b.number === "123") payout += r.potentialPayout;
    }
    expect(gross).toBe(1000000n); // 10,000
    expect(comm).toBe(100000n); // 1,000
    expect(payout).toBe(350000000n); // 3,500,000
    expect(gross - comm - payout).toBe(-349100000n); // loss when the number hits
  });

  it("profit when no winning number", () => {
    const r = computeThreeD(500000n, "500", "10");
    const net = 500000n - r.commissionAmount - 0n;
    expect(net).toBe(450000n);
  });
});
