import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { assertBranchAccess } from "@/lib/tenant";

export const GET = withAuth("exchange.view", async ({ req, user }) => {
  const history = req.nextUrl.searchParams.get("history") === "1";
  const rates = await prisma.exchangeRate.findMany({
    where: { businessId: user.businessId, ...(history ? {} : { active: true }) },
    orderBy: { effectiveAt: "desc" },
    take: history ? 100 : 10,
  });
  return json(rates);
});

const schema = z.object({
  pair: z.string().default("THB/MMK"),
  buyRate: z.string().regex(/^\d+(\.\d+)?$/, "Invalid rate"),
  sellRate: z.string().regex(/^\d+(\.\d+)?$/, "Invalid rate"),
  branchId: z.string().optional(),
});

export const POST = withAuth("exchange.rates", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  if (body.branchId) await assertBranchAccess(user, body.branchId);
  const rate = await prisma.$transaction(async (tx) => {
    // Deactivate the previous board rate; history stays intact.
    await tx.exchangeRate.updateMany({
      where: { businessId: user.businessId, pair: body.pair, active: true },
      data: { active: false },
    });
    const r = await tx.exchangeRate.create({
      data: {
        businessId: user.businessId,
        branchId: body.branchId,
        pair: body.pair,
        buyRate: body.buyRate,
        sellRate: body.sellRate,
        setById: user.id,
        active: true,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "RATE_CHANGE", module: "exchange", resourceType: "ExchangeRate", resourceId: r.id,
      after: { pair: body.pair, buyRate: body.buyRate, sellRate: body.sellRate },
    });
    return r;
  });
  return json(rate, { status: 201 });
});
