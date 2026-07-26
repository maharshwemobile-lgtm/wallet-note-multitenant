import { z } from "zod";
import Decimal from "decimal.js";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor, mulMinor, isValidDecimalString } from "@/lib/money";
import { postLedger } from "@/services/walletService";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { notifyAuditFeed, transferNotice } from "@/lib/telegramNotify";

export const GET = withAuth("wallet.view", async ({ req, user }) => {
  const { skip, take, page, pageSize } = pagination(req);
  const [transfers, total] = await Promise.all([
    prisma.walletTransfer.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: "desc" },
      skip, take,
    }),
    prisma.walletTransfer.count({ where: { businessId: user.businessId } }),
  ]);
  return json({ transfers, total, page, pageSize });
});

const schema = z.object({
  sourceWalletId: z.string().min(1),
  destWalletId: z.string().min(1),
  amount: z.string().min(1),
  rate: z.string().optional(), // required when currencies differ: dest units per 1 source unit
  fee: z.string().default("0"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("wallet.transfer", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  if (body.sourceWalletId === body.destWalletId)
    throw new ApiError(422, "Source and destination wallets must differ");

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.wallet.findUnique({ where: { id: body.sourceWalletId } });
    const dest = await tx.wallet.findUnique({ where: { id: body.destWalletId } });
    if (!source || !dest || source.businessId !== user.businessId || dest.businessId !== user.businessId)
      throw new ApiError(404, "Wallet not found");

    const sourceAmount = toMinor(body.amount);
    const fee = toMinor(body.fee);
    let destAmount = sourceAmount - fee;
    let rate: string | undefined;

    if (source.currency !== dest.currency) {
      if (!body.rate || !isValidDecimalString(body.rate) || new Decimal(body.rate).lte(0))
        throw new ApiError(422, "A valid exchange rate is required for cross-currency transfers");
      rate = body.rate;
      destAmount = mulMinor(sourceAmount - fee, rate);
    }
    if (destAmount <= 0n) throw new ApiError(422, "Transfer amount must exceed the fee");

    const txnNo = await nextNumber(tx, user.businessId, "TRANSFER");
    const transfer = await tx.walletTransfer.create({
      data: {
        txnNo,
        businessId: user.businessId,
        branchId: source.branchId,
        sourceWalletId: source.id,
        destWalletId: dest.id,
        sourceAmount,
        destAmount,
        rate,
        fee,
        reference: body.reference,
        notes: body.notes,
        createdById: user.id,
      },
    });

    await postLedger(tx, {
      businessId: user.businessId,
      walletId: source.id,
      direction: "CREDIT",
      amount: sourceAmount,
      refType: "TRANSFER_OUT",
      refId: transfer.id,
      description: `${txnNo} → ${dest.name}`,
      createdById: user.id,
    });
    await postLedger(tx, {
      businessId: user.businessId,
      walletId: dest.id,
      direction: "DEBIT",
      amount: destAmount,
      refType: "TRANSFER_IN",
      refId: transfer.id,
      description: `${txnNo} ← ${source.name}`,
      createdById: user.id,
    });

    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: source.branchId,
      action: "CREATE", module: "wallet", resourceType: "WalletTransfer", resourceId: transfer.id,
      after: { txnNo, sourceAmount, destAmount, rate, fee },
    });
    return transfer;
  });
  const [source, dest] = await Promise.all([
    prisma.wallet.findFirst({
      where: { id: result.sourceWalletId, businessId: user.businessId },
      select: { name: true, currency: true },
    }),
    prisma.wallet.findFirst({
      where: { id: result.destWalletId, businessId: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);
  notifyAuditFeed(
    user.businessId,
    transferNotice({
      txnNo: result.txnNo,
      sourceName: source?.name ?? "Source wallet",
      destName: dest?.name ?? "Destination wallet",
      sourceAmount: result.sourceAmount,
      sourceCurrency: source?.currency ?? "MMK",
      destAmount: result.destAmount,
      destCurrency: dest?.currency ?? "MMK",
      createdByName: user.name,
    })
  );
  return json(result, { status: 201 });
});
