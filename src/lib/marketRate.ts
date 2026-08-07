/** Reading the daily market rate out of a public Telegram channel.
 *
 *  Myanmar's market rate is roughly double the central bank's, so the official feed is no
 *  use for a shop that actually changes money. The maintained APIs for the market rate are
 *  all abandoned — the ones on GitHub stopped in 2022 and 2024 — so the rate is read from
 *  where it is actually published each day.
 *
 *  Parsing only. Nothing here fetches or stores, so the awkward part is testable against a
 *  real post.
 */

export interface MarketQuote {
  currency: string;
  buy: number;
  sell: number;
}

export interface MarketPost {
  postedAt: Date | null;
  quotes: MarketQuote[];
}

/** Strip a Telegram web-preview post down to its text. */
export function postText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** A number as the channel writes it: "130.0", "4,340", "3.05". */
function amount(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Pull every currency's buy and sell out of one post.
 *
 *  The post lists a currency on its own line and the pair on the next. Matching the pair
 *  by the Myanmar words rather than by position means a reordered or extra line does not
 *  shift every rate by one, which would be silent and expensive.
 */
export function parseMarketPost(text: string): MarketQuote[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const quotes: MarketQuote[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    // A line that is just a currency code, possibly behind a flag emoji.
    const code = lines[i].match(/^[^A-Za-z]*\b([A-Z]{3})\b[^A-Za-z]*$/);
    if (!code) continue;

    // The pair is on the next line; nothing else on the line is trusted to be in order.
    const pair = lines[i + 1]?.match(/ဝယ်\s*([\d,.]+)\s*\/\s*ရောင်း\s*([\d,.]+)/);
    if (!pair) continue;

    const buy = amount(pair[1]);
    const sell = amount(pair[2]);
    if (buy === null || sell === null) continue;

    quotes.push({ currency: code[1], buy, sell });
    i += 1;
  }

  return quotes;
}

/** The buy and sell a shop shows, once its own margin is applied.
 *
 *  Offsets are in kyat rather than percent because that is how a counter thinks about it:
 *  "two kyat under the market". A shop buys below the market and sells above it, so the
 *  offsets are signed and applied as given rather than assumed.
 */
export function applySpread(
  quote: { buy: number; sell: number },
  buyAdjust: number,
  sellAdjust: number
): { buy: number; sell: number } {
  return {
    buy: Math.max(0, quote.buy + buyAdjust),
    sell: Math.max(0, quote.sell + sellAdjust),
  };
}

/** Whether a stored rate is still worth quoting.
 *
 *  The channel posts once a day. A rate that has not been refreshed since yesterday means
 *  the channel went quiet or the format changed, and quoting a stale market rate to a
 *  paying customer is worse than falling back to the shop's own figure.
 */
export function isFresh(postedAt: Date | null | undefined, now: Date, maxHours = 36): boolean {
  if (!postedAt) return false;
  const age = now.getTime() - postedAt.getTime();
  return age >= 0 && age <= maxHours * 3600_000;
}
