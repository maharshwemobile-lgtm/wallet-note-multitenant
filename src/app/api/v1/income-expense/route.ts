import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createIncomeExpenseEntry } from "@/services/incomeExpenseService";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { notifyAuditFeed, incomeExpenseNotice } from "@/lib/telegramNotify";

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
  const [items, total, incomeAgg, expenseAgg, withdrawAgg] = await Promise.all([
    prisma.incomeExpense.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.incomeExpense.count({ where }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "INCOME" }, _sum: { amount: true } }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "EXPENSE" }, _sum: { amount: true } }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "WITHDRAW" }, _sum: { amount: true } }),
  ]);
  return json({
    items, total, page, pageSize,
    totals: { income: incomeAgg._sum.amount ?? 0n, expense: expenseAgg._sum.amount ?? 0n, withdraw: withdrawAgg._sum.amount ?? 0n },
  });
});

const schema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAW"]),
  branchId: z.string().min(1),
  categoryName: z.string().optional(),
  amount: z.string().min(1),
  walletId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  reference: z.string().optional(),
  description: z.string().optional(),
});

export const POST = withAuth(null, async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const requiredPerm = body.type === "WITHDRAW" ? "wallet.withdraw" : "income_expense.create";
  if (!can(user, requiredPerm)) throw new ApiError(403, "You do not have permission to perform this action");
  await assertBranchAccess(user, body.branchId);
  const amount = toMinor(body.amount);

  const item = await prisma.$transaction((tx) =>
    createIncomeExpenseEntry(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      type: body.type,
      categoryName: body.categoryName,
      amount,
      walletId: body.walletId,
      date: body.date,
      reference: body.reference,
      description: body.description,
    })
  );
  notifyAuditFeed(user.businessId, incomeExpenseNotice({
    txnNo: item.txnNo, type: item.type, categoryName: item.categoryName ?? "—",
    amount: item.amount, currency: item.currency, createdByName: user.name,
  }));
  return json(item, { status: 201 });
});
