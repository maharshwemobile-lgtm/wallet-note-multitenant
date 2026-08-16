import { describe, expect, it } from "vitest";
import { formatDrawDate, resultMessage, sessionLabel } from "@/lib/resultMessage";

/** This goes to every customer a shop has, so a mistake in it is a mistake everyone
 *  reads. The number itself is the part that must never be wrong. */

describe("formatDrawDate", () => {
  it("writes the date the way a customer reads it", () => {
    expect(formatDrawDate("2026-08-14")).toBe("14-08-2026");
  });

  it("leaves anything it does not recognise alone", () => {
    expect(formatDrawDate("today")).toBe("today");
  });
});

describe("sessionLabel", () => {
  it("names the two daily draws in Myanmar", () => {
    expect(sessionLabel("MORNING")).toBe("မနက်ပိုင်း");
    expect(sessionLabel("EVENING")).toBe("ညနေပိုင်း");
  });

  it("passes an unexpected name through rather than dropping it", () => {
    expect(sessionLabel("Special")).toBe("Special");
  });
});

describe("resultMessage", () => {
  const twoD = {
    gameType: "TWO_D",
    sessionName: "MORNING",
    drawDate: "2026-08-14",
    resultNumber: "27",
    setValue: "1,619.91",
    value: "29,277.53",
  };

  it("leads with the number and the draw it belongs to", () => {
    const text = resultMessage(twoD);
    expect(text).toContain("2D ရလဒ်");
    expect(text).toContain("မနက်ပိုင်း — 14-08-2026");
    expect(text).toContain("27");
  });

  it("keeps a leading zero, which is a different number", () => {
    expect(resultMessage({ ...twoD, resultNumber: "07" })).toContain("07");
    expect(resultMessage({ ...twoD, resultNumber: "07" })).not.toContain("🎯  7\n");
  });

  it("carries the figures the number came from when they are known", () => {
    const text = resultMessage(twoD);
    expect(text).toContain("SET — 1,619.91");
    expect(text).toContain("VALUE — 29,277.53");
  });

  it("leaves them out rather than printing empty labels", () => {
    const text = resultMessage({ ...twoD, setValue: null, value: null });
    expect(text).not.toContain("SET");
    expect(text).not.toContain("VALUE");
  });

  it("does not name a session for 3D, which has only one draw", () => {
    const text = resultMessage({
      gameType: "THREE_D",
      sessionName: "Official",
      drawDate: "2026-08-16",
      resultNumber: "479",
    });
    expect(text).toContain("3D ရလဒ်");
    expect(text).toContain("16-08-2026");
    expect(text).not.toContain("Official");
    expect(text).toContain("479");
  });
});
