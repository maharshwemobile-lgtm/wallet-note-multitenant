import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { reverseExchange } from "@/services/exchangeService";
import { notifyAuditFeed, reversalNotice } from "@/lib/telegramNotify";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("exchange.reverse", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const exchange = await prisma.exchangeTransaction.findFirst({ where: { id: params.id, businessId: user.businessId } });
  await prisma.$transaction(async (tx) => {
    await reverseExchange(tx, {
      exchangeId: params.id,
      reason: body.reason,
      userId: user.id,
      businessId: user.businessId,
    });
  });
  notifyAuditFeed(
    user.businessId,
    reversalNotice({ icon: "💱", label: "Exchange", txnNo: exchange?.txnNo ?? params.id, reason: body.reason, createdByName: user.name })
  );
  return json({ reversed: true });
});
