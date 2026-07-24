import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const [registeredAccounts, registeredUsers, enabledUsers, activeSessions, registeredToday] = await Promise.all([
      prisma.business.count(),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { active: true, deletedAt: null } }),
      prisma.authSession.findMany({
        where: {
          revokedAt: null,
          expiresAt: { gt: now },
          user: { active: true, deletedAt: null },
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
      prisma.business.count({ where: { createdAt: { gte: today } } }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        data: {
          registeredAccounts,
          registeredUsers,
          enabledUsers,
          activeUsers: activeSessions.length,
          registeredToday,
          updatedAt: now.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Statistics are temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
