import { NextRequest, NextResponse } from "next/server";
import {
  autoSettleClosedSessions,
  closeExpiredThreeDSessions,
  syncThaiThreeDHistory,
} from "@/services/thaiLottoService";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const closed = await closeExpiredThreeDSessions();

  if (req.nextUrl.searchParams.get("sync") !== "1") {
    // The every-minute run still settles: a session that closed earlier may only now have
    // an official number to settle against.
    const settle = await autoSettleClosedSessions();
    return NextResponse.json({ ok: true, closed, settle });
  }

  let history;
  try {
    history = await syncThaiThreeDHistory();
  } catch (error) {
    history = { received: 0, warning: error instanceof Error ? error.message : "Sync failed" };
  }

  // Always after the fetch, so a number that just arrived settles on the same run.
  const settle = await autoSettleClosedSessions();
  return NextResponse.json({ ok: true, closed, history, settle });
}
