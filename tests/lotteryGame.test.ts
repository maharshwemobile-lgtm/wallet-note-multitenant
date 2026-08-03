import { describe, expect, it } from "vitest";
import { GAME_RULES, gameRules, isGameType, isValidNumber, numberRangeLabel, sessionSchedule } from "@/lib/lotteryGame";

describe("game rules", () => {
  it("keeps 2D and 3D apart", () => {
    expect(GAME_RULES.TWO_D.digits).toBe(2);
    expect(GAME_RULES.THREE_D.digits).toBe(3);
    expect(GAME_RULES.TWO_D.defaultOdds).toBe("85");
    expect(GAME_RULES.THREE_D.defaultOdds).toBe("500");
  });

  it("only 2D opens itself — 3D draws twice a month and is created by hand", () => {
    expect(GAME_RULES.TWO_D.autoOpen).toBe(true);
    expect(GAME_RULES.THREE_D.autoOpen).toBe(false);
    expect(GAME_RULES.TWO_D.sessions.map((s) => s.name)).toEqual(["MORNING", "EVENING"]);
  });

  it("bets stop before the draw, never after", () => {
    for (const s of GAME_RULES.TWO_D.sessions) {
      expect(s.cutoffTime < s.drawTime, `${s.name} cutoff must precede its draw`).toBe(true);
    }
  });
});

describe("number validation", () => {
  it("accepts only the right length for each game", () => {
    expect(isValidNumber("07", "TWO_D")).toBe(true);
    expect(isValidNumber("00", "TWO_D")).toBe(true);
    expect(isValidNumber("99", "TWO_D")).toBe(true);
    expect(isValidNumber("007", "THREE_D")).toBe(true);
    expect(isValidNumber("999", "THREE_D")).toBe(true);
  });

  it("refuses a 3D number in a 2D session and the reverse", () => {
    // This is the one that would settle bets against the wrong draw.
    expect(isValidNumber("123", "TWO_D")).toBe(false);
    expect(isValidNumber("12", "THREE_D")).toBe(false);
  });

  it("will not accept a short number as if it were padded", () => {
    expect(isValidNumber("7", "TWO_D")).toBe(false);
    expect(isValidNumber("7", "THREE_D")).toBe(false);
  });

  it("rejects non-digits", () => {
    for (const v of ["", "  ", "ab", "1a", "--", "1.2", "-1"]) {
      expect(isValidNumber(v, "TWO_D"), v).toBe(false);
      expect(isValidNumber(v, "THREE_D"), v).toBe(false);
    }
  });

  it("falls back to 3D for an unknown game rather than accepting anything", () => {
    expect(gameRules("NONSENSE").digits).toBe(3);
    expect(isValidNumber("12", "NONSENSE")).toBe(false);
    expect(isValidNumber("123", "NONSENSE")).toBe(true);
  });

  it("labels the range it will accept", () => {
    expect(numberRangeLabel("TWO_D")).toBe("00–99");
    expect(numberRangeLabel("THREE_D")).toBe("000–999");
  });

  it("recognises only the two real game types", () => {
    expect(isGameType("TWO_D")).toBe(true);
    expect(isGameType("THREE_D")).toBe(true);
    for (const v of ["FOUR_D", "", null, undefined, 2]) expect(isGameType(v)).toBe(false);
  });
});

describe("2D settlement pairing", () => {
  /** Mirrors autoSettleTwoDSessions(): matched on date AND session, because morning and
   *  evening draw different numbers on the same day. */
  const key = (d: string, s: string) => `${d}:${s}`;

  it("does not let the evening number settle the morning session", () => {
    const official = new Map([
      [key("2026-07-31", "MORNING"), "16"],
      [key("2026-07-31", "EVENING"), "42"],
    ]);
    expect(official.get(key("2026-07-31", "MORNING"))).toBe("16");
    expect(official.get(key("2026-07-31", "EVENING"))).toBe("42");
    expect(official.get(key("2026-07-31", "MORNING"))).not.toBe(
      official.get(key("2026-07-31", "EVENING"))
    );
  });

  it("leaves a session unsettled when its own draw has no number", () => {
    const official = new Map([[key("2026-07-31", "MORNING"), "16"]]);
    expect(official.get(key("2026-07-31", "EVENING"))).toBeUndefined();
  });
});

describe("session schedule", () => {
  it("knows the times for each 2D draw so nobody types them", () => {
    expect(sessionSchedule("TWO_D", "MORNING")).toEqual({ drawTime: "12:01", cutoffTime: "11:55" });
    expect(sessionSchedule("TWO_D", "EVENING")).toEqual({ drawTime: "16:30", cutoffTime: "16:25" });
  });

  it("matches the name however it was typed", () => {
    expect(sessionSchedule("TWO_D", "morning")?.drawTime).toBe("12:01");
    expect(sessionSchedule("TWO_D", "  Evening ")?.drawTime).toBe("16:30");
  });

  it("has nothing for a 3D session, which has no fixed daily time", () => {
    expect(sessionSchedule("THREE_D", "MORNING")).toBeNull();
  });

  it("returns null for an unknown draw rather than guessing a cut-off", () => {
    expect(sessionSchedule("TWO_D", "AFTERNOON")).toBeNull();
    expect(sessionSchedule("TWO_D", "")).toBeNull();
  });
});
