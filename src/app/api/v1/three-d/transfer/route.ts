import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor, minorToDecimalString } from "@/lib/money";
import { computeThreeD } from "@/services/threeDService";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { assertDateOpen } from "@/services/closeGuard";
import { encodeCsv, THREE_D_IMPORT_HEADERS } from "@/lib/threeDTransfer";

export const GET = withAuth("three_d.view", async ({ req, user }) => {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) throw new ApiError(422, "sessionId is required");

  const session = await prisma.threeDSession.findFirst({
    where: { id: sessionId, businessId: user.businessId },
    select: { id: true, name: true, drawDate: true, branchId: true },
  });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.branchId) await assertBranchAccess(user, session.branchId);

  const transactions = await prisma.threeDTransaction.findMany({
    where: {
      sessionId,
      businessId: user.businessId,
      deletedAt: null,
      settlementStatus: { not: "CANCELLED" },
      ...branchScope(user),
    },
    include: { customer: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "asc" },
  });

  const body = "\uFEFF" + encodeCsv([
    [...THREE_D_IMPORT_HEADERS],
    ...transactions.map((transaction) => [
      transaction.number,
      minorToDecimalString(transaction.betAmount),
      transaction.customer?.name ?? transaction.customerName ?? "",
      transaction.customer?.phone ?? transaction.customerPhone ?? "",
      transaction.odds,
      transaction.commissionRate,
      transaction.notes ?? "",
    ]),
  ]);
  const safeName = `${session.drawDate}-${session.name}`.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="three-d-${safeName}.csv"`,
      "cache-control": "no-store",
    },
  });
});

const importRowSchema = z.object({
  number: z.string().regex(/^\d{3}$/),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  odds: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  commissionRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  notes: z.string().max(1000).optional(),
});

const importSchema = z.object({
  sessionId: z.string().min(1),
  branchId: z.string().min(1),
  rows: z.array(importRowSchema).min(1).max(2000),
});

export const POST = withAuth("three_d.create", async ({ req, user }) => {
  const body = await parseBody(req, importSchema);
  await assertBranchAccess(user, body.branchId);

  const session = await prisma.threeDSession.findFirst({
    where: { id: body.sessionId, businessId: user.businessId },
  });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.status !== "OPEN") throw new ApiError(422, "Records can only be imported into an open session");
  if (session.branchId && session.branchId !== body.branchId) {
    throw new ApiError(422, "Session belongs to a different branch");
  }

  const created = await prisma.$transaction(async (tx) => {
    await assertDateOpen(tx, body.branchId, session.drawDate);
    for (const row of body.rows) {
      const betAmount = toMinor(row.amount);
      if (betAmount <= 0n) throw new ApiError(422, "Every bet amount must be greater than zero");
      const odds = row.odds ?? session.defaultOdds;
      const commissionRate = row.commissionRate ?? user.commissionRate ?? "0";
      const calculation = computeThreeD(betAmount, odds, commissionRate);
      const txnNo = await nextNumber(tx, user.businessId, "THREE_D");
      await tx.threeDTransaction.create({
        data: {
          txnNo,
          businessId: user.businessId,
          branchId: body.branchId,
          sessionId: session.id,
          agentId: user.id,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          number: row.number,
          betAmount,
          odds,
          potentialPayout: calculation.potentialPayout,
          commissionRate,
          commissionAmount: calculation.commissionAmount,
          netAmount: calculation.netAmount,
          notes: row.notes,
          createdById: user.id,
        },
      });
    }
    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      branchId: body.branchId,
      action: "IMPORT",
      module: "three_d",
      resourceType: "ThreeDTransaction",
      resourceId: session.id,
      after: { count: body.rows.length, sessionId: session.id },
    });
    return body.rows.length;
  });

  return json({ created }, { status: 201 });
});
