import { describe, expect, it } from "vitest";
import { parseCsv, parseThreeDImportCsv, threeDImportTemplate } from "../src/lib/threeDTransfer";

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
