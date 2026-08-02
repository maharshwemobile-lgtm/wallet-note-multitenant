import { prisma } from "@/lib/prisma";

/** Myanmar 2D takes two results a day from the Thai SET close: 12:01 and 16:30.
 *  The 11:00 and 15:00 ticks exist but are not settled against here. */
export const TWO_D_SESSIONS = [
  { name: "MORNING", time: "12:01" },
  { name: "EVENING", time: "16:30" },
] as const;

const RAPID_HOST = "myanmar-all-in-one-2d-results.p.rapidapi.com";
const FALLBACK_URL = "https://api.thaistock2d.com/live";

export interface TwoDResult {
  drawDate: string; // YYYY-MM-DD
  sessionName: string; // MORNING | EVENING
  drawTime: string;
  resultNumber: string; // "00".."99"
  setValue?: string;
  value?: string;
  source: string;
  rawPayload: string;
}

/** A 2D number is two digits and keeps its leading zero. */
function normalizeTwoD(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!/^\d{1,2}$/.test(text)) return null; // "--", "??" and blanks mean "not out yet"
  return text.padStart(2, "0");
}

/** RapidAPI reports dates as DD/MM/YYYY. */
function fromSlashDate(text: string): string | null {
  const m = String(text ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Primary source. Also carries is_close_day, which saves working out Thai holidays. */
async function fetchFromRapidApi(): Promise<TwoDResult[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not configured");

  const response = await fetch(`https://${RAPID_HOST}/api/v1/live`, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": RAPID_HOST },
  });
  if (!response.ok) throw new Error(`RapidAPI HTTP ${response.status}`);

  const body = await response.json();
  // The provider answers 200 with an "unreachable" envelope when its own backend is down.
  if (!body?.data) throw new Error(String(body?.messages ?? "RapidAPI returned no data"));

  const data = body.data;
  const drawDate = fromSlashDate(data.date);
  if (!drawDate) throw new Error(`RapidAPI gave an unusable date: ${data.date}`);

  const rawPayload = JSON.stringify(data);
  const out: TwoDResult[] = [];
  const morning = normalizeTwoD(data.mResult);
  const evening = normalizeTwoD(data.eResult);

  if (morning) {
    out.push({ drawDate, sessionName: "MORNING", drawTime: "12:01", resultNumber: morning,
      setValue: data.mSet, value: data.mVal, source: "MYANMAR_2D_RAPIDAPI", rawPayload });
  }
  if (evening) {
    out.push({ drawDate, sessionName: "EVENING", drawTime: "16:30", resultNumber: evening,
      setValue: data.eSet, value: data.eVal, source: "MYANMAR_2D_RAPIDAPI", rawPayload });
  }
  return out;
}

/** Fallback. Measured as the more reliable of the two, and its numbers agree with
 *  RapidAPI's, so switching between them cannot produce a different result. */
async function fetchFromThaiStock2D(): Promise<TwoDResult[]> {
  const response = await fetch(FALLBACK_URL);
  if (!response.ok) throw new Error(`thaistock2d HTTP ${response.status}`);

  const body = await response.json();
  const rows: unknown[] = Array.isArray(body?.result) ? body.result : [];
  const out: TwoDResult[] = [];

  for (const session of TWO_D_SESSIONS) {
    const row = rows.find((r) => {
      const time = String((r as { open_time?: string }).open_time ?? "");
      return time.startsWith(session.time);
    }) as { twod?: string; stock_date?: string; set?: string; value?: string } | undefined;
    if (!row) continue;

    const resultNumber = normalizeTwoD(row.twod);
    const drawDate = String(row.stock_date ?? "").trim();
    if (!resultNumber || !/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) continue;

    out.push({ drawDate, sessionName: session.name, drawTime: session.time, resultNumber,
      setValue: row.set, value: row.value, source: "THAISTOCK2D", rawPayload: JSON.stringify(row) });
  }
  return out;
}

/** Fetch and store the official 2D results.
 *
 *  RapidAPI is tried first — it is the paid source and reports is_close_day — but its
 *  backend answers "unreachable" often enough that a single source would regularly miss a
 *  draw. thaistock2d covers those gaps; both were checked to report the same numbers.
 *
 *  Rows are keyed on date + session, so re-running only ever updates.
 */
export async function syncTwoDResults() {
  const warnings: string[] = [];
  let results: TwoDResult[] = [];

  try {
    results = await fetchFromRapidApi();
  } catch (error) {
    warnings.push(`primary: ${error instanceof Error ? error.message : "failed"}`);
    try {
      results = await fetchFromThaiStock2D();
    } catch (fallbackError) {
      warnings.push(`fallback: ${fallbackError instanceof Error ? fallbackError.message : "failed"}`);
      return { received: 0, stored: 0, warnings };
    }
  }

  let stored = 0;
  for (const r of results) {
    const sourceKey = `${r.drawDate}:${r.sessionName.toLowerCase()}`;
    await prisma.twoDOfficialResult.upsert({
      where: { sourceKey },
      create: {
        drawDate: r.drawDate, sessionName: r.sessionName, drawTime: r.drawTime,
        resultNumber: r.resultNumber, setValue: r.setValue, value: r.value,
        source: r.source, sourceKey, rawPayload: r.rawPayload,
      },
      update: {
        resultNumber: r.resultNumber, setValue: r.setValue, value: r.value,
        source: r.source, rawPayload: r.rawPayload, fetchedAt: new Date(),
      },
    });
    stored += 1;
  }

  return { received: results.length, stored, warnings };
}
