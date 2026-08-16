import { NextRequest, NextResponse } from "next/server";
import { syncMarketRates } from "@/services/marketRateService";
import { broadcastDailyRates, broadcastResults } from "@/services/resultBroadcast";
import {
  autoSettleClosedSessions,
  closeExpiredThreeDSessions,
  syncThaiThreeDHistory,
} from "@/services/thaiLottoService";
import {
  autoOpenTwoDSessions,
  autoSettleTwoDSessions,
  syncTwoDResults,
} from "@/services/twoDResultService";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Open today's 2D sessions before closing, so a session created this minute is still
  // subject to its own cutoff in the same run.
  const opened = await autoOpenTwoDSessions();
  const closed = await closeExpiredThreeDSessions();

  if (req.nextUrl.searchParams.get("sync") !== "1") {
    // The every-minute run still settles: a session that closed earlier may only now have
    // an official number to settle against.
    const settle = await autoSettleClosedSessions();
    const settleTwoD = await autoSettleTwoDSessions();
    return NextResponse.json({ ok: true, opened, closed, settle, settleTwoD });
  }

  let history;
  try {
    history = await syncThaiThreeDHistory();
  } catch (error) {
    history = { received: 0, warning: error instanceof Error ? error.message : "Sync failed" };
  }

  // 2D rides the same schedule. It is fetched only on the ?sync=1 runs, never on the
  // every-minute one: the RapidAPI plan has a per-minute rate limit that a minutely call
  // would exhaust, taking 3D down with it.
  let twoD;
  try {
    twoD = await syncTwoDResults();
  } catch (error) {
    twoD = { received: 0, stored: 0, warnings: [error instanceof Error ? error.message : "2D sync failed"] };
  }

  // The market rate rides the same schedule: it is published once a day, so the three
  // sync runs are more than enough and it needs no cron entry of its own.
  let market;
  try {
    market = await syncMarketRates();
  } catch (error) {
    market = { stored: 0, warnings: [error instanceof Error ? error.message : "market sync failed"] };
  }

  // Told to customers as soon as the number is known, and before settling: a customer
  // wants the number itself first, and whether they won is a separate message that only
  // goes to those with a stake.
  let broadcast;
  try {
    broadcast = await broadcastResults();
  } catch (error) {
    broadcast = { announced: 0, messages: 0, warnings: [error instanceof Error ? error.message : "broadcast failed"] };
  }

  // Once a day, and only to customers who have changed money with this shop before.
  let rates;
  try {
    rates = await broadcastDailyRates();
  } catch (error) {
    rates = { announced: 0, messages: 0, warnings: [error instanceof Error ? error.message : "rate broadcast failed"] };
  }

  // Always after the fetch, so a number that just arrived settles on the same run.
  const settle = await autoSettleClosedSessions();
  const settleTwoD = await autoSettleTwoDSessions();
  return NextResponse.json({ ok: true, opened, closed, history, twoD, market, broadcast, rates, settle, settleTwoD });
}
