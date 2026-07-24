import { prisma } from "@/lib/prisma";

const HOST = "thai-lotto-new-api.p.rapidapi.com";
const RESULTS_URL = `https://${HOST}/api/v1/results`;
const HISTORY_URL = `https://${HOST}/api/v1/threed`;

export interface ThaiThreeDResult {
  drawDate: string;
  sessionName: string;
  drawTime?: string;
  resultNumber: string;
  rawPayload: string;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  const iso = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  return local ? `${local[3]}-${local[2]}-${local[1]}` : null;
}

function textValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return "";
}

export function parseThaiThreeDHistory(payload: unknown, now = new Date()): ThaiThreeDResult[] {
  const rows: ThaiThreeDResult[] = [];
  const seen = new Set<object>();
  const currentDate = dateAndTimeInZone(now, "Asia/Yangon").date;

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const current = payload as Record<string, unknown>;
    for (const [key, sessionName, drawTime] of [
      ["afResult", "Morning", "12:01"],
      ["evResult", "Evening", "16:30"],
    ] as const) {
      const resultNumber = typeof current[key] === "string" ? current[key].trim() : "";
      if (/^\d{3}$/.test(resultNumber)) {
        rows.push({
          drawDate: currentDate,
          sessionName,
          drawTime,
          resultNumber,
          rawPayload: JSON.stringify(current),
        });
      }
    }
  }

  function visit(value: unknown) {
    if (!value || typeof value !== "object" || seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;
    const date = normalizeDate(
      record.drawDate ?? record.date ?? record.resultDate ?? record.created_at
    );
    const number = textValue(record, [
      "resultNumber", "threeD", "threed", "result", "number",
    ]).trim();

    if (date && /^\d{3}$/.test(number)) {
      const sessionName = textValue(record, [
        "sessionName", "session", "period", "round", "name",
      ]).trim() || "Official";
      const drawTime = textValue(record, ["drawTime", "time"]).match(/^\d{2}:\d{2}/)?.[0];
      rows.push({
        drawDate: date,
        sessionName,
        drawTime,
        resultNumber: number,
        rawPayload: JSON.stringify(record),
      });
    }
    Object.values(record).forEach(visit);
  }

  visit(payload);
  return rows.filter((row, index) =>
    rows.findIndex((candidate) =>
      candidate.drawDate === row.drawDate &&
      candidate.sessionName === row.sessionName &&
      candidate.resultNumber === row.resultNumber
    ) === index
  );
}

function dateAndTimeInZone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function isSessionCutoffPassed(
  session: { drawDate: string; cutoffTime: string | null; drawTime: string | null },
  now: Date,
  timezone: string
) {
  const current = dateAndTimeInZone(now, timezone);
  const cutoff = session.cutoffTime ?? session.drawTime;
  if (!cutoff) return false;
  return session.drawDate < current.date ||
    (session.drawDate === current.date && cutoff <= current.time);
}

export async function closeExpiredThreeDSessions(now = new Date()) {
  const businesses = await prisma.business.findMany({ select: { id: true, timezone: true } });
  let closed = 0;
  for (const business of businesses) {
    const sessions = await prisma.threeDSession.findMany({
      where: { businessId: business.id, status: "OPEN" },
      select: { id: true, drawDate: true, cutoffTime: true, drawTime: true },
    });
    const ids = sessions
      .filter((session) => isSessionCutoffPassed(session, now, business.timezone))
      .map((session) => session.id);
    if (ids.length) {
      const result = await prisma.threeDSession.updateMany({
        where: { id: { in: ids }, status: "OPEN" },
        data: { status: "CLOSED" },
      });
      closed += result.count;
    }
  }
  return closed;
}

export async function syncThaiThreeDHistory() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not configured");
  const payloads: unknown[] = [];
  const warnings: string[] = [];
  for (const url of [RESULTS_URL, HISTORY_URL]) {
    try {
      const response = await fetch(url, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payloads.push(await response.json());
    } catch (error) {
      warnings.push(`${new URL(url).pathname}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  if (!payloads.length) throw new Error(warnings.join("; "));
  const rows = payloads.flatMap((payload) => parseThaiThreeDHistory(payload));
  for (const row of rows) {
    const sourceKey = `${row.drawDate}:${row.sessionName.toLowerCase()}:${row.resultNumber}`;
    await prisma.threeDOfficialResult.upsert({
      where: { sourceKey },
      create: { ...row, sourceKey },
      update: { drawTime: row.drawTime, rawPayload: row.rawPayload, fetchedAt: new Date() },
    });
  }
  return { received: rows.length, warnings };
}
