"use client";

import { useCallback, useEffect, useState } from "react";
import { MinusCircle } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Withdrawal {
  id: string;
  txnNo: string;
  amount: string;
  currency: string;
  date: string;
  description?: string;
  walletId: string;
}

interface Wallet {
  id: string;
  name: string;
  currency: string;
  currentBalance: string;
}

const EMPTY_FORM = { walletId: "", amount: "", date: "", description: "" };

export default function WithdrawPage() {
  const [items, setItems] = useState<Withdrawal[] | null>(null);
  const [totals, setTotals] = useState<{ currency: string; amount: string }[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { push } = useToast();
  const { defaultBranchId } = useAuth();

  const load = useCallback(() => {
    api<{
      items: Withdrawal[];
      totals: { withdrawByCurrency: { currency: string; amount: string }[] };
    }>(
      "/api/v1/income-expense?type=WITHDRAW&pageSize=100"
    )
      .then((data) => {
        setItems(data.items);
        setTotals(data.totals.withdrawByCurrency);
      })
      .catch((error) => push(error.message, "error"));
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
      setForm(EMPTY_FORM);
      load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Withdrawal failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <Spinner />;
  const walletName = (id: string) => wallets.find((wallet) => wallet.id === id)?.name ?? "-";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Withdraw</h1>
        <Button onClick={() => setShowNew(true)}>
          <MinusCircle size={16} className="mr-1 inline" />
          New withdrawal
        </Button>
      </div>

      {totals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map((total) => (
            <StatCard
              key={total.currency}
              label={`Total withdrawn (${total.currency})`}
              value={`${fmtMoney(total.amount)} ${total.currency}`}
              tone="red"
            />
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Card><Empty message="No withdrawals yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Wallet", "Reason", "Amount"]} rightAlign={[4]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 text-xs">{item.txnNo}</td>
              <td className="px-3 py-2 text-xs">{item.date}</td>
              <td className="px-3 py-2 text-xs">{walletName(item.walletId)}</td>
              <td className="px-3 py-2 text-xs">{item.description ?? "-"}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums text-red-600">
                -{fmtMoney(item.amount)} {item.currency}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New withdrawal">
        <div className="space-y-3">
          <Select
            label="Wallet"
            value={form.walletId}
            onChange={(event) => setForm({ ...form, walletId: event.target.value })}
          >
            <option value="">Select...</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} ({fmtMoney(wallet.currentBalance)} {wallet.currency})
              </option>
            ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Amount"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              inputMode="decimal"
            />
            <Input
              label="Date"
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </div>
          <Input
            label="Reason / note"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={create}
              disabled={busy || !form.amount || !form.walletId || !defaultBranchId}
            >
              {busy ? "Saving..." : "Confirm withdrawal"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
