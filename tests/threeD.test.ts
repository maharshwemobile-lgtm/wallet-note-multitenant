import { describe, it, expect } from "vitest";
import { computeThreeD, parseBulkLines } from "../src/services/threeDService";
import { autoInsertThreeDEquals } from "../src/lib/threeDEntry";

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
  it("inserts equals after exactly three digits on each line", () => {
    expect(autoInsertThreeDEquals("123")).toBe("123=");
    expect(autoInsertThreeDEquals("123=500\n007")).toBe("123=500\n007=");
    expect(autoInsertThreeDEquals("12")).toBe("12");
  });

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

describe("bulk entry follows the session's game", () => {
  it("takes two-digit lines for a 2D session", () => {
    const { rows, errors } = parseBulkLines("07=5000\n42=3000\n00=1000", "TWO_D");
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.number)).toEqual(["07", "42", "00"]);
  });

  it("rejects a 3D number typed into a 2D session", () => {
    // Without this the bet is stored and then never matches a two-digit result.
    const { rows, errors } = parseBulkLines("123=5000", "TWO_D");
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain("07=5000");
  });

  it("still rejects a 2D number in a 3D session", () => {
    const { rows, errors } = parseBulkLines("07=5000", "THREE_D");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("defaults to 3D when no game is given, so existing callers are unchanged", () => {
    expect(parseBulkLines("123=5000").rows).toHaveLength(1);
    expect(parseBulkLines("07=5000").rows).toHaveLength(0);
  });

  it("completes a 2D line after two digits, not three", () => {
    expect(autoInsertThreeDEquals("07", "TWO_D")).toBe("07=");
    expect(autoInsertThreeDEquals("07", "THREE_D")).toBe("07");
    expect(autoInsertThreeDEquals("123", "TWO_D")).toBe("123");
  });
});

describe("a customer name on the line", () => {
  it("takes the name after the amount", () => {
    const { rows, errors } = parseBulkLines("234=4000 Khun Myint Aung");
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ number: "234", amount: "4000", customerName: "Khun Myint Aung" });
  });

  it("reads a different name on each line", () => {
    const { rows } = parseBulkLines("234=4000 Ko Aung\n567=2000 Ma Hla\n890=1000");
    expect(rows.map((r) => r.customerName)).toEqual(["Ko Aung", "Ma Hla", undefined]);
  });

  it("takes a Myanmar name as readily as a latin one", () => {
    const { rows, errors } = parseBulkLines("234=4000 ကိုအောင်");
    expect(errors).toEqual([]);
    expect(rows[0].customerName).toBe("ကိုအောင်");
  });

  it("leaves the name out when there is none", () => {
    const { rows } = parseBulkLines("234=4000");
    expect(rows[0].customerName).toBeUndefined();
    expect(rows[0]).toEqual({ number: "234", amount: "4000" });
  });

  it("still keeps thousands separators out of the amount", () => {
    const { rows } = parseBulkLines("234=4,000 Ko Aung");
    expect(rows[0]).toEqual({ number: "234", amount: "4000", customerName: "Ko Aung" });
  });

  it("does not read a broken amount as a name", () => {
    // "40x0" is a typo in the amount, not a customer called "x0". Accepting it would book
    // a bet of 40 and silently lose the rest of what was meant.
    const { rows, errors } = parseBulkLines("234=40x0");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("works the same for 2D", () => {
    const { rows, errors } = parseBulkLines("07=5000 Ma Hla", "TWO_D");
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ number: "07", amount: "5000", customerName: "Ma Hla" });
  });
});
