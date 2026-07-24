import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { previewSettlement, settleSession } from "@/services/threeDService";

const schema = z.object({
  resultNumber: z.string().regex(/^\d{3}$/, "Result must be exactly three digits"),
  walletId: z.string().optional(),
  preview: z.boolean().default(false),
});

export const POST = withAuth("three_d.settle", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const session = await prisma.threeDSession.findUnique({ where: { id: params.id } });
  if (!session || session.businessId !== user.businessId) throw new ApiError(404, "Session not found");

  if (body.preview) {
    const preview = await previewSettlement(prisma, session.id, body.resultNumber);
    return json(preview);
  }

  const result = await prisma.$transaction(async (tx) => {
    return settleSession(tx, {
      sessionId: session.id,
      resultNumber: body.resultNumber,
      walletId: body.walletId,
      userId: user.id,
      businessId: user.businessId,
    });
  });
  return json(result);
});
