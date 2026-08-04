/** Money formatting for customer-facing Telegram messages.
 *
 *  Kept apart from the app's formatter because a customer sees only a plain amount — no
 *  currency switching, no locale to pick up, no minor-unit noise.
 */

/** Minor units to a grouped whole-kyat string: 500000n -> "5,000". */
export function fmtMoneyMy(minor: bigint): string {
  const negative = minor < 0n;
  const whole = (negative ? -minor : minor) / 100n;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

/** The shop's Telegram as a link a customer can tap.
 *
 *  Shops write this field however they think of it — "@shop", "shop", a t.me link, or a
 *  phone number — so the handle is dug out rather than assumed. Returns null when there
 *  is no usable handle, because a dead button is worse than none: a phone number and a
 *  Telegram username look alike but only one opens a chat.
 */
export function telegramLink(value: string | null | undefined): string | null {
  let handle = String(value ?? "").trim();
  if (!handle) return null;

  handle = handle
    .replace(/^https?:\/\//i, "")
    .replace(/^(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();

  // Telegram's own rule: 5-32 characters, letters, digits and underscore. An all-digit
  // value is a phone number written in the wrong box, not a username.
  if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) return null;
  if (/^\d+$/.test(handle)) return null;

  return `https://t.me/${handle}`;
}
