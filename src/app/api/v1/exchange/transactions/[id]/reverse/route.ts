import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { reverseExchange } from "@/services/exchangeService";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("exchange.reverse", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  await prisma.$transaction(async (tx) => {
    await reverseExchange(tx, {
      exchangeId: params.id,
      reason: body.reason,
      userId: user.id,
      businessId: user.businessId,
    });
  });
  return json({ reversed: true });
});
