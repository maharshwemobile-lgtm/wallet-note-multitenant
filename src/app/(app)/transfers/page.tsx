"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Transfer {
  id: string; txnNo: string; sourceWalletId: string; destWalletId: string;
  sourceAmount: string; destAmount: string; rate?: string; fee: string;
  notes?: string; createdAt: string;
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const [form, setForm] = useState({ sourceWalletId: "", destWalletId: "", amount: "", rate: "", fee: "0", notes: "" });

  const load = useCallback(() => {
    api<{ transfers: Transfer[] }>("/api/v1/wallet-transfers?pageSize=100")
      .then((d) => setTransfers(d.transfers))
      .catch((e) => push(e.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  const source = wallets.find((w) => w.id === form.sourceWalletId);
  const dest = wallets.find((w) => w.id === form.destWalletId);
  const crossCurrency = source && dest && source.currency !== dest.currency;
  const walletName = (id: string) => wallets.find((w) => w.id === id)?.name ?? "—";

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/wallet-transfers", {
        method: "POST",
        body: { ...form, rate: crossCurrency ? form.rate : undefined },
      });
      push("Transfer completed");
      setShowNew(false);
      setForm({ sourceWalletId: "", destWalletId: "", amount: "", rate: "", fee: "0", notes: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!transfers) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Transfer</h1>
        {hasPerm("wallet.transfer") && (
          <Button onClick={() => setShowNew(true)}><Send size={16} className="mr-1 inline" />New transfer</Button>
        )}
      </div>

      {transfers.length === 0 ? (
        <Card><Empty message="No transfers yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "From", "To", "Amount", "Fee", "Notes"]} rightAlign={[4, 5]}>
          {transfers.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2 text-xs">{t.txnNo}</td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(t.createdAt)}</td>
              <td className="px-3 py-2">{walletName(t.sourceWalletId)}</td>
              <td className="px-3 py-2">{walletName(t.destWalletId)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtMoney(t.sourceAmount)} → {fmtMoney(t.destAmount)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtMoney(t.fee)}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{t.notes ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New transfer">
        <div className="space-y-3">
          <Select label="From wallet" value={form.sourceWalletId} onChange={(e) => setForm({ ...form, sourceWalletId: e.target.value })}>
            <option value="">Select…</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>)}
          </Select>
          <Select label="To wallet" value={form.destWalletId} onChange={(e) => setForm({ ...form, destWalletId: e.target.value })}>
            <option value="">Select…</option>
            {wallets.filter((w) => w.id !== form.sourceWalletId).map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>)}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={`Amount${source ? ` (${source.currency})` : ""}`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
            <Input label="Fee" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} inputMode="decimal" />
          </div>
          {crossCurrency && (
            <Input
              label={`Exchange rate (${dest!.currency} per 1 ${source!.currency})`}
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
              inputMode="decimal"
            />
          )}
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              disabled={busy || !form.sourceWalletId || !form.destWalletId || !form.amount || (!!crossCurrency && !form.rate)}
              onClick={create}
            >{busy ? "Transferring…" : "Confirm transfer"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
