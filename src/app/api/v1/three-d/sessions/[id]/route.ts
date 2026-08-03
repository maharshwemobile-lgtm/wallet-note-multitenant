import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sessionExposure } from "@/services/threeDService";

export const GET = withAuth("three_d.view", async ({ user, params }) => {
  const session = await prisma.threeDSession.findUnique({
    where: { id: params.id },
    include: { settlement: true },
  });
  if (!session || session.businessId !== user.businessId) throw new ApiError(404, "Session not found");
  const exposure = await sessionExposure(prisma, session.id);
  const agg = await prisma.threeDTransaction.aggregate({
    where: { sessionId: session.id, deletedAt: null, settlementStatus: { not: "CANCELLED" } },
    _sum: { betAmount: true, commissionAmount: true },
    _count: true,
  });
  return json({
    session,
    exposure,
    totals: {
      count: agg._count,
      totalBet: agg._sum.betAmount ?? 0n,
      totalCommission: agg._sum.commissionAmount ?? 0n,
    },
  });
});

const patchSchema = z.object({
  status: z.enum(["OPEN", "CLOSED", "CANCELLED"]).optional(),
  name: z.string().min(1).optional(),
  drawTime: z.string().optional(),
  cutoffTime: z.string().optional(),
  defaultOdds: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  notes: z.string().optional(),
});

export const PATCH = withAuth("three_d.edit", async ({ req, user, params }) => {
  const body = await parseBody(req, patchSchema);
  const session = await prisma.threeDSession.findUnique({ where: { id: params.id } });
  if (!session || session.businessId !== user.businessId) throw new ApiError(404, "Session not found");
  if (session.status === "SETTLED") throw new ApiError(422, "Settled sessions cannot be edited");

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.threeDSession.update({ where: { id: session.id }, data: body });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "three_d", resourceType: "ThreeDSession", resourceId: s.id,
      before: { status: session.status }, after: body,
    });
    return s;
  });
  return json(updated);
});
