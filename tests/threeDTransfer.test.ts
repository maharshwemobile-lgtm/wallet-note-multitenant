import { describe, expect, it } from "vitest";
import { encodeCsv, parseCsv, parseThreeDImportCsv, threeDImportTemplate } from "../src/lib/threeDTransfer";

describe("3D CSV transfer", () => {
  it("round-trips quoted CSV fields", () => {
    expect(parseCsv('"number","notes"\r\n"007","say ""hello"", please"')).toEqual([
      ["number", "notes"],
      ["007", 'say "hello", please'],
    ]);
  });

  it("parses the provided template", () => {
    const result = parseThreeDImportCsv(threeDImportTemplate());
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].number).toBe("007");
  });

  it("restores leading zeros removed by spreadsheet software", () => {
    const result = parseThreeDImportCsv("number,amount\n7,2000");
    expect(result.errors).toEqual([]);
    expect(result.rows[0].number).toBe("007");
  });

  it("rejects missing headers and invalid rows", () => {
    expect(parseThreeDImportCsv("number\n123").errors[0]).toContain("amount");
    expect(parseThreeDImportCsv("number,amount\n123,nope").errors[0]).toContain("amount");
  });
});

describe("2D CSV transfer", () => {
  it("pads to two digits, not three", () => {
    // "7" in a 2D file is 07, not 007. Padding to the wrong width files the record under a
    // number the session does not have, and it would never match a result.
    const result = parseThreeDImportCsv("number,amount\n7,2000", 2);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].number).toBe("07");
  });

  it("pads the same file differently depending on the game", () => {
    // The same "07" is a 2D number and, read as 3D, becomes 007. The parser cannot tell
    // which was meant, so the session's own game decides -- and the server checks the
    // result against that game before writing anything.
    expect(parseThreeDImportCsv("number,amount\n07,5000", 2).rows[0].number).toBe("07");
    expect(parseThreeDImportCsv("number,amount\n07,5000", 3).rows[0].number).toBe("007");
  });

  it("refuses a 3D number in a 2D file", () => {
    const result = parseThreeDImportCsv("number,amount\n123,5000", 2);
    expect(result.errors[0]).toContain("between 00 and 99");
  });

  it("round-trips the leading zero the export writes", () => {
    // The export writes ="07" so a spreadsheet cannot eat the zero. That has to survive
    // being encoded, opened, saved and read back.
    const csv = encodeCsv([["number", "amount"], ['="07"', "5000"]]);
    expect(parseThreeDImportCsv(csv, 2).rows[0].number).toBe("07");
    expect(parseThreeDImportCsv("number,amount\n'07,5000", 2).rows[0].number).toBe("07");
  });
});
