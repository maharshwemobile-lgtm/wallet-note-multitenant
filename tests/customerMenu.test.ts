import { describe, expect, it } from "vitest";
import { CUSTOMER_MENU, MENU_ABOUT, MENU_BET, MENU_HISTORY } from "@/lib/telegramCustomerBot";

describe("customer menu", () => {
  it("stays under the text box between messages", () => {
    // Without both of these Telegram hides the keyboard after one use, which is the
    // behaviour this replaced.
    expect(CUSTOMER_MENU.is_persistent).toBe(true);
    expect(CUSTOMER_MENU.resize_keyboard).toBe(true);
  });

  it("offers exactly the three actions, betting on its own row", () => {
    expect(CUSTOMER_MENU.keyboard).toEqual([
      [{ text: MENU_BET }],
      [{ text: MENU_HISTORY }, { text: MENU_ABOUT }],
    ]);
  });

  it("keeps the labels distinct, since a tap is matched by its text", () => {
    const labels = [MENU_BET, MENU_HISTORY, MENU_ABOUT];
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim()).toBe(label);
  });

  it("uses labels no bet line could be mistaken for", () => {
    // A label that parsed as "number=amount" would be booked instead of actioned.
    for (const label of [MENU_BET, MENU_HISTORY, MENU_ABOUT]) {
      expect(label).not.toMatch(/^\d+\s*[=\-:\s]\s*[\d,]+$/);
    }
  });
});
