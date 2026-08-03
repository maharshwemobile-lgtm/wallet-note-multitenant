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
