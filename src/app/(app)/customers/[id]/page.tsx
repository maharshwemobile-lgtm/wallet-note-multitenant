"use client";

import { useCallback, useEffect, useState, use } from "react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Card, Spinner, Badge, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Data {
  contact: { id: string; name: string; phone?: string; telegram?: string; address?: string; type: string; creditLimit: string; notes?: string };
  threeD: { id: string; txnNo: string; number: string; betAmount: string; isWinner: boolean; createdAt: string }[];
  exchanges: { id: string; txnNo: string; type: string; fromAmount: string; fromCurrency: string; toAmount: string; toCurrency: string; createdAt: string }[];
  receivables: { id: string; txnNo: string; originalAmount: string; remainingAmount: string; status: string; dueDate?: string }[];
  currentReceivable: string;
  currentPayable: string;
}

export default function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const { push } = useToast();
  const { playEdition } = useAuth();

  const load = useCallback(() => {
    api<Data>(`/api/v1/customers/${id}`).then(setData).catch((e) => push(e.message, "error"));
  }, [id, push]);
  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const c = data.contact;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">{c.name}</h1>
        <p className="text-sm text-gray-500">
          {c.type} {c.phone && `· ${c.phone}`} {c.telegram && `· ${c.telegram}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Current receivable" value={fmtMoney(data.currentReceivable, "MMK")} tone="blue" />
        <StatCard label="Current payable" value={fmtMoney(data.currentPayable, "MMK")} tone="amber" />
        <StatCard label="Credit limit" value={fmtMoney(c.creditLimit, "MMK")} />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Credit history</h3>
        {data.receivables.length === 0 ? <Empty message="No credit records" /> : (
          <Table headers={["Txn", "Original", "Remaining", "Due", "Status"]} rightAlign={[1, 2]}>
            {data.receivables.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs">{r.txnNo}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.originalAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(r.remainingAmount)}</td>
                <td className="px-3 py-2 text-xs">{r.dueDate ?? "—"}</td>
                <td className="px-3 py-2"><Badge status={r.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {!playEdition && <Card>
          <h3 className="mb-3 text-sm font-semibold">3D records</h3>
          {data.threeD.length === 0 ? <Empty message="No 3D records" /> : (
            <Table headers={["Txn", "Number", "Bet", "Date"]} rightAlign={[2]}>
              {data.threeD.map((t) => (
                <tr key={t.id} className={t.isWinner ? "bg-green-50 dark:bg-green-900/20" : ""}>
                  <td className="px-3 py-2 text-xs">{t.txnNo}</td>
                  <td className="px-3 py-2 font-mono font-bold">{t.number}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.betAmount)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(t.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>}
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Exchange history</h3>
          {data.exchanges.length === 0 ? <Empty message="No exchange records" /> : (
            <Table headers={["Txn", "Type", "Amount", "Date"]} rightAlign={[2]}>
              {data.exchanges.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-xs">{t.txnNo}</td>
                  <td className="px-3 py-2 text-xs">{t.type.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtMoney(t.fromAmount)} {t.fromCurrency} → {fmtMoney(t.toAmount)} {t.toCurrency}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(t.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
