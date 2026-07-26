import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor, isThreeDigit } from "@/lib/money";
import { computeThreeD, parseBulkLines } from "@/services/threeDService";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { assertDateOpen } from "@/services/closeGuard";
import { notifyAuditFeed, threeDNotice } from "@/lib/telegramNotify";

export const GET = withAuth("three_d.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    settlementStatus: { not: "CANCELLED" },
    ...branchScope(user),
    ...(sp.get("sessionId") ? { sessionId: sp.get("sessionId")! } : {}),
    ...(sp.get("number") ? { number: sp.get("number")! } : {}),
    ...(sp.get("agentId") ? { agentId: sp.get("agentId")! } : {}),
    ...(sp.get("customerId") ? { customerId: sp.get("customerId")! } : {}),
    ...(sp.get("q")
      ? {
          OR: [
            { txnNo: { contains: sp.get("q")! } },
            { customerName: { contains: sp.get("q")! } },
            { customerPhone: { contains: sp.get("q")! } },
            { number: sp.get("q")! },
          ],
        }
      : {}),
  };
  const [transactions, total, agg] = await Promise.all([
    prisma.threeDTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } }, session: { select: { name: true, drawDate: true, status: true } } },
      skip, take,
    }),
    prisma.threeDTransaction.count({ where }),
    prisma.threeDTransaction.aggregate({ where, _sum: { betAmount: true, potentialPayout: true } }),
  ]);
  return json({
    transactions, total, page, pageSize,
    totals: { totalBet: agg._sum.betAmount ?? 0n, totalPotentialPayout: agg._sum.potentialPayout ?? 0n },
  });
});

const rowSchema = z.object({
  number: z.string(),
  amount: z.string(),
});

const createSchema = z.object({
  sessionId: z.string().min(1),
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  odds: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  commissionRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  notes: z.string().optional(),
  // either explicit rows, or raw bulk text like "123=5000\n456=3000"
  rows: z.array(rowSchema).optional(),
  bulkText: z.string().optional(),
});

export const POST = withAuth("three_d.create", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);
  await assertBranchAccess(user, body.branchId);

  const session = await prisma.threeDSession.findUnique({ where: { id: body.sessionId } });
  if (!session || session.businessId !== user.businessId) throw new ApiError(404, "Session not found");
  if (session.status !== "OPEN") throw new ApiError(422, `Session is ${session.status.toLowerCase()} — records can only be added to open sessions`);

  if (session.branchId && session.branchId !== body.branchId)
    throw new ApiError(422, "Session belongs to a different branch");

  let rows = body.rows ?? [];
  if (body.bulkText) {
    const parsed = parseBulkLines(body.bulkText);
    if (parsed.errors.length) {
      throw new ApiError(422, `Bulk entry has invalid lines: ${parsed.errors.map((e) => `line ${e.line} "${e.text}"`).join(", ")}`);
    }
    rows = rows.concat(parsed.rows);
  }
  if (rows.length === 0) throw new ApiError(422, "No records to save");
  for (const r of rows) {
    if (!isThreeDigit(r.number)) throw new ApiError(422, `Invalid 3D number: "${r.number}" (must be 000–999)`);
  }

  const odds = body.odds ?? session.defaultOdds;
  const commissionRate = body.commissionRate ?? user.commissionRate ?? "0";

  const created = await prisma.$transaction(async (tx) => {
    await assertDateOpen(tx, body.branchId, session.drawDate);
    if (body.customerId) {
      const customer = await tx.contact.findFirst({
        where: { id: body.customerId, businessId: user.businessId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw new ApiError(404, "Customer not found");
    }
    const out = [];
    for (const r of rows) {
      const betAmount = toMinor(r.amount);
      if (betAmount <= 0n) throw new ApiError(422, "Bet amount must be greater than zero");
      const calc = computeThreeD(betAmount, odds, commissionRate);
      const txnNo = await nextNumber(tx, user.businessId, "THREE_D");
      out.push(
        await tx.threeDTransaction.create({
          data: {
            txnNo,
            businessId: user.businessId,
            branchId: body.branchId,
            sessionId: session.id,
            agentId: user.id,
            customerId: body.customerId,
            customerName: body.customerName,
            customerPhone: body.customerPhone,
            number: r.number,
            betAmount,
            odds,
            potentialPayout: calc.potentialPayout,
            commissionRate,
            commissionAmount: calc.commissionAmount,
            netAmount: calc.netAmount,
            notes: body.notes,
            createdById: user.id,
          },
        })
      );
    }
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "CREATE", module: "three_d", resourceType: "ThreeDTransaction",
      after: { count: out.length, sessionId: session.id },
    });
    return out;
  });
  notifyAuditFeed(
    user.businessId,
    threeDNotice({
      count: created.length,
      total: created.reduce((sum, transaction) => sum + transaction.betAmount, 0n),
      sessionName: session.name,
      createdByName: user.name,
      notes: body.notes,
    })
  );
  return json({ created: created.length, transactions: created }, { status: 201 });
});
