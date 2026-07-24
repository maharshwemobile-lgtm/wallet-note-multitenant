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

  it("closes at the configured cutoff in the business timezone", () => {
    const session = { drawDate: "2026-07-24", cutoffTime: "11:45", drawTime: "12:01" };
    expect(isSessionCutoffPassed(session, new Date("2026-07-24T05:14:00Z"), "Asia/Yangon")).toBe(false);
    expect(isSessionCutoffPassed(session, new Date("2026-07-24T05:15:00Z"), "Asia/Yangon")).toBe(true);
  });
});
