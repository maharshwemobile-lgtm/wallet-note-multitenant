import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createTransfer } from "@/services/walletService";
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
  const result = await prisma.$transaction((tx) =>
    createTransfer(tx, {
      businessId: user.businessId,
      userId: user.id,
      sourceWalletId: body.sourceWalletId,
      destWalletId: body.destWalletId,
      amount: body.amount,
      rate: body.rate,
      fee: body.fee,
      reference: body.reference,
      notes: body.notes,
    })
  );
  const [source, dest] = await Promise.all([
    prisma.wallet.findUnique({ where: { id: result.sourceWalletId }, select: { name: true, currency: true } }),
    prisma.wallet.findUnique({ where: { id: result.destWalletId }, select: { name: true, currency: true } }),
  ]);
  notifyAuditFeed(user.businessId, transferNotice({
    txnNo: result.txnNo,
    sourceName: source?.name ?? "?", destName: dest?.name ?? "?",
    sourceAmount: result.sourceAmount, sourceCurrency: source?.currency ?? "MMK",
    destAmount: result.destAmount, destCurrency: dest?.currency ?? "MMK",
    createdByName: user.name,
  }));
  return json(result, { status: 201 });
});
