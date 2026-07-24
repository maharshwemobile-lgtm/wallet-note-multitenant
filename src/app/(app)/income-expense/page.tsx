"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Item {
  id: string; txnNo: string; type: string; categoryName?: string; amount: string;
  currency: string; date: string; description?: string; status: string;
}
interface Category { id: string; type: string; name: string }
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

export default function IncomeExpensePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [totals, setTotals] = useState({ income: "0", expense: "0" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm, defaultBranchId } = useAuth();

  const [form, setForm] = useState({ type: "EXPENSE", categoryName: "", amount: "", walletId: "", date: "", description: "", reference: "" });

  const load = useCallback(() => {
    api<{ items: Item[]; totals: { income: string; expense: string } }>("/api/v1/income-expense?pageSize=100")
      .then((d) => { setItems(d.items); setTotals(d.totals); })
      .catch((e) => push(e.message, "error"));
    api<Category[]>("/api/v1/categories").then(setCategories).catch(() => {});
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
          type: form.type,
          categoryName: form.categoryName,
          amount: form.amount,
          walletId: form.walletId,
          date: form.date || undefined,
          description: form.description || undefined,
          reference: form.reference || undefined,
        },
      });
      push(`${form.type === "INCOME" ? "Income" : "Expense"} recorded`);
      setShowNew(false);
      setForm({ ...form, amount: "", description: "", reference: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <Spinner />;
  const catOptions = categories.filter((c) => c.type === form.type);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Income & Expense</h1>
        {hasPerm("income_expense.create") && (
          <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New entry</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total income" value={fmtMoney(totals.income, "MMK")} tone="green" />
        <StatCard label="Total expense" value={fmtMoney(totals.expense, "MMK")} tone="red" />
      </div>

      {items.length === 0 ? (
        <Card><Empty message="No entries yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Type", "Category", "Description", "Amount"]} rightAlign={[5]}>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2 text-xs">{it.txnNo}</td>
              <td className="px-3 py-2 text-xs">{it.date}</td>
              <td className="px-3 py-2">
                <span className={`text-xs font-bold ${it.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>{it.type}</span>
              </td>
              <td className="px-3 py-2">{it.categoryName ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{it.description ?? "—"}</td>
              <td className={`px-3 py-2 text-right font-medium tabular-nums ${it.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                {it.type === "INCOME" ? "+" : "-"}{fmtMoney(it.amount)} {it.currency}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New income / expense">
        <div className="space-y-3">
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, categoryName: "" })}>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}>
              <option value="">Select…</option>
              {catOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value="Other">Other</option>
            </Select>
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
            <Select label="Wallet" value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
              <option value="">Select…</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>)}
            </Select>
          </div>
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !form.amount || !form.walletId || !form.categoryName}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
