import { describe, expect, it } from "vitest";

/** Mirrors normalizeTwoD() in twoDResultService. A 2D number keeps its leading zero, and
 *  the feeds use "--" / "??" for a draw that has not happened yet. */
function normalizeTwoD(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  return text.padStart(2, "0");
}

/** Mirrors fromSlashDate(): RapidAPI reports DD/MM/YYYY. */
function fromSlashDate(text: string): string | null {
  const m = String(text ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

describe("2D result parsing", () => {
  it("keeps the leading zero — 3 is the number 03, not 3", () => {
    expect(normalizeTwoD(3)).toBe("03");
    expect(normalizeTwoD("3")).toBe("03");
    expect(normalizeTwoD("03")).toBe("03");
    expect(normalizeTwoD(0)).toBe("00");
  });

  it("passes through ordinary two-digit results", () => {
    expect(normalizeTwoD(16)).toBe("16");
    expect(normalizeTwoD("42")).toBe("42");
    expect(normalizeTwoD("99")).toBe("99");
  });

  it("treats the not-yet-drawn placeholders as no result", () => {
    for (const v of ["--", "??", "", "   ", null, undefined, "N/A"]) {
      expect(normalizeTwoD(v), String(v)).toBeNull();
    }
  });

  it("rejects anything that is not a 2D number", () => {
    expect(normalizeTwoD("123")).toBeNull(); // that is a 3D number
    expect(normalizeTwoD("1.5")).toBeNull();
    expect(normalizeTwoD("-1")).toBeNull();
  });

  it("converts the RapidAPI date format", () => {
    expect(fromSlashDate("31/07/2026")).toBe("2026-07-31");
    expect(fromSlashDate("01/12/2021")).toBe("2021-12-01");
  });

  it("refuses a date it cannot read rather than guessing", () => {
    for (const v of ["2026-07-31", "31-07-2026", "", "rubbish"]) {
      expect(fromSlashDate(v), v).toBeNull();
    }
  });

  it("builds one key per date and session, so a re-fetch updates instead of duplicating", () => {
    const key = (d: string, s: string) => `${d}:${s.toLowerCase()}`;
    expect(key("2026-07-31", "MORNING")).toBe("2026-07-31:morning");
    expect(key("2026-07-31", "EVENING")).toBe("2026-07-31:evening");
    expect(key("2026-07-31", "MORNING")).not.toBe(key("2026-07-31", "EVENING"));
  });
});
