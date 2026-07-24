import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computeDaySummary } from "@/services/summaryService";
import { todayBusinessDate } from "@/lib/dates";

export const GET = withAuth("dashboard.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") ?? todayBusinessDate();
  const branchId = sp.get("branchId");

  const branchIds = branchId
    ? [branchId]
    : user.allBranches
      ? undefined
      : user.branchIds;

  const summary = await computeDaySummary(prisma, user.businessId, date, branchIds);

  const [recentThreeD, recentExchanges, pendingSessions, moduleSetting] = await Promise.all([
    prisma.threeDTransaction.findMany({
      where: { businessId: user.businessId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { session: { select: { name: true } } },
    }),
    prisma.exchangeTransaction.findMany({
      where: { businessId: user.businessId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.threeDSession.findMany({
      where: { businessId: user.businessId, status: { in: ["OPEN", "CLOSED", "RESULT_ENTERED"] } },
      orderBy: { drawDate: "desc" },
      take: 5,
    }),
    prisma.systemSetting.findUnique({
      where: { businessId_key: { businessId: user.businessId, key: "modules" } },
      select: { value: true },
    }),
  ]);

  const rates = await prisma.exchangeRate.findMany({
    where: { businessId: user.businessId, active: true },
  });

  let miniMartEnabled = true;
  if (moduleSetting) {
    try {
      miniMartEnabled = JSON.parse(moduleSetting.value).miniMartEnabled === true;
    } catch {
      miniMartEnabled = true;
    }
  }

  let pos;
  if (miniMartEnabled) {
    const [salesAgg, itemsWithStock] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          businessId: user.businessId, deletedAt: null, status: "COMPLETED", date,
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
        },
        _sum: { total: true, profit: true },
        _count: true,
      }),
      prisma.item.findMany({
        where: { businessId: user.businessId, deletedAt: null, active: true, minStock: { gt: 0 } },
        select: { id: true, name: true, minStock: true, stockLevels: { select: { quantity: true } } },
      }),
    ]);
    const lowStock = itemsWithStock
      .map((it) => ({ id: it.id, name: it.name, minStock: it.minStock, qty: it.stockLevels.reduce((a, l) => a + l.quantity, 0) }))
      .filter((x) => x.qty < x.minStock);

    pos = {
      salesCount: salesAgg._count,
      salesTotal: salesAgg._sum.total ?? 0n,
      salesProfit: salesAgg._sum.profit ?? 0n,
      lowStock,
    };
  }

  return json({
    date, summary, recentThreeD, recentExchanges, pendingSessions,
    rates,
    pos,
  });
});
