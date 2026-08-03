import { describe, expect, it } from "vitest";
import { fmtMoneyMy } from "@/lib/telegramCustomerText";

describe("customer money formatting", () => {
  it("shows whole kyat, grouped", () => {
    expect(fmtMoneyMy(500000n)).toBe("5,000");
    expect(fmtMoneyMy(102000000n)).toBe("1,020,000");
    expect(fmtMoneyMy(0n)).toBe("0");
    expect(fmtMoneyMy(99n)).toBe("0");
  });

  it("handles amounts past what a number could hold", () => {
    expect(fmtMoneyMy(1234567890123456789n)).toBe("12,345,678,901,234,567");
  });

  it("keeps a negative readable", () => {
    expect(fmtMoneyMy(-500000n)).toBe("-5,000");
  });
});
