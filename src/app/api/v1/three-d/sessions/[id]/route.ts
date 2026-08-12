import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sessionExposure } from "@/services/threeDService";
import { toMinor } from "@/lib/money";
import { closeExpiredThreeDSessions } from "@/services/thaiLottoService";

export const GET = withAuth("three_d.view", async ({ user, params }) => {
  // The list page closes expired sessions on the way in; opening a session directly did
  // not, so a morning draw reached in the evening still read OPEN and still offered its
  // entry form. The status a page is shown should be the status as of now.
  await closeExpiredThreeDSessions();
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
  // Null clears it. Nullable rather than optional-only, because "no limit" is a choice a
  // shop makes deliberately and has to be able to make again.
  numberLimit: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  notes: z.string().optional(),
});

export const PATCH = withAuth("three_d.edit", async ({ req, user, params }) => {
  const body = await parseBody(req, patchSchema);
  const session = await prisma.threeDSession.findUnique({ where: { id: params.id } });
  if (!session || session.businessId !== user.businessId) throw new ApiError(404, "Session not found");
  if (session.status === "SETTLED") throw new ApiError(422, "Settled sessions cannot be edited");

  const { numberLimit, ...rest } = body;
  const data = {
    ...rest,
    ...(numberLimit === undefined
      ? {}
      : { numberLimit: numberLimit === null ? null : toMinor(numberLimit) }),
  };

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.threeDSession.update({ where: { id: session.id }, data });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "three_d", resourceType: "ThreeDSession", resourceId: s.id,
      before: { status: session.status, numberLimit: session.numberLimit?.toString() ?? null },
      after: { ...rest, ...(numberLimit === undefined ? {} : { numberLimit }) },
    });
    return s;
  });
  return json(updated);
});
