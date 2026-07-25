import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assertBranchAccess } from "@/lib/tenant";
import { computeDaySummary } from "@/services/summaryService";
import { audit } from "@/lib/audit";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { isPlayEdition } from "@/lib/edition";

function playSafeSummary<T extends { threeD: unknown }>(summary: T): T {
  if (!isPlayEdition()) return summary;
  return {
    ...summary,
    threeD: {
      totalRecords: 0,
      totalBet: 0n,
      totalPotentialPayout: 0n,
      totalCommission: 0n,
      settledProfit: 0n,
      unsettledAmount: 0n,
    },
  };
}

export const GET = withAuth("daily_close.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req);

  // ?preview=1&date=...&branchId=... returns the computed summary without saving
  if (sp.get("preview") === "1") {
    const date = sp.get("date") ?? todayBusinessDate();
    const branchId = sp.get("branchId");
    if (!branchId) throw new ApiError(422, "branchId is required");
    await assertBranchAccess(user, branchId);
    const summary = await computeDaySummary(prisma, user.businessId, date, [branchId]);
    const existing = await prisma.dailyClose.findUnique({
      where: { branchId_date: { branchId, date } },
    });
    return json({ date, branchId, summary: playSafeSummary(summary), existing });
  }

  const where = { businessId: user.businessId };
  const [items, total] = await Promise.all([
    prisma.dailyClose.findMany({ where, orderBy: { date: "desc" }, skip, take }),
    prisma.dailyClose.count({ where }),
  ]);
  return json({ items, total, page, pageSize });
});

const schema = z.object({
  branchId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate),
  notes: z.string().optional(),
});

export const POST = withAuth("daily_close.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);

  const close = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyClose.findUnique({
      where: { branchId_date: { branchId: body.branchId, date: body.date } },
    });
    if (existing && (existing.status === "CLOSED" || existing.status === "APPROVED"))
      throw new ApiError(422, `${body.date} is already closed for this branch`);

    // Block closing when unsettled 3D sessions remain for the date
    const unsettledSessions = isPlayEdition() ? 0 : await tx.threeDSession.count({
      where: {
        businessId: user.businessId,
        drawDate: body.date,
        status: { in: ["OPEN", "CLOSED", "RESULT_ENTERED"] },
      },
    });
    if (unsettledSessions > 0)
      throw new ApiError(422, `${unsettledSessions} 3D session(s) for ${body.date} are not settled yet`);

    const summary = playSafeSummary(await computeDaySummary(tx, user.businessId, body.date, [body.branchId]));
    const summaryJson = JSON.stringify(summary, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

    const c = existing
      ? await tx.dailyClose.update({
          where: { id: existing.id },
          data: { status: "CLOSED", summary: summaryJson, countedNotes: body.notes, closedAt: new Date(), submittedById: user.id },
        })
      : await tx.dailyClose.create({
          data: {
            businessId: user.businessId,
            branchId: body.branchId,
            date: body.date,
            status: "CLOSED",
            summary: summaryJson,
            countedNotes: body.notes,
            closedAt: new Date(),
            submittedById: user.id,
          },
        });

    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "DAILY_CLOSE", module: "daily_close", resourceType: "DailyClose", resourceId: c.id,
      after: { date: body.date },
    });
    return c;
  });
  return json(close, { status: 201 });
});
