"use client";

import { useCallback, useEffect, useState } from "react";
import { MinusCircle } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Item {
  id: string; txnNo: string; amount: string; currency: string;
  date: string; description?: string; status: string; walletId: string;
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

export default function WithdrawPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState("0");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { defaultBranchId } = useAuth();

  const [form, setForm] = useState({ walletId: "", amount: "", date: "", description: "" });

  const load = useCallback(() => {
    api<{ items: Item[]; totals: { withdraw: string } }>("/api/v1/income-expense?type=WITHDRAW&pageSize=100")
      .then((d) => { setItems(d.items); setTotal(d.totals.withdraw); })
      .catch((e) => push(e.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/income-expense", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          type: "WITHDRAW",
          amount: form.amount,
          walletId: form.walletId,
          date: form.date || undefined,
          description: form.description || undefined,
        },
      });
      push("Withdrawal recorded");
      setShowNew(false);
      setForm({ walletId: "", amount: "", date: "", description: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <Spinner />;
  const wallet = (id: string) => wallets.find((w) => w.id === id);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Withdraw</h1>
        <Button onClick={() => setShowNew(true)}><MinusCircle size={16} className="mr-1 inline" />New withdrawal</Button>
      </div>

      <StatCard label="Total withdrawn" value={fmtMoney(total, "MMK")} tone="red" />

      {items.length === 0 ? (
        <Card><Empty message="No withdrawals yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Wallet", "Reason", "Amount"]} rightAlign={[4]}>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2 text-xs">{it.txnNo}</td>
              <td className="px-3 py-2 text-xs">{it.date}</td>
              <td className="px-3 py-2 text-xs">{wallet(it.walletId)?.name ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{it.description ?? "—"}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums text-red-600">
                -{fmtMoney(it.amount)} {it.currency}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New withdrawal">
        <div className="space-y-3">
          <Select label="Wallet" value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
            <option value="">Select…</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>)}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <Input label="Reason / note" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button variant="danger" onClick={create} disabled={busy || !form.amount || !form.walletId}>
              {busy ? "Saving…" : "Confirm withdrawal"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
