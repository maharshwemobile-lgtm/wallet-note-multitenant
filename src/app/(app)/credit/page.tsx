"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Badge, Table, Empty, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Item {
  id: string; txnNo: string; originalAmount: string; paidAmount: string; remainingAmount: string;
  currency: string; dueDate?: string; status: string; aging: string; notes?: string;
  customer?: { name: string; phone?: string }; supplier?: { name: string; phone?: string };
  creditDate?: string; payableDate?: string; category?: string;
}
interface Contact { id: string; name: string; type: string }
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

function CreditContent() {
  const search = useSearchParams();
  const [tab, setTab] = useState<"receivable" | "payable">(search.get("tab") === "payable" ? "payable" : "receivable");
  const [items, setItems] = useState<Item[] | null>(null);
  const [outstanding, setOutstanding] = useState("0");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [payItem, setPayItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm, defaultBranchId } = useAuth();

  const [form, setForm] = useState({ contactId: "", amount: "", dueDate: "", reference: "", notes: "", category: "" });
  const [pay, setPay] = useState({ amount: "", walletId: "", notes: "" });

  const isRec = tab === "receivable";
  const base = isRec ? "/api/v1/receivables" : "/api/v1/payables";

  const load = useCallback(() => {
    setItems(null);
    api<{ items: Item[]; totalOutstanding: string }>(`${base}?pageSize=100`)
      .then((d) => { setItems(d.items); setOutstanding(d.totalOutstanding); })
      .catch((e) => push(e.message, "error"));
    api<{ contacts: Contact[] }>("/api/v1/customers?pageSize=200").then((d) => setContacts(d.contacts)).catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [base, push]);
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      await api(base, {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          [isRec ? "customerId" : "supplierId"]: form.contactId,
          amount: form.amount,
          dueDate: form.dueDate || undefined,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
          ...(isRec ? {} : { category: form.category || undefined }),
        },
      });
      push(isRec ? "Credit recorded" : "Payable recorded");
      setShowNew(false);
      setForm({ contactId: "", amount: "", dueDate: "", reference: "", notes: "", category: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function collect() {
    if (!payItem) return;
    setBusy(true);
    try {
      await api(`${base}/${payItem.id}/payments`, { method: "POST", body: pay });
      push(isRec ? "Collection recorded" : "Payment recorded");
      setPayItem(null);
      setPay({ amount: "", walletId: "", notes: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const canCreate = hasPerm(isRec ? "credit.create" : "payable.create");
  const canPay = hasPerm(isRec ? "credit.collect" : "payable.pay");
  const contactOptions = contacts.filter((c) => (isRec ? true : c.type === "SUPPLIER" || c.type === "CREDITOR" || c.type === "OTHER"));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Credit & Payable</h1>
        {canCreate && <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />{isRec ? "New credit" : "New payable"}</Button>}
      </div>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800 w-fit">
        {(["receivable", "payable"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium",
              tab === t ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"
            )}
          >
            {t === "receivable" ? "Customer credit" : "Business payable"}
          </button>
        ))}
      </div>

      <Card className="py-3 text-sm">
        Total outstanding: <b className="tabular-nums text-lg">{fmtMoney(outstanding)} MMK</b>
      </Card>

      {!items ? <Spinner /> : items.length === 0 ? (
        <Card><Empty message={`No ${tab} records`} /></Card>
      ) : (
        <Table headers={["Txn", isRec ? "Customer" : "Supplier", "Original", "Paid", "Remaining", "Due date", "Aging", "Status", ""]} rightAlign={[2, 3, 4]}>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2 text-xs">{it.txnNo}</td>
              <td className="px-3 py-2 font-medium">{(isRec ? it.customer : it.supplier)?.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.originalAmount)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-600">{fmtMoney(it.paidAmount)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(it.remainingAmount)}</td>
              <td className="px-3 py-2 text-xs">{it.dueDate ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{it.aging === "CURRENT" ? "Current" : `${it.aging} days`}</td>
              <td className="px-3 py-2"><Badge status={it.status} /></td>
              <td className="px-3 py-2">
                {canPay && it.status !== "PAID" && it.status !== "CANCELLED" && (
                  <Button size="sm" variant="secondary" onClick={() => { setPay({ amount: "", walletId: "", notes: "" }); setPayItem(it); }}>
                    {isRec ? "Collect" : "Pay"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* New */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title={isRec ? "New customer credit" : "New business payable"}>
        <div className="space-y-3">
          <Select label={isRec ? "Customer" : "Supplier / creditor"} value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
            <option value="">Select…</option>
            {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (MMK)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
            <Input label="Due date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          {!isRec && <Input label="Expense category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Rent" />}
          <Input label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !form.contactId || !form.amount}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Collect / Pay */}
      <Modal open={!!payItem} onClose={() => setPayItem(null)} title={isRec ? `Collect ${payItem?.txnNo}` : `Pay ${payItem?.txnNo}`}>
        <div className="space-y-3">
          <p className="text-sm">
            Remaining: <b className="tabular-nums">{payItem && fmtMoney(payItem.remainingAmount)} {payItem?.currency}</b>
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input label="Amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} inputMode="decimal" />
            </div>
            <Button variant="secondary" size="sm" className="mt-6" onClick={() => payItem && setPay({ ...pay, amount: (Number(BigInt(payItem.remainingAmount)) / 100).toString() })}>
              Full
            </Button>
          </div>
          <Select label={isRec ? "Deposit to wallet" : "Pay from wallet"} value={pay.walletId} onChange={(e) => setPay({ ...pay, walletId: e.target.value })}>
            <option value="">Select…</option>
            {wallets.filter((w) => w.currency === (payItem?.currency ?? "MMK")).map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
            ))}
          </Select>
          <Input label="Notes" value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayItem(null)}>Cancel</Button>
            <Button onClick={collect} disabled={busy || !pay.amount || !pay.walletId}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function CreditPage() {
  return <Suspense fallback={<Spinner />}><CreditContent /></Suspense>;
}
