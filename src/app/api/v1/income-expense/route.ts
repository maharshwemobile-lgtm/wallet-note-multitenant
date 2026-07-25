import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { nextNumber } from "@/lib/sequence";
import { postLedger } from "@/services/walletService";
import { assertDateOpen } from "@/services/closeGuard";
import { audit } from "@/lib/audit";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";

export const GET = withAuth("income_expense.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    status: "COMPLETED",
    ...branchScope(user),
    ...(sp.get("type") ? { type: sp.get("type")! } : {}),
    ...(sp.get("date") ? { date: sp.get("date")! } : {}),
  };
  const [items, total, incomeAgg, expenseAgg] = await Promise.all([
    prisma.incomeExpense.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.incomeExpense.count({ where }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "INCOME", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "EXPENSE", status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  return json({
    items, total, page, pageSize,
    totals: { income: incomeAgg._sum.amount ?? 0n, expense: expenseAgg._sum.amount ?? 0n },
  });
});

const schema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  branchId: z.string().min(1),
  categoryName: z.string().min(1),
  amount: z.string().min(1),
  walletId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  reference: z.string().optional(),
  description: z.string().optional(),
});

export const POST = withAuth("income_expense.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);
  const amount = toMinor(body.amount);
  if (amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");

  const item = await prisma.$transaction(async (tx) => {
    await assertDateOpen(tx, body.branchId, body.date);
    const wallet = await tx.wallet.findUnique({ where: { id: body.walletId } });
    if (!wallet || wallet.businessId !== user.businessId) throw new ApiError(404, "Wallet not found");

    const txnNo = await nextNumber(tx, user.businessId, body.type);
    const it = await tx.incomeExpense.create({
      data: {
        txnNo,
        businessId: user.businessId,
        branchId: body.branchId,
        type: body.type,
        categoryName: body.categoryName,
        amount,
        currency: wallet.currency,
        walletId: body.walletId,
        date: body.date,
        reference: body.reference,
        description: body.description,
        createdById: user.id,
      },
    });

    await postLedger(tx, {
      businessId: user.businessId,
      walletId: wallet.id,
      direction: body.type === "INCOME" ? "DEBIT" : "CREDIT",
      amount,
      refType: body.type,
      refId: it.id,
      description: `${txnNo} ${body.categoryName}`,
      createdById: user.id,
    });

    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "CREATE", module: "income_expense", resourceType: "IncomeExpense", resourceId: it.id,
      after: { txnNo, type: body.type, category: body.categoryName, amount },
    });
    return it;
  });
  return json(item, { status: 201 });
});
