import { describe, expect, it } from "vitest";
import { quote, quoteText } from "@/lib/telegramExchange";

// Amounts are minor units: 10_000 THB is 1_000_000.
const THB = (n: number) => BigInt(n) * 100n;
const MMK = (n: number) => BigInt(n) * 100n;

describe("exchange quote", () => {
  it("pays out MMK when the customer hands over THB", () => {
    const q = quote("BUY_THB", THB(1000), "120", "125");
    expect(q.fromCurrency).toBe("THB");
    expect(q.toCurrency).toBe("MMK");
    expect(q.toAmount).toBe(MMK(120_000));
  });

  it("takes MMK and gives back THB the other way", () => {
    const q = quote("SELL_THB", MMK(125_000), "120", "125");
    expect(q.fromCurrency).toBe("MMK");
    expect(q.toCurrency).toBe("THB");
    expect(q.toAmount).toBe(THB(1000));
  });

  it("uses the buy rate one way and the sell rate the other", () => {
    // Applying one rate to both directions hands the shop's spread to the customer on
    // every deal, which is the mistake worth guarding.
    expect(quote("BUY_THB", THB(100), "120", "125").rate).toBe("120");
    expect(quote("SELL_THB", MMK(12_500), "120", "125").rate).toBe("125");
  });

  it("leaves the shop the spread rather than the customer", () => {
    // Change THB to MMK and straight back: the customer must not end up ahead.
    const out = quote("BUY_THB", THB(1000), "120", "125");
    const back = quote("SELL_THB", out.toAmount, "120", "125");
    expect(back.toAmount).toBeLessThan(THB(1000));
  });

  it("handles a fractional rate without losing kyat to rounding drift", () => {
    const q = quote("BUY_THB", THB(1), "120.5", "125");
    expect(q.toAmount).toBe(MMK(120) + 50n);
  });

  it("says both sides of the deal in the message", () => {
    const text = quoteText(quote("BUY_THB", THB(1000), "120", "125"));
    expect(text).toContain("120");
    expect(text).toContain("1,000");
    expect(text).toContain("120,000");
    expect(text).toContain("သင်ပေးရမည်");
    expect(text).toContain("သင်ရမည်");
  });
});
