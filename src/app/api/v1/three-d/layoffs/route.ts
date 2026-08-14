import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";

/** Passing part of a number to another bookmaker.
 *
 *  The bet with the customer is untouched: the shop still owes them if the number comes
 *  out. What changes is who carries the risk, so this is recorded alongside the takings
 *  rather than deducted from them.
 */

export const GET = withAuth("three_d.view", async ({ req, user }) => {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) throw new ApiError(422, "sessionId is required");

  const layoffs = await prisma.lotteryLayoff.findMany({
    where: { sessionId, businessId: user.businessId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return json({ layoffs });
});

const createSchema = z.object({
  sessionId: z.string().min(1),
  number: z.string().min(1).max(4),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  odds: z.string().regex(/^\d+(\.\d+)?$/),
  bookmaker: z.string().trim().min(1).max(80),
  note: z.string().trim().max(300).optional(),
});

export const POST = withAuth("three_d.create", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);

  const session = await prisma.threeDSession.findFirst({
    where: { id: body.sessionId, businessId: user.businessId },
    select: { id: true, branchId: true, status: true },
  });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.status === "SETTLED") {
    throw new ApiError(422, "This draw is settled. Reopen it before changing what was laid off.");
  }

  const amount = toMinor(body.amount);
  if (amount <= 0n) throw new ApiError(422, "Amount must be more than zero");

  // A shop cannot pass on more than it took. Without this the exposure chart would show a
  // number as safe while the shop was still carrying it.
  const [taken, already] = await Promise.all([
    prisma.threeDTransaction.aggregate({
      where: {
        sessionId: session.id,
        number: body.number,
        deletedAt: null,
        settlementStatus: { not: "CANCELLED" },
      },
      _sum: { betAmount: true },
    }),
    prisma.lotteryLayoff.aggregate({
      where: { sessionId: session.id, number: body.number, deletedAt: null },
      _sum: { amount: true },
    }),
  ]);
  const room = (taken._sum.betAmount ?? 0n) - (already._sum.amount ?? 0n);
  if (amount > room) {
    throw new ApiError(
      422,
      room <= 0n
        ? `Nothing left on ${body.number} to pass on.`
        : `Only ${(Number(room) / 100).toLocaleString()} left on ${body.number} to pass on.`
    );
  }

  const layoff = await prisma.$transaction(async (tx) => {
    const created = await tx.lotteryLayoff.create({
      data: {
        businessId: user.businessId,
        branchId: session.branchId,
        sessionId: session.id,
        number: body.number,
        amount,
        odds: body.odds,
        bookmaker: body.bookmaker,
        note: body.note,
        createdById: user.id,
      },
    });
    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      branchId: session.branchId ?? undefined,
      action: "LAYOFF",
      module: "three_d",
      resourceType: "LotteryLayoff",
      resourceId: created.id,
      after: {
        number: created.number,
        amount: created.amount.toString(),
        odds: created.odds,
        bookmaker: created.bookmaker,
      },
    });
    return created;
  });

  return json(layoff, { status: 201 });
});

export const DELETE = withAuth("three_d.edit", async ({ req, user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(422, "id is required");

  const layoff = await prisma.lotteryLayoff.findFirst({
    where: { id, businessId: user.businessId, deletedAt: null },
  });
  if (!layoff) throw new ApiError(404, "Not found");

  await prisma.$transaction(async (tx) => {
    await tx.lotteryLayoff.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      branchId: layoff.branchId ?? undefined,
      action: "DELETE",
      module: "three_d",
      resourceType: "LotteryLayoff",
      resourceId: id,
      before: {
        number: layoff.number,
        amount: layoff.amount.toString(),
        bookmaker: layoff.bookmaker,
      },
    });
  });

  return json({ deleted: true });
});
