import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { assertBranchAccess } from "@/lib/tenant";
import { closeExpiredThreeDSessions } from "@/services/thaiLottoService";

export const GET = withAuth("three_d.view", async ({ req, user }) => {
  await closeExpiredThreeDSessions();
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req);
  const where = {
    businessId: user.businessId,
    ...(sp.get("date") ? { drawDate: sp.get("date")! } : {}),
    ...(sp.get("status") ? { status: sp.get("status")! } : {}),
  };
  const [sessions, total] = await Promise.all([
    prisma.threeDSession.findMany({
      where,
      orderBy: [{ drawDate: "desc" }, { createdAt: "desc" }],
      include: { settlement: true, _count: { select: { transactions: true } } },
      skip, take,
    }),
    prisma.threeDSession.count({ where }),
  ]);

  // Attach per-session totals
  const withTotals = await Promise.all(
    sessions.map(async (s) => {
      const agg = await prisma.threeDTransaction.aggregate({
        where: { sessionId: s.id, deletedAt: null, settlementStatus: { not: "CANCELLED" } },
        _sum: { betAmount: true, potentialPayout: true },
      });
      return {
        ...s,
        totalBet: agg._sum.betAmount ?? 0n,
        totalPotentialPayout: agg._sum.potentialPayout ?? 0n,
      };
    })
  );
  return json({ sessions: withTotals, total, page, pageSize });
});

const createSchema = z.object({
  name: z.string().min(1),
  drawDate: z.string().refine(isValidBusinessDate, "Invalid date").default(todayBusinessDate),
  drawTime: z.string().optional(),
  cutoffTime: z.string().optional(),
  defaultOdds: z.string().regex(/^\d+(\.\d+)?$/).default("500"),
  branchId: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("three_d.create", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);
  if (body.branchId) await assertBranchAccess(user, body.branchId);
  const session = await prisma.$transaction(async (tx) => {
    const s = await tx.threeDSession.create({
      data: {
        businessId: user.businessId,
        branchId: body.branchId,
        name: body.name,
        drawDate: body.drawDate,
        drawTime: body.drawTime,
        cutoffTime: body.cutoffTime,
        defaultOdds: body.defaultOdds,
        notes: body.notes,
        status: "OPEN",
        createdById: user.id,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "CREATE", module: "three_d", resourceType: "ThreeDSession", resourceId: s.id,
      after: { name: s.name, drawDate: s.drawDate },
    });
    return s;
  });
  return json(session, { status: 201 });
});
