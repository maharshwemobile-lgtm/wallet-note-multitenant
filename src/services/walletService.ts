import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

// The single choke point for wallet balance changes. A wallet balance is never
// mutated except through postLedger, inside a database transaction, so the
// ledger always reconciles to the balance.

export interface LedgerPost {
  businessId: string;
  walletId: string;
  direction: "DEBIT" | "CREDIT"; // DEBIT = money in, CREDIT = money out
  amount: bigint; // positive, minor units of the wallet currency
  refType: string;
  refId?: string;
  description?: string;
  createdById: string;
  allowNegative?: boolean;
}

export async function postLedger(tx: Tx, post: LedgerPost) {
  if (post.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");

  const wallet = await tx.wallet.findUnique({ where: { id: post.walletId } });
  if (!wallet || wallet.businessId !== post.businessId || wallet.deletedAt)
    throw new ApiError(404, "Wallet not found");
  if (!wallet.active) throw new ApiError(422, `Wallet ${wallet.name} is inactive`);

  const delta = post.direction === "DEBIT" ? post.amount : -post.amount;
  const newBalance = wallet.currentBalance + delta;
  if (newBalance < 0n && !post.allowNegative) {
    throw new ApiError(422, `Insufficient balance in wallet ${wallet.name}`);
  }

  // Optimistic-lock the balance update: fail if another transaction touched it.
  const updated = await tx.wallet.updateMany({
    where: { id: wallet.id, version: wallet.version },
    data: { currentBalance: newBalance, version: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ApiError(409, "Wallet was changed by another operation. Please retry.");
  }

  const entry = await tx.walletLedgerEntry.create({
    data: {
      walletId: wallet.id,
      businessId: post.businessId,
      branchId: wallet.branchId,
      direction: post.direction,
      amount: post.amount,
      balanceAfter: newBalance,
      refType: post.refType,
      refId: post.refId,
      description: post.description,
      createdById: post.createdById,
    },
  });
  return { entry, wallet: { ...wallet, currentBalance: newBalance } };
}

/** Reverse all ledger entries with a given refType/refId (used for reversals/reopen). */
export async function reverseLedgerEntries(
  tx: Tx,
  businessId: string,
  refType: string,
  refId: string,
  createdById: string,
  reasonNote: string
) {
  const entries = await tx.walletLedgerEntry.findMany({ where: { businessId, refType, refId } });
  for (const e of entries) {
    await postLedger(tx, {
      businessId,
      walletId: e.walletId,
      direction: e.direction === "DEBIT" ? "CREDIT" : "DEBIT",
      amount: e.amount,
      refType: "REVERSAL",
      refId: e.id,
      description: `Reversal: ${reasonNote}`,
      createdById,
      allowNegative: true,
    });
  }
  return entries.length;
}
