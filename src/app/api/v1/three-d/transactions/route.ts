import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { parseBulkLines, createThreeDBets } from "@/services/threeDService";
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

  let rows = body.rows ?? [];
  if (body.bulkText) {
    const parsed = parseBulkLines(body.bulkText);
    if (parsed.errors.length) {
      throw new ApiError(422, `Bulk entry has invalid lines: ${parsed.errors.map((e) => `line ${e.line} "${e.text}"`).join(", ")}`);
    }
    rows = rows.concat(parsed.rows);
  }

  const commissionRate = body.commissionRate ?? user.commissionRate ?? "0";

  const created = await prisma.$transaction((tx) =>
    createThreeDBets(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      sessionId: body.sessionId,
      rows,
      commissionRate,
      customerId: body.customerId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      odds: body.odds,
      notes: body.notes,
    })
  );
  const session = await prisma.threeDSession.findUnique({ where: { id: body.sessionId }, select: { name: true } });
  const total = created.reduce((sum, t) => sum + t.betAmount, 0n);
  notifyAuditFeed(
    user.businessId,
    threeDNotice({ count: created.length, total, sessionName: session?.name ?? body.sessionId, createdByName: user.name })
  );
  return json({ created: created.length, transactions: created }, { status: 201 });
});
