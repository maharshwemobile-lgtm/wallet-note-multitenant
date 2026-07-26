import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createExchange } from "@/services/exchangeService";
import { assertDateOpen } from "@/services/closeGuard";
import { todayBusinessDate } from "@/lib/dates";
import { notifyAuditFeed, exchangeNotice } from "@/lib/telegramNotify";

export const GET = withAuth("exchange.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...branchScope(user),
    ...(sp.get("type") ? { type: sp.get("type")! } : {}),
    ...(sp.get("status") ? { status: sp.get("status")! } : { status: "COMPLETED" }),
    ...(sp.get("q")
      ? { OR: [{ txnNo: { contains: sp.get("q")! } }, { reference: { contains: sp.get("q")! } }] }
      : {}),
  };
  const [transactions, total, agg] = await Promise.all([
    prisma.exchangeTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
      skip, take,
    }),
    prisma.exchangeTransaction.count({ where }),
    prisma.exchangeTransaction.aggregate({
      where: { ...where, status: "COMPLETED" },
      _sum: { profit: true, serviceFee: true },
    }),
  ]);
  return json({
    transactions, total, page, pageSize,
    totals: { profit: agg._sum.profit ?? 0n, serviceFee: agg._sum.serviceFee ?? 0n },
  });
});

const schema = z.object({
  branchId: z.string().min(1),
  type: z.enum(["BUY_THB", "SELL_THB", "CONVERT"]),
  fromCurrency: z.enum(["MMK", "THB"]),
  toCurrency: z.enum(["MMK", "THB"]),
  fromAmount: z.string().min(1),
  rate: z.string().regex(/^\d+(\.\d+)?$/, "Invalid rate"),
  serviceFee: z.string().default("0"),
  additionalCost: z.string().default("0"),
  sourceWalletId: z.string().min(1),
  destWalletId: z.string().min(1),
  customerId: z.string().optional(),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("exchange.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);

  const exchange = await prisma.$transaction(async (tx) => {
    await assertDateOpen(tx, body.branchId, todayBusinessDate());
    return createExchange(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      type: body.type,
      fromCurrency: body.fromCurrency,
      toCurrency: body.toCurrency,
      fromAmount: toMinor(body.fromAmount),
      rate: body.rate,
      serviceFee: toMinor(body.serviceFee),
      additionalCost: toMinor(body.additionalCost),
      sourceWalletId: body.sourceWalletId,
      destWalletId: body.destWalletId,
      customerId: body.customerId,
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      notes: body.notes,
    });
  });
  notifyAuditFeed(user.businessId, exchangeNotice({
    txnNo: exchange.txnNo, type: exchange.type,
    fromAmount: exchange.fromAmount, fromCurrency: exchange.fromCurrency,
    toAmount: exchange.toAmount, toCurrency: exchange.toCurrency,
    createdByName: user.name,
  }));
  return json(exchange, { status: 201 });
});
