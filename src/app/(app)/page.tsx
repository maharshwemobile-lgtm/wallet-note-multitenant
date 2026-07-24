"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { StatCard, Card, Select, Input, Spinner, Badge, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Summary {
  threeD: { totalRecords: number; totalBet: string; totalPotentialPayout: string; totalCommission: string; settledProfit: string; unsettledAmount: string };
  exchange: { buyVolumeThb: string; sellVolumeThb: string; serviceFees: string; profit: string };
  wallets: { totalMmk: string; totalThb: string; lowBalance: { id: string; name: string; currentBalance: string; minBalance: string }[] };
  credit: { newIssued: string; collected: string; outstanding: string };
  payable: { newIssued: string; paid: string; outstanding: string };
  general: { otherIncome: string; expense: string; netCashMovement: string };
}

interface DashData {
  date: string;
  summary: Summary;
  recentThreeD: { id: string; txnNo: string; number: string; betAmount: string; createdAt: string; session: { name: string } }[];
  recentExchanges: { id: string; txnNo: string; type: string; fromAmount: string; fromCurrency: string; toAmount: string; toCurrency: string; createdAt: string; status: string }[];
  pendingSessions: { id: string; name: string; drawDate: string; status: string }[];
  rates: { pair: string; buyRate: string; sellRate: string }[];
  pos?: {
    salesCount: number;
    salesTotal: string;
    salesProfit: string;
    lowStock: { id: string; name: string; minStock: number; qty: number }[];
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [date, setDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const { branches, miniMartEnabled, walletNoteEnabled } = useAuth();
  const { push } = useToast();
  const router = useRouter();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (branchId) params.set("branchId", branchId);
    api<DashData>(`/api/v1/dashboard/summary?${params}`)
      .then(setData)
      .catch((e) => push(e.message, "error"));
  }, [date, branchId, push]);

  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const s = data.summary;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{data.date}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Input type="date" value={date || data.date} onChange={(e) => setDate(e.target.value)} />
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      </div>

      {walletNoteEnabled && data.rates.length > 0 && (
        <Card className="flex flex-wrap items-center gap-6 py-3">
          {data.rates.map((r) => (
            <div key={r.pair} className="text-sm">
              <span className="font-semibold">{r.pair}</span>{" "}
              <span className="text-green-600">Buy {r.buyRate}</span>{" · "}
              <span className="text-blue-600">Sell {r.sellRate}</span>
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {miniMartEnabled && data.pos && (
          <>
            <StatCard label="Today's Sales" value={fmtMoney(data.pos.salesTotal, "MMK")} sub={`${data.pos.salesCount} sale(s)`} onClick={() => router.push("/sales")} />
            <StatCard label="Sales Profit" value={fmtMoney(data.pos.salesProfit, "MMK")} tone={BigInt(data.pos.salesProfit) >= 0n ? "green" : "red"} onClick={() => router.push("/sales")} />
          </>
        )}
        {walletNoteEnabled && <>
        <StatCard label="Total MMK Balance" value={fmtMoney(s.wallets.totalMmk, "MMK")} onClick={() => router.push("/wallets")} />
        <StatCard label="Total THB Balance" value={fmtMoney(s.wallets.totalThb, "THB")} onClick={() => router.push("/wallets")} />
        <StatCard label="3D Total Today" value={fmtMoney(s.threeD.totalBet, "MMK")} sub={`${s.threeD.totalRecords} records`} onClick={() => router.push("/three-d")} />
        <StatCard label="3D Payout Exposure" value={fmtMoney(s.threeD.totalPotentialPayout, "MMK")} tone="amber" onClick={() => router.push("/three-d")} />
        <StatCard label="3D Settled P/L" value={fmtMoney(s.threeD.settledProfit, "MMK")} tone={BigInt(s.threeD.settledProfit) >= 0n ? "green" : "red"} onClick={() => router.push("/three-d")} />
        <StatCard label="Exchange Buy (THB)" value={fmtMoney(s.exchange.buyVolumeThb, "THB")} onClick={() => router.push("/exchange")} />
        <StatCard label="Exchange Sell (THB)" value={fmtMoney(s.exchange.sellVolumeThb, "THB")} onClick={() => router.push("/exchange")} />
        <StatCard label="Exchange Profit" value={fmtMoney(s.exchange.profit, "MMK")} tone={BigInt(s.exchange.profit) >= 0n ? "green" : "red"} onClick={() => router.push("/exchange")} />
        <StatCard label="Customer Receivable" value={fmtMoney(s.credit.outstanding, "MMK")} tone="blue" onClick={() => router.push("/credit")} />
        <StatCard label="Business Payable" value={fmtMoney(s.payable.outstanding, "MMK")} tone="amber" onClick={() => router.push("/credit?tab=payable")} />
        <StatCard label="Today's Income" value={fmtMoney(s.general.otherIncome, "MMK")} tone="green" onClick={() => router.push("/income-expense")} />
        <StatCard label="Today's Expense" value={fmtMoney(s.general.expense, "MMK")} tone="red" onClick={() => router.push("/income-expense")} />
        <StatCard label="Net Cash Movement" value={fmtMoney(s.general.netCashMovement, "MMK")} tone={BigInt(s.general.netCashMovement) >= 0n ? "green" : "red"} />
        <StatCard label="Unsettled 3D" value={fmtMoney(s.threeD.unsettledAmount, "MMK")} tone="amber" onClick={() => router.push("/three-d")} />
        <StatCard label="Credit Collected Today" value={fmtMoney(s.credit.collected, "MMK")} tone="green" onClick={() => router.push("/credit")} />
        <StatCard label="Payable Paid Today" value={fmtMoney(s.payable.paid, "MMK")} onClick={() => router.push("/credit?tab=payable")} />
        </>}
      </div>

      {miniMartEnabled && data.pos && data.pos.lowStock.length > 0 && (
        <Card className="border-red-300 dark:border-red-800">
          <h3 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">Low stock alerts</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {data.pos.lowStock.map((it) => (
              <li key={it.id}>
                {it.name}: <b className="text-red-600">{it.qty}</b> (min {it.minStock})
              </li>
            ))}
          </ul>
        </Card>
      )}

      {walletNoteEnabled && s.wallets.lowBalance.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Low wallet balance alerts</h3>
          <ul className="space-y-1 text-sm">
            {s.wallets.lowBalance.map((w) => (
              <li key={w.id}>
                {w.name}: <span className="font-medium text-red-600">{fmtMoney(w.currentBalance)}</span> (min {fmtMoney(w.minBalance)})
              </li>
            ))}
          </ul>
        </Card>
      )}

      {walletNoteEnabled && <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Pending 3D sessions</h3>
          {data.pendingSessions.length === 0 && <p className="text-sm text-gray-500">No pending sessions</p>}
          <ul className="space-y-2">
            {data.pendingSessions.map((ss) => (
              <li key={ss.id} className="flex items-center justify-between text-sm">
                <button className="text-blue-600 hover:underline" onClick={() => router.push(`/three-d/${ss.id}`)}>
                  {ss.name} · {ss.drawDate}
                </button>
                <Badge status={ss.status} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Recent 3D records</h3>
          <ul className="space-y-2">
            {data.recentThreeD.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span className="font-mono font-bold">{t.number}</span>
                <span className="tabular-nums">{fmtMoney(t.betAmount)} MMK</span>
                <span className="text-xs text-gray-500">{fmtDateTime(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Recent exchanges</h3>
          <ul className="space-y-2">
            {data.recentExchanges.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-xs">{t.type.replace("_", " ")}</span>
                <span className="tabular-nums">{fmtMoney(t.fromAmount)} {t.fromCurrency} → {fmtMoney(t.toAmount)} {t.toCurrency}</span>
                <Badge status={t.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>}
    </div>
  );
}
