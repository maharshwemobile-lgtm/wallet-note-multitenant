import { describe, expect, it } from "vitest";
import { isSessionCutoffPassed, parseThaiThreeDHistory } from "@/services/thaiLottoService";

describe("Thai Lotto integration", () => {
  it("only accepts dated three-digit result records", () => {
    const result = parseThaiThreeDHistory({
      data: [
        { date: "2026-07-24", session: "Morning", result: "007" },
        { date: "2026-07-24", result: "12" },
        { result: "123" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      drawDate: "2026-07-24", sessionName: "Morning", resultNumber: "007",
    });
  });

  it("maps the current results endpoint to morning and evening history", () => {
    const result = parseThaiThreeDHistory(
      { afResult: "123", evResult: "--" },
      new Date("2026-07-24T05:30:00Z")
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      drawDate: "2026-07-24", sessionName: "Morning", resultNumber: "123",
    });
  });

  it("maps the official lottery mmThreeD result", () => {
    const result = parseThaiThreeDHistory({
      date: "16-07-2026",
      firstPriceNumber: "639214",
      mmThreeD: "214",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      drawDate: "2026-07-16", sessionName: "Official", resultNumber: "214",
    });
  });

  it("closes at the configured cutoff in the business timezone", () => {
    const session = { drawDate: "2026-07-24", cutoffTime: "11:45", drawTime: "12:01" };
    expect(isSessionCutoffPassed(session, new Date("2026-07-24T05:14:00Z"), "Asia/Yangon")).toBe(false);
    expect(isSessionCutoffPassed(session, new Date("2026-07-24T05:15:00Z"), "Asia/Yangon")).toBe(true);
  });

  it("treats the morning draw as shut for the whole evening", () => {
    // The case this is really about: a shop entering bets at 5pm must not be able to put
    // them on the draw that ran at midday, whose number is already public.
    const morning = { drawDate: "2026-08-11", cutoffTime: "11:55", drawTime: "12:01" };
    const evening = { drawDate: "2026-08-11", cutoffTime: "16:25", drawTime: "16:30" };
    const fivePm = new Date("2026-08-11T10:30:00Z"); // 17:00 in Yangon
    expect(isSessionCutoffPassed(morning, fivePm, "Asia/Yangon")).toBe(true);
    expect(isSessionCutoffPassed(evening, fivePm, "Asia/Yangon")).toBe(true);

    const tenAm = new Date("2026-08-11T03:30:00Z"); // 10:00 in Yangon
    expect(isSessionCutoffPassed(morning, tenAm, "Asia/Yangon")).toBe(false);
    expect(isSessionCutoffPassed(evening, tenAm, "Asia/Yangon")).toBe(false);
  });

  it("is judged in Yangon, not on the server's clock", () => {
    // The server runs in UTC. At 06:00 UTC it is already 12:30 in Yangon and the morning
    // draw has gone; reading the server clock would leave it open for another six hours.
    const morning = { drawDate: "2026-08-11", cutoffTime: "11:55", drawTime: "12:01" };
    const sixUtc = new Date("2026-08-11T06:00:00Z");
    expect(isSessionCutoffPassed(morning, sixUtc, "Asia/Yangon")).toBe(true);
    expect(isSessionCutoffPassed(morning, sixUtc, "UTC")).toBe(false);
  });

  it("shuts yesterday's draw whatever the time of day", () => {
    const yesterday = { drawDate: "2026-08-10", cutoffTime: "16:25", drawTime: "16:30" };
    expect(isSessionCutoffPassed(yesterday, new Date("2026-08-11T01:00:00Z"), "Asia/Yangon")).toBe(true);
  });
});
