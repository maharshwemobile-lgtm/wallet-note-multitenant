import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computeDaySummary } from "@/services/summaryService";
import { todayBusinessDate } from "@/lib/dates";
import { isPlayEdition } from "@/lib/edition";

export const GET = withAuth("dashboard.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") ?? todayBusinessDate();
  const branchId = sp.get("branchId");
  const playEdition = isPlayEdition();

  const branchIds = branchId
    ? [branchId]
    : user.allBranches
      ? undefined
      : user.branchIds;

  const summary = await computeDaySummary(prisma, user.businessId, date, branchIds);

  // Each list names its game. These share one table, so an unfiltered query shows 2D bets
  // under a "3D" heading.
  const recentByGame = (gameType: string) =>
    playEdition ? Promise.resolve([]) : prisma.threeDTransaction.findMany({
      where: {
        businessId: user.businessId, deletedAt: null,
        settlementStatus: { not: "CANCELLED" },
        session: { gameType },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { session: { select: { name: true } } },
    });

  const [recentThreeD, recentTwoD, recentExchanges, pendingSessions, moduleSetting] = await Promise.all([
    recentByGame("THREE_D"),
    recentByGame("TWO_D"),
    prisma.exchangeTransaction.findMany({
      where: { businessId: user.businessId, deletedAt: null, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    playEdition ? Promise.resolve([]) : prisma.threeDSession.findMany({
      where: { businessId: user.businessId, gameType: "THREE_D", status: { in: ["OPEN", "CLOSED", "RESULT_ENTERED"] } },
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

  // PLAY hides the lottery area entirely, so both games are zeroed — not just 3D, or 2D
  // figures would show in an edition that is meant to have none.
  const zeroGame = {
    totalRecords: 0,
    totalBet: 0n,
    totalPotentialPayout: 0n,
    totalCommission: 0n,
    settledProfit: 0n,
    unsettledAmount: 0n,
  };
  const safeSummary = playEdition
    ? { ...summary, threeD: zeroGame, twoD: zeroGame }
    : summary;

  return json({
    date, summary: safeSummary, recentThreeD, recentTwoD, recentExchanges, pendingSessions,
    rates,
    pos,
  });
});
