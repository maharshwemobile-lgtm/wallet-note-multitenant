import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const [
      registeredAccounts,
      registeredUsers,
      enabledUsers,
      activeSessions,
      registeredToday,
      registrationAuditRecords,
      users,
    ] = await Promise.all([
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
      prisma.auditLog.count({ where: { action: "REGISTER", module: "auth" } }),
      prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          name: true,
          username: true,
          active: true,
          createdAt: true,
          business: { select: { name: true } },
          sessions: {
            where: { revokedAt: null, expiresAt: { gt: now } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true, expiresAt: true },
          },
        },
      }),
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
          registrationAuditRecords,
          users: users.map((user) => ({
            id: user.id,
            name: user.name,
            username: user.username,
            businessName: user.business.name,
            active: user.active,
            hasValidSession: user.sessions.length > 0,
            lastSessionAt: user.sessions[0]?.createdAt ?? null,
            createdAt: user.createdAt,
          })),
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
