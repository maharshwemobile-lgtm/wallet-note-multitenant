import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { nextNumber } from "@/lib/sequence";
import { postLedger } from "./walletService";
import { assertDateOpen } from "./closeGuard";
import { audit } from "@/lib/audit";

// Shared by the HTTP API and the Telegram bot so both stay in lockstep.
// WITHDRAW behaves like EXPENSE (money leaves the wallet) but is tracked as
// its own type so reports can tell owner drawings apart from operating costs.

export async function createIncomeExpenseEntry(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    type: "INCOME" | "EXPENSE" | "WITHDRAW";
    categoryName?: string;
    amount: bigint;
    walletId: string;
    date: string;
    reference?: string;
    description?: string;
  }
) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  if (opts.type !== "WITHDRAW" && !opts.categoryName?.trim())
    throw new ApiError(422, "A category is required");

  await assertDateOpen(tx, opts.branchId, opts.date);
  const wallet = await tx.wallet.findUnique({ where: { id: opts.walletId } });
  if (
    !wallet ||
    wallet.businessId !== opts.businessId ||
    wallet.branchId !== opts.branchId ||
    wallet.deletedAt
  ) {
    throw new ApiError(404, "Wallet not found");
  }
  if (!wallet.active) throw new ApiError(422, `Wallet ${wallet.name} is inactive`);

  const categoryName = opts.categoryName?.trim() || "Withdrawal";
  const txnNo = await nextNumber(tx, opts.businessId, opts.type);
  const it = await tx.incomeExpense.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: opts.branchId,
      type: opts.type,
      categoryName,
      amount: opts.amount,
      currency: wallet.currency,
      walletId: opts.walletId,
      date: opts.date,
      reference: opts.reference,
      description: opts.description,
      createdById: opts.userId,
    },
  });

  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: wallet.id,
    direction: opts.type === "INCOME" ? "DEBIT" : "CREDIT",
    amount: opts.amount,
    refType: opts.type,
    refId: it.id,
    description: `${txnNo} ${categoryName}`,
    createdById: opts.userId,
  });

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: opts.branchId,
    action: "CREATE", module: opts.type === "WITHDRAW" ? "wallet" : "income_expense",
    resourceType: "IncomeExpense", resourceId: it.id,
    after: { txnNo, type: opts.type, category: categoryName, amount: opts.amount },
  });
  return it;
}
