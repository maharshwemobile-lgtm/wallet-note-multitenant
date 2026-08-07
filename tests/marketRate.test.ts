import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { applySpread, isFresh, parseMarketPost, postText } from "@/lib/marketRate";

/** A real post from the channel, so the parser is held against what is actually published
 *  rather than what it was written to expect. */
const REAL = readFileSync(join(__dirname, "fixtures", "mmktoday-post.txt"), "utf8");

describe("reading the daily market post", () => {
  it("finds THB, which is the pair this shop trades", () => {
    const thb = parseMarketPost(REAL).find((q) => q.currency === "THB");
    expect(thb).toEqual({ currency: "THB", buy: 130.0, sell: 132.7 });
  });

  it("reads the other currencies too, commas and all", () => {
    const quotes = parseMarketPost(REAL);
    expect(quotes.find((q) => q.currency === "USD")).toEqual({ currency: "USD", buy: 4340, sell: 4440 });
    // Small-value currencies are quoted to two decimals.
    expect(quotes.find((q) => q.currency === "JPY")).toEqual({ currency: "JPY", buy: 27.56, sell: 28.13 });
  });

  it("pairs each rate with its own currency, not the line's position", () => {
    // A stray line between entries would otherwise shift every rate by one and be silent.
    const shifted = "🇹🇭 THB\n\n📌 note\nဝယ် 130.0 / ရောင်း 132.7\n🇺🇸 USD\nဝယ် 4,340 / ရောင်း 4,440";
    const quotes = parseMarketPost(shifted);
    expect(quotes).toEqual([{ currency: "USD", buy: 4340, sell: 4440 }]);
  });

  it("returns nothing rather than guessing when the format changes", () => {
    for (const text of ["", "no rates here", "THB 130", "🇹🇭 THB\nbuy 130 sell 132"]) {
      expect(parseMarketPost(text), text).toEqual([]);
    }
  });

  it("strips the markup a preview post arrives in", () => {
    expect(postText("<b>🇹🇭 THB</b><br/>ဝယ် 130.0 / ရောင်း 132.7")).toBe(
      "🇹🇭 THB\nဝယ် 130.0 / ရောင်း 132.7"
    );
  });
});

describe("the shop's own margin", () => {
  it("buys under the market and sells over it", () => {
    expect(applySpread({ buy: 130, sell: 132.7 }, -2, 2)).toEqual({ buy: 128, sell: 134.7 });
  });

  it("applies the offsets as given rather than assuming a direction", () => {
    expect(applySpread({ buy: 130, sell: 132.7 }, 0, 0)).toEqual({ buy: 130, sell: 132.7 });
    expect(applySpread({ buy: 130, sell: 132.7 }, 1.5, -0.5)).toEqual({ buy: 131.5, sell: 132.2 });
  });

  it("never produces a negative rate from an oversized offset", () => {
    expect(applySpread({ buy: 130, sell: 132.7 }, -500, -500)).toEqual({ buy: 0, sell: 0 });
  });
});

describe("staleness", () => {
  const now = new Date("2026-08-06T09:00:00Z");

  it("accepts today's post and yesterday's", () => {
    expect(isFresh(new Date("2026-08-06T03:00:00Z"), now)).toBe(true);
    expect(isFresh(new Date("2026-08-05T03:00:00Z"), now)).toBe(true);
  });

  it("refuses one older than that, so a quiet channel cannot quote yesterday's market", () => {
    expect(isFresh(new Date("2026-08-04T03:00:00Z"), now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
    expect(isFresh(undefined, now)).toBe(false);
  });

  it("refuses a date in the future, which means something is wrong", () => {
    expect(isFresh(new Date("2026-08-07T03:00:00Z"), now)).toBe(false);
  });
});
