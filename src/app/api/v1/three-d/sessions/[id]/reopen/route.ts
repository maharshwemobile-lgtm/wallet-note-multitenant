import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { reopenSettlement } from "@/services/threeDService";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("three_d.reopen", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const session = await prisma.threeDSession.findUnique({ where: { id: params.id } });
  if (!session || session.businessId !== user.businessId) throw new ApiError(404, "Session not found");

  await prisma.$transaction(async (tx) => {
    await reopenSettlement(tx, {
      sessionId: session.id,
      reason: body.reason,
      userId: user.id,
      businessId: user.businessId,
    });
  });
  return json({ reopened: true });
});
