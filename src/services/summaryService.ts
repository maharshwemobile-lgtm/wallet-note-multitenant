import { Tx } from "@/lib/prisma";
import { dateRangeUtc } from "@/lib/dates";

// Computes the daily business summary used by both the dashboard and daily close.

export interface GameTotals {
  totalRecords: number;
  totalBet: bigint;
  totalPotentialPayout: bigint;
  totalCommission: bigint;
  settledProfit: bigint;
  unsettledAmount: bigint;
}

export interface DaySummary {
  // Reported per game. 2D and 3D share one table, so without splitting them here a 2D bet
  // would be counted and shown as 3D.
  threeD: GameTotals;
  twoD: GameTotals;
  exchange: {
    buyVolumeThb: bigint;
    sellVolumeThb: bigint;
    serviceFees: bigint;
    profit: bigint;
  };
  wallets: { totalMmk: bigint; totalThb: bigint; lowBalance: { id: string; name: string; currentBalance: bigint; minBalance: bigint }[] };
  credit: { newIssued: bigint; collected: bigint; outstanding: bigint };
  payable: { newIssued: bigint; paid: bigint; outstanding: bigint };
  general: { otherIncome: bigint; expense: bigint; netCashMovement: bigint };
}

export async function computeDaySummary(
  tx: Tx,
  businessId: string,
  date: string,
  branchIds?: string[] // undefined = all branches
): Promise<DaySummary> {
  const range = dateRangeUtc(date);
  const branchFilter = branchIds ? { branchId: { in: branchIds } } : {};

  // --- Lottery, per game (sessions drawn on this date)
  async function gameTotals(gameType: string): Promise<GameTotals> {
    const txns = await tx.threeDTransaction.findMany({
      where: {
        businessId, deletedAt: null, settlementStatus: { not: "CANCELLED" },
        session: { drawDate: date, gameType },
        ...branchFilter,
      },
      select: { betAmount: true, potentialPayout: true, commissionAmount: true, settlementStatus: true },
    });
    const settlements = await tx.threeDSettlement.findMany({
      where: { session: { businessId, drawDate: date, gameType }, reopenedAt: null },
      select: { netProfit: true },
    });
    let totalBet = 0n, totalPayout = 0n, totalCommission = 0n, unsettled = 0n;
    for (const t of txns) {
      totalBet += t.betAmount;
      totalCommission += t.commissionAmount;
      // Exposure is what could still have to be paid out. Once a record is settled the
      // result is known and nothing is owed on it beyond what settlement already booked,
      // so counting it here would report a liability that no longer exists.
      if (t.settlementStatus === "PENDING") {
        totalPayout += t.potentialPayout;
        unsettled += t.betAmount;
      }
    }
    return {
      totalRecords: txns.length,
      totalBet,
      totalPotentialPayout: totalPayout,
      totalCommission,
      settledProfit: settlements.reduce((a, x) => a + x.netProfit, 0n),
      unsettledAmount: unsettled,
    };
  }
  const threeD = await gameTotals("THREE_D");
  const twoD = await gameTotals("TWO_D");

  // --- Exchange (transactions created within the date)
  const exchanges = await tx.exchangeTransaction.findMany({
    where: {
      businessId, deletedAt: null, status: "COMPLETED",
      createdAt: range,
      ...branchFilter,
    },
    select: { type: true, fromCurrency: true, fromAmount: true, toAmount: true, serviceFee: true, profit: true },
  });
  let buyThb = 0n, sellThb = 0n, fees = 0n, exProfit = 0n;
  for (const e of exchanges) {
    const thb = e.fromCurrency === "THB" ? e.fromAmount : e.toAmount;
    if (e.type === "BUY_THB") buyThb += thb;
    if (e.type === "SELL_THB") sellThb += thb;
    fees += e.serviceFee;
    exProfit += e.profit;
  }

  // --- Wallets
  const wallets = await tx.wallet.findMany({
    where: { businessId, deletedAt: null, active: true, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: { id: true, name: true, currency: true, currentBalance: true, minBalance: true },
  });
  let totalMmk = 0n, totalThb = 0n;
  const lowBalance = [];
  for (const w of wallets) {
    if (w.currency === "MMK") totalMmk += w.currentBalance;
    if (w.currency === "THB") totalThb += w.currentBalance;
    if (w.minBalance > 0n && w.currentBalance < w.minBalance) {
      lowBalance.push({ id: w.id, name: w.name, currentBalance: w.currentBalance, minBalance: w.minBalance });
    }
  }

  // --- Credit / Payable
  const [newCredit, collected, outstandingCredit, newPayable, paidPayable, outstandingPayable] =
    await Promise.all([
      tx.receivable.aggregate({
        where: { businessId, deletedAt: null, creditDate: date, ...branchFilter },
        _sum: { originalAmount: true },
      }),
      tx.receivablePayment.aggregate({
        where: { date, receivable: { businessId, ...branchFilter } },
        _sum: { amount: true },
      }),
      tx.receivable.aggregate({
        where: { businessId, deletedAt: null, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] }, ...branchFilter },
        _sum: { remainingAmount: true },
      }),
      tx.payable.aggregate({
        where: { businessId, deletedAt: null, payableDate: date, ...branchFilter },
        _sum: { originalAmount: true },
      }),
      tx.payablePayment.aggregate({
        where: { date, payable: { businessId, ...branchFilter } },
        _sum: { amount: true },
      }),
      tx.payable.aggregate({
        where: { businessId, deletedAt: null, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] }, ...branchFilter },
        _sum: { remainingAmount: true },
      }),
    ]);

  // --- Income / Expense
  const [income, expense] = await Promise.all([
    tx.incomeExpense.aggregate({
      where: { businessId, deletedAt: null, type: "INCOME", status: "COMPLETED", date, ...branchFilter },
      _sum: { amount: true },
    }),
    tx.incomeExpense.aggregate({
      where: { businessId, deletedAt: null, type: "EXPENSE", status: "COMPLETED", date, ...branchFilter },
      _sum: { amount: true },
    }),
  ]);

  // Net cash movement from the ledger for the date
  const ledger = await tx.walletLedgerEntry.findMany({
    where: { businessId, createdAt: range, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: { direction: true, amount: true },
  });
  let netCash = 0n;
  for (const l of ledger) netCash += l.direction === "DEBIT" ? l.amount : -l.amount;

  return {
    threeD,
    twoD,
    exchange: { buyVolumeThb: buyThb, sellVolumeThb: sellThb, serviceFees: fees, profit: exProfit },
    wallets: { totalMmk, totalThb, lowBalance },
    credit: {
      newIssued: newCredit._sum.originalAmount ?? 0n,
      collected: collected._sum.amount ?? 0n,
      outstanding: outstandingCredit._sum.remainingAmount ?? 0n,
    },
    payable: {
      newIssued: newPayable._sum.originalAmount ?? 0n,
      paid: paidPayable._sum.amount ?? 0n,
      outstanding: outstandingPayable._sum.remainingAmount ?? 0n,
    },
    general: {
      otherIncome: income._sum.amount ?? 0n,
      expense: expense._sum.amount ?? 0n,
      netCashMovement: netCash,
    },
  };
}
