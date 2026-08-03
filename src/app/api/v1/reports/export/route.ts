import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { minorToDecimalString } from "@/lib/money";
import { dateRangeUtc, todayBusinessDate, addDays } from "@/lib/dates";

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

function csvResponse(filename: string, rows: (string | number)[][]) {
  // BOM so Excel opens UTF-8 (Myanmar text) correctly
  return new NextResponse("﻿" + csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withAuth("report.export", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "three_d";
  const to = sp.get("to") ?? todayBusinessDate();
  const from = sp.get("from") ?? addDays(to, -30);
  const range = { gte: dateRangeUtc(from).gte, lt: dateRangeUtc(to).lt };

  if (type === "three_d" || type === "two_d") {
    const gameType = type === "two_d" ? "TWO_D" : "THREE_D";
    const txns = await prisma.threeDTransaction.findMany({
      where: {
        businessId: user.businessId,
        deletedAt: null,
        settlementStatus: { not: "CANCELLED" },
        createdAt: range,
        // These share one table; without this a 3D export also contains every 2D bet.
        session: { gameType },
        ...branchScope(user),
      },
      include: { session: { select: { name: true, drawDate: true } }, customer: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return csvResponse(`${type === "two_d" ? "two" : "three"}-d-${from}-to-${to}.csv`, [
      ["Txn No", "Draw Date", "Session", "Number", "Customer", "Bet Amount", "Odds", "Potential Payout", "Commission", "Net Amount", "Winner", "Win Amount", "Status"],
      ...txns.map((t) => [
        t.txnNo, t.session.drawDate, t.session.name, `="${t.number}"`, t.customer?.name ?? t.customerName ?? "",
        minorToDecimalString(t.betAmount), t.odds, minorToDecimalString(t.potentialPayout),
        minorToDecimalString(t.commissionAmount), minorToDecimalString(t.netAmount),
        t.isWinner ? "YES" : "", minorToDecimalString(t.winAmount), t.settlementStatus,
      ]),
    ]);
  }

  if (type === "exchange") {
    const txns = await prisma.exchangeTransaction.findMany({
      where: {
        businessId: user.businessId,
        deletedAt: null,
        status: "COMPLETED",
        createdAt: range,
        ...branchScope(user),
      },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return csvResponse(`exchange-${from}-to-${to}.csv`, [
      ["Txn No", "Date", "Type", "From", "From Amount", "To", "To Amount", "Rate", "Service Fee", "Profit", "Customer", "Status"],
      ...txns.map((t) => [
        t.txnNo, t.createdAt.toISOString().slice(0, 16).replace("T", " "), t.type,
        t.fromCurrency, minorToDecimalString(t.fromAmount), t.toCurrency, minorToDecimalString(t.toAmount),
        t.rate, minorToDecimalString(t.serviceFee), minorToDecimalString(t.profit),
        t.customer?.name ?? "", t.status,
      ]),
    ]);
  }

  if (type === "ledger") {
    const walletId = sp.get("walletId");
    if (!walletId) throw new ApiError(422, "walletId is required for ledger export");
    const entries = await prisma.walletLedgerEntry.findMany({
      where: { walletId, businessId: user.businessId, createdAt: range },
      orderBy: { createdAt: "asc" },
    });
    return csvResponse(`ledger-${from}-to-${to}.csv`, [
      ["Date", "Direction", "Amount", "Balance After", "Type", "Description"],
      ...entries.map((e) => [
        e.createdAt.toISOString().slice(0, 16).replace("T", " "),
        e.direction, minorToDecimalString(e.amount), minorToDecimalString(e.balanceAfter),
        e.refType, e.description ?? "",
      ]),
    ]);
  }

  throw new ApiError(422, `Unknown export type: ${type}`);
});
