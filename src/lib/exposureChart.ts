/** Working out the exposure bars for a draw.
 *
 *  A shop needs one thing off this screen: which numbers are carrying too much money, and
 *  by how much. Everything here serves that — the sort, the colours, and the split between
 *  what is within the shop's limit and what is over it.
 *
 *  The limit is per number, not per draw. A shop that takes 60,000 on 684 has decided that
 *  is as much as it wants to owe if 684 comes out; anything past that is money it will
 *  have to lay off with another shop, so it is drawn separately rather than folded into
 *  one long bar where it cannot be seen.
 */

export interface ExposureRow {
  number: string;
  totalStake: bigint;
  /** Already passed to another house, so no longer the shop's risk. */
  laidOff?: bigint;
}

export type BarTone = "over" | "near" | "normal";

export interface ExposureBar {
  number: string;
  /** Everything taken on this number, laid off or not. */
  total: bigint;
  /** What the shop is still carrying: total less anything passed on. */
  net: bigint;
  laidOff: bigint;
  laidOffPercent: number;
  /** The part within the limit, and the part past it. Both in minor units. */
  withinLimit: bigint;
  overLimit: bigint;
  /** Widths as percentages of the widest bar, so the row can be drawn directly. */
  withinPercent: number;
  overPercent: number;
  tone: BarTone;
}

/** At what fraction of the limit a bar starts warning.
 *
 *  Not at the limit itself: by the time a number is at its cap there is nothing to decide
 *  any more. Eighty per cent is close enough to act on and far enough to still be able to.
 */
export const NEAR_LIMIT = 0.8;

/** Biggest first, because that is the order the question is asked in. */
export function sortByStake(rows: ExposureRow[]): ExposureRow[] {
  return [...rows].sort((a, b) => (a.totalStake === b.totalStake ? a.number.localeCompare(b.number) : b.totalStake > a.totalStake ? 1 : -1));
}

export function buildExposureBars(
  rows: ExposureRow[],
  limit: bigint | null,
  take = 30
): ExposureBar[] {
  const sorted = sortByStake(rows).slice(0, take);
  if (sorted.length === 0) return [];

  // Scaled against the biggest bet, not against the limit: with no limit set there is
  // nothing else to scale by, and with one, a draw where everything is under the limit
  // would otherwise draw every bar as a stub.
  const widest = sorted[0].totalStake;

  return sorted.map((row) => {
    const total = row.totalStake;
    // The limit is about what the shop stands to lose, so it is judged on what is left
    // after laying off — a number that was over the line and has been passed on is no
    // longer a problem, and should stop being drawn as one.
    const laidOff = row.laidOff ?? 0n;
    const net = total > laidOff ? total - laidOff : 0n;
    const within = limit !== null && net > limit ? limit : net;
    const over = limit !== null && net > limit ? net - limit : 0n;

    const percent = (value: bigint) =>
      widest === 0n ? 0 : Number((value * 10000n) / widest) / 100;

    // The two segments are drawn end to end, so the second is measured as the remainder of
    // the whole rather than on its own. Rounding each independently left a hairline gap
    // between them — 82.19 + 17.80 is 99.99, and at a glance that reads as a broken bar.
    const netPercent = percent(net);
    const withinPercent = percent(within);
    const overPercent = over > 0n ? netPercent - withinPercent : 0;
    // Drawn after the shop's own share, so the whole bar still shows everything taken.
    const laidOffPercent = laidOff > 0n ? percent(total) - netPercent : 0;

    let tone: BarTone = "normal";
    if (limit !== null) {
      if (over > 0n) tone = "over";
      // BigInt has no fractions, so the comparison is scaled up rather than divided down.
      else if (net * 100n >= limit * BigInt(Math.round(NEAR_LIMIT * 100))) tone = "near";
    }

    return {
      number: row.number,
      total,
      net,
      laidOff,
      laidOffPercent,
      withinLimit: within,
      overLimit: over,
      withinPercent,
      overPercent,
      tone,
    };
  });
}

/** What the shop would have to find if every over-limit number came out — the figure
 *  behind the whole screen. */
export function totalOverLimit(bars: ExposureBar[]): bigint {
  return bars.reduce((sum, bar) => sum + bar.overLimit, 0n);
}
