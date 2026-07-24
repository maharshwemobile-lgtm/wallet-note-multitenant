import { NextRequest, NextResponse } from "next/server";
import { closeExpiredThreeDSessions, syncThaiThreeDHistory } from "@/services/thaiLottoService";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const closed = await closeExpiredThreeDSessions();
  if (req.nextUrl.searchParams.get("sync") !== "1") {
    return NextResponse.json({ ok: true, closed });
  }
  try {
    const history = await syncThaiThreeDHistory();
    return NextResponse.json({ ok: true, closed, history });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      closed,
      history: { received: 0, warning: error instanceof Error ? error.message : "Sync failed" },
    });
  }
}
