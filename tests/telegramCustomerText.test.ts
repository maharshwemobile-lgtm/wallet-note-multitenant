import { describe, expect, it } from "vitest";
import { fmtMoneyMy, telegramLink } from "@/lib/telegramCustomerText";

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

describe("shop telegram link", () => {
  it("accepts the shapes a shop actually types", () => {
    for (const written of [
      "maharshwe",
      "@maharshwe",
      " @maharshwe ",
      "t.me/maharshwe",
      "https://t.me/maharshwe",
      "http://telegram.me/maharshwe",
      "https://t.me/maharshwe?start=1",
    ]) {
      expect(telegramLink(written), written).toBe("https://t.me/maharshwe");
    }
  });

  it("refuses a phone number, which looks like a handle but opens nothing", () => {
    // The worst outcome is a button that does nothing when someone needs help.
    expect(telegramLink("09778394052")).toBeNull();
    expect(telegramLink("+959778394052")).toBeNull();
  });

  it("refuses anything Telegram would not accept as a username", () => {
    for (const bad of ["", "  ", null, undefined, "abcd", "has space", "dash-name", "a".repeat(33)]) {
      expect(telegramLink(bad as string), String(bad)).toBeNull();
    }
  });

  it("takes the shortest handle Telegram allows", () => {
    expect(telegramLink("abcde")).toBe("https://t.me/abcde");
    expect(telegramLink("a_1_b")).toBe("https://t.me/a_1_b");
  });
});
