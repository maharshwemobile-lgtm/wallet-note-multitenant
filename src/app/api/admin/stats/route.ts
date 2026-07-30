import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function hasAdminSecret(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false; // fail closed if the secret was never configured
  const provided = req.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Either an already signed-in Owner, or the shared secret.
 *
 *  Signing in is the normal path — an Owner who is already authenticated should not be
 *  asked to type a second password to reach this page. The secret is kept as a fallback
 *  for reaching the panel without a session. This page reports across every tenant, so
 *  it stays gated either way: the figures include other businesses' names, users and
 *  activity, which is not ours to publish. */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  if (hasAdminSecret(req)) return true;
  const user = await getAuthUser();
  return user?.roleName === "Owner";
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
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
      activityLogs,
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
      prisma.user.count({ where: { createdAt: { gte: today }, deletedAt: null } }),
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
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          businessId: true,
          action: true,
          module: true,
          resourceType: true,
          reason: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const activityBusinessIds = [...new Set(activityLogs.map((log) => log.businessId))];
    const activityBusinesses = await prisma.business.findMany({
      where: { id: { in: activityBusinessIds } },
      select: { id: true, name: true },
    });
    const activityBusinessNames = new Map(activityBusinesses.map((business) => [business.id, business.name]));

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
            registeredToday: user.createdAt >= today,
            hasValidSession: user.sessions.length > 0,
            lastSessionAt: user.sessions[0]?.createdAt ?? null,
            createdAt: user.createdAt,
          })),
          activityLogs: activityLogs.map((log) => ({
            id: log.id,
            businessName: activityBusinessNames.get(log.businessId) ?? "Unknown business",
            userDisplayName: log.user?.name ?? "System",
            username: log.user?.username ?? "system",
            action: log.action,
            module: log.module,
            resourceType: log.resourceType,
            reason: log.reason,
            createdAt: log.createdAt,
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
