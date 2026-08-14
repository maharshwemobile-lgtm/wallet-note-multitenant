export const THREE_D_IMPORT_HEADERS = [
  "number",
  "amount",
  "customer_name",
  "customer_phone",
  "odds",
  "commission_rate",
  "notes",
] as const;

export interface ThreeDImportRow {
  number: string;
  amount: string;
  customerName?: string;
  customerPhone?: string;
  odds?: string;
  commissionRate?: string;
  notes?: string;
}

export function encodeCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

export function threeDImportTemplate(): string {
  return "\uFEFF" + encodeCsv([
    [...THREE_D_IMPORT_HEADERS],
    ["123", "5000", "Mg Mg", "09123456789", "500", "5", ""],
    ["007", "2000", "", "", "", "", "Leading zero example"],
  ]);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

/** Spreadsheets strip leading zeros and dress numbers up to stop themselves doing it, so
 *  "7", "'007" and ="007" all have to come back as the same number. Padded to the game's
 *  own width: 2D's "07" is not a short 3D number. */
function normalizeNumber(value: string, digits: number): string {
  const cleaned = value
    .trim()
    .replace(/^'/, "")
    .replace(new RegExp(`^="(\\d{1,${digits}})"$`), "$1");
  return new RegExp(`^\\d{1,${digits}}$`).test(cleaned) ? cleaned.padStart(digits, "0") : cleaned;
}

export function parseThreeDImportCsv(text: string, digits: number = 3): {
  rows: ThreeDImportRow[];
  errors: string[];
} {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  if (parsed.length === 0) return { rows: [], errors: ["The CSV file is empty."] };

  const headers = parsed[0].map((header) => header.trim().toLowerCase());
  const required = ["number", "amount"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) {
    return { rows: [], errors: [`Missing required column(s): ${missing.join(", ")}.`] };
  }

  const value = (cells: string[], name: string) => {
    const index = headers.indexOf(name);
    return index < 0 ? "" : (cells[index] ?? "").trim();
  };

  const rows: ThreeDImportRow[] = [];
  const errors: string[] = [];
  parsed.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => !cell.trim())) return;
    const line = index + 2;
    const number = normalizeNumber(value(cells, "number"), digits);
    const amount = value(cells, "amount").replace(/,/g, "");
    const odds = value(cells, "odds");
    const commissionRate = value(cells, "commission_rate");

    if (!new RegExp(`^\\d{${digits}}$`).test(number)) {
      const highest = "9".repeat(digits);
      errors.push(`Line ${line}: number must be between ${"0".repeat(digits)} and ${highest}.`);
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      errors.push(`Line ${line}: amount must be greater than zero.`);
    }
    if (odds && !/^\d+(\.\d+)?$/.test(odds)) errors.push(`Line ${line}: odds is invalid.`);
    if (commissionRate && !/^\d+(\.\d+)?$/.test(commissionRate)) {
      errors.push(`Line ${line}: commission_rate is invalid.`);
    }

    rows.push({
      number,
      amount,
      customerName: value(cells, "customer_name") || undefined,
      customerPhone: value(cells, "customer_phone") || undefined,
      odds: odds || undefined,
      commissionRate: commissionRate || undefined,
      notes: value(cells, "notes") || undefined,
    });
  });

  if (rows.length === 0 && errors.length === 0) errors.push("The CSV file has no records.");
  if (rows.length > 2000) errors.push("A single import can contain at most 2,000 records.");
  return { rows, errors };
}
