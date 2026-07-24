"use client";

import { useCallback, useEffect, useState, use } from "react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Spinner, Table, Empty, useToast } from "@/components/ui";

interface Entry {
  id: string; direction: string; amount: string; balanceAfter: string;
  refType: string; description?: string; createdAt: string;
}
interface Data {
  wallet: { id: string; name: string; code: string; currency: string; currentBalance: string };
  entries: Entry[];
  total: number;
  page: number;
  pageSize: number;
}

export default function WalletLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const { push } = useToast();

  const load = useCallback(() => {
    api<Data>(`/api/v1/wallets/${id}/ledger?page=${page}`)
      .then(setData)
      .catch((e) => push(e.message, "error"));
  }, [id, page, push]);
  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{data.wallet.name}</h1>
          <p className="text-sm text-gray-500">Ledger · {data.wallet.code}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-gray-500">Current balance</div>
          <div className="text-2xl font-bold tabular-nums">{fmtMoney(data.wallet.currentBalance)} {data.wallet.currency}</div>
        </div>
      </div>

      {data.entries.length === 0 ? (
        <Card><Empty message="No ledger entries" /></Card>
      ) : (
        <Table headers={["Date", "Type", "Description", "In", "Out", "Balance"]} rightAlign={[3, 4, 5]}>
          {data.entries.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(e.createdAt)}</td>
              <td className="px-3 py-2 text-xs">{e.refType.replace(/_/g, " ")}</td>
              <td className="px-3 py-2 text-xs">{e.description ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-600">{e.direction === "DEBIT" ? fmtMoney(e.amount) : ""}</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-600">{e.direction === "CREDIT" ? fmtMoney(e.amount) : ""}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(e.balanceAfter)}</td>
            </tr>
          ))}
        </Table>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
