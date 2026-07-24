"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2, Search } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Item {
  id: string; name: string; sku: string; barcode?: string;
  sellingPrice: string; stockLevels: { branchId: string; quantity: number }[];
  category?: { name: string }; unit?: { name: string };
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Contact { id: string; name: string; type: string }
interface CartLine { item: Item; quantity: number; unitPrice: number }

export default function PosPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [walletId, setWalletId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [payMode, setPayMode] = useState<"full" | "credit" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<{ txnNo: string; total: string; profit: string } | null>(null);
  const { push } = useToast();
  const { defaultBranchId } = useAuth();

  const load = useCallback(() => {
    api<{ items: Item[] }>("/api/v1/items?pageSize=200&active=1")
      .then((d) => setItems(d.items))
      .catch((e) => push(e.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then((w) => {
      setWallets(w);
      const cash = w.find((x) => x.currency === "MMK");
      if (cash) setWalletId((prev) => prev || cash.id);
    }).catch(() => {});
    api<{ contacts: Contact[] }>("/api/v1/customers?type=CUSTOMER&pageSize=200")
      .then((d) => setCustomers(d.contacts)).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.toLowerCase();
    return items.filter(
      (it) => !needle || it.name.toLowerCase().includes(needle) || it.sku.toLowerCase().includes(needle) || it.barcode?.includes(needle)
    );
  }, [items, q]);

  const stockOf = (it: Item) => it.stockLevels.reduce((a, l) => a + l.quantity, 0);
  const inCart = (id: string) => cart.reduce((a, l) => (l.item.id === id ? a + l.quantity : a), 0);

  function addToCart(it: Item) {
    if (inCart(it.id) >= stockOf(it)) {
      push(`No more stock for ${it.name}`, "error");
      return;
    }
    setCart((c) => {
      const existing = c.find((l) => l.item.id === it.id);
      if (existing) return c.map((l) => (l.item.id === it.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { item: it, quantity: 1, unitPrice: Number(BigInt(it.sellingPrice)) / 100 }];
    });
  }

  const subtotal = cart.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const disc = parseFloat(discount.replace(/,/g, "")) || 0;
  const total = Math.max(0, subtotal - disc);
  const paidAmount = payMode === "full" ? total : payMode === "credit" ? 0 : Math.min(total, parseFloat(partialAmount.replace(/,/g, "")) || 0);
  const creditAmount = total - paidAmount;

  async function checkout() {
    setBusy(true);
    try {
      const sale = await api<{ txnNo: string; total: string; profit: string }>("/api/v1/sales", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          customerId: customerId || undefined,
          lines: cart.map((l) => ({ itemId: l.item.id, quantity: l.quantity, unitPrice: l.unitPrice.toString() })),
          discount: disc.toString(),
          paidAmount: paidAmount.toString(),
          walletId: paidAmount > 0 ? walletId : undefined,
        },
      });
      setLastSale(sale);
      push(`Sale ${sale.txnNo} completed`);
      setCart([]); setDiscount("0"); setPartialAmount(""); setPayMode("full"); setCustomerId("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <Spinner />;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Sales &amp; POS</h1>
        {lastSale && (
          <span className="text-sm text-green-600">
            Last: {lastSale.txnNo} · {fmtMoney(lastSale.total)} MMK
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Item grid */}
        <div className="space-y-3 lg:col-span-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search or scan barcode…"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
              autoFocus
            />
          </div>
          <div className="grid max-h-[70vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((it) => {
              const qty = stockOf(it);
              const available = qty - inCart(it.id);
              const out = available <= 0;
              return (
                <button
                  key={it.id}
                  onClick={() => addToCart(it)}
                  disabled={out}
                  className={cn(
                    "rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 dark:border-gray-800 dark:bg-gray-900",
                    out && "opacity-40"
                  )}
                >
                  <div className="text-sm font-semibold leading-tight">{it.name}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">{it.sku} · stock {available}</div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-blue-600">{fmtMoney(it.sellingPrice)} MMK</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart */}
        <Card className="h-fit space-y-3 lg:col-span-2">
          <h3 className="text-sm font-semibold">Cart ({cart.length})</h3>
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Tap items to add them</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {cart.map((l) => (
                <div key={l.item.id} className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.item.name}</div>
                    <div className="text-xs text-gray-500 tabular-nums">
                      {l.unitPrice.toLocaleString()} × {l.quantity} = {(l.unitPrice * l.quantity).toLocaleString()}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={stockOf(l.item)}
                    value={l.quantity}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(stockOf(l.item), parseInt(e.target.value) || 1));
                      setCart((c) => c.map((x) => (x.item.id === l.item.id ? { ...x, quantity: v } : x)));
                    }}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                  <button onClick={() => setCart((c) => c.filter((x) => x.item.id !== l.item.id))} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
            <div className="flex justify-between"><span>Subtotal</span><b className="tabular-nums">{subtotal.toLocaleString()} MMK</b></div>
            <div className="flex items-center justify-between gap-2">
              <span>Discount</span>
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm dark:border-gray-700 dark:bg-gray-800"
                inputMode="decimal"
              />
            </div>
            <div className="flex justify-between text-base"><span className="font-semibold">Total</span><b className="tabular-nums text-blue-600">{total.toLocaleString()} MMK</b></div>
          </div>

          <div className="space-y-2">
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs dark:bg-gray-800">
              {(["full", "partial", "credit"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayMode(m)}
                  className={cn("flex-1 rounded-md px-2 py-1.5 font-medium capitalize", payMode === m ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}
                >
                  {m === "full" ? "Paid in full" : m === "partial" ? "Partial" : "On credit"}
                </button>
              ))}
            </div>
            {payMode === "partial" && (
              <Input label="Amount received now" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} inputMode="decimal" />
            )}
            {paidAmount > 0 && (
              <Select label="Receive into wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                {wallets.filter((w) => w.currency === "MMK").map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
                ))}
              </Select>
            )}
            {creditAmount > 0 && (
              <>
                <Select label={`Customer (owes ${creditAmount.toLocaleString()} MMK)`} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Select customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <p className="text-xs text-amber-600">The unpaid amount becomes a customer credit record.</p>
              </>
            )}
          </div>

          <Button
            className="w-full"
            disabled={busy || cart.length === 0 || (paidAmount > 0 && !walletId) || (creditAmount > 0 && !customerId)}
            onClick={checkout}
          >
            {busy ? "Processing…" : `Complete sale — ${total.toLocaleString()} MMK`}
          </Button>
        </Card>
      </div>
    </div>
  );
}
