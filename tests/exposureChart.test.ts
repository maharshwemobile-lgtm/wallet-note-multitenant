import { describe, expect, it } from "vitest";
import { buildExposureBars, sortByStake, totalOverLimit } from "@/lib/exposureChart";

/** Minor units: 60_000_00n is 60,000 kyat. */
const K = (n: number) => BigInt(Math.round(n * 100));

const rows = [
  { number: "684", totalStake: K(73_000) },
  { number: "081", totalStake: K(69_500) },
  { number: "415", totalStake: K(55_000) },
  { number: "920", totalStake: K(38_500) },
];

describe("sortByStake", () => {
  it("puts the biggest first", () => {
    expect(sortByStake(rows).map((r) => r.number)).toEqual(["684", "081", "415", "920"]);
  });

  it("breaks a tie by number, so the order does not wander between refreshes", () => {
    const tied = [
      { number: "357", totalStake: K(26_000) },
      { number: "237", totalStake: K(26_000) },
    ];
    expect(sortByStake(tied).map((r) => r.number)).toEqual(["237", "357"]);
  });
});

describe("buildExposureBars", () => {
  const limit = K(60_000);
  const bars = buildExposureBars(rows, limit);

  it("splits a number that has gone past the limit", () => {
    const top = bars[0];
    expect(top.number).toBe("684");
    expect(top.withinLimit).toBe(K(60_000));
    expect(top.overLimit).toBe(K(13_000));
    expect(top.tone).toBe("over");
  });

  it("warns before the limit is reached, not after", () => {
    // 55,000 of a 60,000 limit is 92% — worth seeing while there is still room to act.
    expect(bars.find((b) => b.number === "415")?.tone).toBe("near");
    // 38,500 is 64%, an ordinary number.
    expect(bars.find((b) => b.number === "920")?.tone).toBe("normal");
  });

  it("measures the bars against the biggest bet", () => {
    const top = bars[0];
    // 60,000 and 13,000 of a 73,000 widest bar.
    expect(top.withinPercent).toBeCloseTo(82.19, 1);
    expect(top.overPercent).toBeCloseTo(17.8, 1);
    expect(top.withinPercent + top.overPercent).toBeCloseTo(100, 5);
  });

  it("draws plain bars when the shop has set no limit", () => {
    const noLimit = buildExposureBars(rows, null);
    expect(noLimit.every((b) => b.tone === "normal")).toBe(true);
    expect(noLimit.every((b) => b.overLimit === 0n)).toBe(true);
    expect(noLimit[0].withinPercent).toBe(100);
  });

  it("shows only as many rows as asked for", () => {
    expect(buildExposureBars(rows, limit, 2).map((b) => b.number)).toEqual(["684", "081"]);
  });

  it("copes with a draw that has no bets on it yet", () => {
    expect(buildExposureBars([], limit)).toEqual([]);
  });

  it("does not divide by zero when every number is on nothing", () => {
    const zero = buildExposureBars([{ number: "000", totalStake: 0n }], limit);
    expect(zero[0].withinPercent).toBe(0);
    expect(zero[0].tone).toBe("normal");
  });
});

describe("totalOverLimit", () => {
  it("adds up what the shop would have to find elsewhere", () => {
    // 684 is 13,000 over and 081 is 9,500 over; the rest are within.
    expect(totalOverLimit(buildExposureBars(rows, K(60_000)))).toBe(K(22_500));
  });

  it("is nothing when no number has gone past", () => {
    expect(totalOverLimit(buildExposureBars(rows, K(100_000)))).toBe(0n);
  });
});

describe("laying part of a number off", () => {
  const limit = K(60_000);

  it("stops flagging a number once the excess has been passed on", () => {
    // 73,000 taken, 13,000 handed to another house: the shop carries 60,000, which is the
    // most it said it wanted. It should stop being drawn as a problem.
    const [bar] = buildExposureBars([{ number: "684", totalStake: K(73_000), laidOff: K(13_000) }], limit);
    expect(bar.net).toBe(K(60_000));
    expect(bar.overLimit).toBe(0n);
    expect(bar.tone).toBe("near");
  });

  it("still shows the whole amount taken, with the passed-on part beside it", () => {
    const [bar] = buildExposureBars([{ number: "684", totalStake: K(73_000), laidOff: K(13_000) }], limit);
    expect(bar.total).toBe(K(73_000));
    expect(bar.laidOff).toBe(K(13_000));
    // The three segments tile the full bar.
    expect(bar.withinPercent + bar.overPercent + bar.laidOffPercent).toBeCloseTo(100, 5);
  });

  it("keeps flagging what is still over after a partial lay-off", () => {
    const [bar] = buildExposureBars([{ number: "684", totalStake: K(90_000), laidOff: K(10_000) }], limit);
    expect(bar.net).toBe(K(80_000));
    expect(bar.overLimit).toBe(K(20_000));
    expect(bar.tone).toBe("over");
  });

  it("does not go negative if more was laid off than taken", () => {
    const [bar] = buildExposureBars([{ number: "684", totalStake: K(10_000), laidOff: K(15_000) }], limit);
    expect(bar.net).toBe(0n);
    expect(bar.overLimit).toBe(0n);
  });

  it("leaves the total to collect at nothing once everything is laid off", () => {
    const bars = buildExposureBars(
      [
        { number: "684", totalStake: K(73_000), laidOff: K(13_000) },
        { number: "081", totalStake: K(69_500), laidOff: K(9_500) },
      ],
      limit
    );
    expect(totalOverLimit(bars)).toBe(0n);
  });
});
