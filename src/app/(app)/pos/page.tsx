"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, CreditCard, Minus, Monitor, Package, Plus,
  RotateCcw, Search, ShoppingCart, UserCircle2, Volume2, VolumeX,
} from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Modal, Select, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Item {
  id: string; name: string; sku: string; barcode?: string;
  sellingPrice: string; stockLevels: { branchId: string; quantity: number }[];
  category?: { name: string };
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Contact { id: string; name: string }
interface CartLine { item: Item; quantity: number; unitPrice: number }
interface SaleResult { txnNo: string; total: string; profit: string }
interface Draft {
  savedAt: number;
  lines: { itemId: string; quantity: number; unitPrice: number }[];
  discount: string; walletId: string; customerId: string;
  payMode: "full" | "credit" | "partial";
  partialAmount: string; cashReceived: string;
}

const DRAFT_LIFETIME = 12 * 60 * 60 * 1000;

function readAmount(value: string) {
  return parseFloat(value.replace(/,/g, "")) || 0;
}

function cashSuggestions(total: number) {
  if (total <= 0) return [];
  const steps = [1000, 5000, 10000, 50000, 100000];
  return [...new Set([total, ...steps.map((step) => Math.ceil(total / step) * step)])]
    .filter((amount) => amount >= total).sort((a, b) => a - b).slice(0, 4);
}

function playAddBeep() {
  try {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 920;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  } catch {
    // Audio feedback is optional.
  }
}

export default function PosPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [walletId, setWalletId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [payMode, setPayMode] = useState<"full" | "credit" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [beepOn, setBeepOn] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();
  const { defaultBranchId, me } = useAuth();
  const router = useRouter();
  const draftKey = `wallet-note:pos-draft:${me?.user.id ?? "anonymous"}`;

  const load = useCallback(() => {
    api<{ items: Item[] }>("/api/v1/items?pageSize=200&active=1")
      .then((data) => setItems(data.items))
      .catch((error) => push(error.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then((data) => {
      setWallets(data);
      const cash = data.find((wallet) => wallet.currency === "MMK");
      if (cash) setWalletId((current) => current || cash.id);
    }).catch(() => {});
    api<{ contacts: Contact[] }>("/api/v1/customers?type=CUSTOMER&pageSize=200")
      .then((data) => setCustomers(data.contacts)).catch(() => {});
  }, [push]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!items || draftReady) return;
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(draftKey);
        const draft = raw ? JSON.parse(raw) as Draft : null;
        if (draft && Date.now() - draft.savedAt < DRAFT_LIFETIME) {
          const byId = new Map(items.map((item) => [item.id, item]));
          setCart(draft.lines.flatMap((line) => {
            const item = byId.get(line.itemId);
            if (!item) return [];
            const stock = item.stockLevels
              .filter((level) => !defaultBranchId || level.branchId === defaultBranchId)
              .reduce((sum, level) => sum + level.quantity, 0);
            return stock > 0 ? [{ item, quantity: Math.min(line.quantity, stock), unitPrice: line.unitPrice }] : [];
          }));
          setDiscount(draft.discount);
          setWalletId(draft.walletId);
          setCustomerId(draft.customerId);
          setPayMode(draft.payMode);
          setPartialAmount(draft.partialAmount);
          setCashReceived(draft.cashReceived);
        } else if (raw) {
          localStorage.removeItem(draftKey);
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultBranchId, draftKey, draftReady, items]);

  useEffect(() => {
    if (!draftReady) return;
    const draft: Draft = {
      savedAt: Date.now(),
      lines: cart.map((line) => ({ itemId: line.item.id, quantity: line.quantity, unitPrice: line.unitPrice })),
      discount, walletId, customerId, payMode, partialAmount, cashReceived,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [cart, cashReceived, customerId, discount, draftKey, draftReady, partialAmount, payMode, walletId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && cart.length > 0) {
        event.preventDefault();
        setReviewOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cart.length]);

  const categories = useMemo(() => {
    if (!items) return [];
    return [...new Set(items.map((item) => item.category?.name).filter(Boolean) as string[])].sort();
  }, [items]);

  const stockOf = useCallback((item: Item) => item.stockLevels
    .filter((level) => !defaultBranchId || level.branchId === defaultBranchId)
    .reduce((sum, level) => sum + level.quantity, 0), [defaultBranchId]);

  const reserved = useMemo(() => cart.reduce((map, line) => {
    map.set(line.item.id, (map.get(line.item.id) ?? 0) + line.quantity);
    return map;
  }, new Map<string, number>()), [cart]);

  const visibleProducts = useMemo(() => {
    if (!items) return [];
    const needle = query.trim().toLowerCase();
    return items.map((item) => ({ item, available: stockOf(item) - (reserved.get(item.id) ?? 0) }))
      .filter(({ item, available }) =>
        available > 0 &&
        (category === "ALL" || item.category?.name === category) &&
        (!needle || item.name.toLowerCase().includes(needle) ||
          item.sku.toLowerCase().includes(needle) || item.barcode?.toLowerCase().includes(needle)));
  }, [category, items, query, reserved, stockOf]);

  function addProduct(item: Item) {
    const available = stockOf(item) - (reserved.get(item.id) ?? 0);
    if (available <= 0) {
      push(`No more stock for ${item.name}`, "error");
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) return current.map((line) =>
        line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { item, quantity: 1, unitPrice: Number(BigInt(item.sellingPrice)) / 100 }];
    });
    if (beepOn) playAddBeep();
  }

  function changeQuantity(line: CartLine, delta: number) {
    if (delta < 0 && line.quantity <= 1) {
      setCart((current) => current.filter((entry) => entry.item.id !== line.item.id));
      return;
    }
    if (delta > 0 && line.quantity >= stockOf(line.item)) {
      push(`No more stock for ${line.item.name}`, "error");
      return;
    }
    setCart((current) => current.map((entry) =>
      entry.item.id === line.item.id ? { ...entry, quantity: entry.quantity + delta } : entry));
    if (delta > 0 && beepOn) playAddBeep();
  }

  function submitSearch(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !items) return;
    const code = query.trim().toLowerCase();
    const exact = items.find((item) => item.sku.toLowerCase() === code || item.barcode?.toLowerCase() === code);
    if (exact) {
      event.preventDefault();
      addProduct(exact);
      setQuery("");
    }
  }

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const disc = readAmount(discount);
  const total = Math.max(0, subtotal - disc);
  const paidAmount = payMode === "full" ? total : payMode === "credit" ? 0 : Math.min(total, readAmount(partialAmount));
  const creditAmount = total - paidAmount;
  const received = readAmount(cashReceived);
  const change = payMode === "full" ? Math.max(0, received - total) : 0;
  const canCheckout = cart.length > 0 && disc >= 0 && disc <= subtotal &&
    (paidAmount === 0 || Boolean(walletId)) &&
    (creditAmount === 0 || Boolean(customerId)) &&
    (payMode !== "full" || !cashReceived || received >= total);

  function clearSale() {
    setCart([]);
    setDiscount("0");
    setPartialAmount("");
    setCashReceived("");
    setPayMode("full");
    setCustomerId("");
    localStorage.removeItem(draftKey);
  }

  async function checkout() {
    if (!canCheckout) return;
    setBusy(true);
    try {
      const sale = await api<SaleResult>("/api/v1/sales", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          customerId: customerId || undefined,
          lines: cart.map((line) => ({
            itemId: line.item.id, quantity: line.quantity, unitPrice: line.unitPrice.toString(),
          })),
          discount: disc.toString(),
          paidAmount: paidAmount.toString(),
          walletId: paidAmount > 0 ? walletId : undefined,
        },
      });
      setReviewOpen(false);
      setCompletedSale(sale);
      clearSale();
      load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Sale failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <Spinner />;

  return (
    <div className="wn-pos-page">
      <div className="wn-pos-shell">
        <section className="wn-pos-products">
          <header className="wn-pos-header">
            <button type="button" className="wn-pos-back" onClick={() => router.push("/")} title="Dashboard">
              <ArrowLeft size={17} />
            </button>
            <div className="wn-pos-title"><Monitor size={18} /> POS Sale</div>
            <label className="wn-pos-search">
              <Search size={17} />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)}
                onKeyDown={submitSearch} placeholder="Product, SKU or Barcode..." autoFocus />
            </label>
            <div className="wn-pos-user"><UserCircle2 size={17} /> {me?.user.name}</div>
            <button type="button" className={`wn-pos-beep ${beepOn ? "on" : ""}`}
              onClick={() => setBeepOn((value) => !value)}>
              {beepOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Beep {beepOn ? "ON" : "OFF"}
            </button>
          </header>

          <div className="wn-pos-categories">
            <button type="button" className={category === "ALL" ? "active" : ""}
              onClick={() => setCategory("ALL")}>All</button>
            {categories.map((name) => <button type="button" key={name}
              className={category === name ? "active" : ""} onClick={() => setCategory(name)}>{name}</button>)}
          </div>

          <div className="wn-pos-grid">
            {visibleProducts.map(({ item, available }) => (
              <button type="button" className="wn-pos-product-card" key={item.id} onClick={() => addProduct(item)}>
                <span className={`wn-pos-stock-badge ${available <= 2 ? "low" : ""}`}>{available}</span>
                <Package size={23} />
                <span className="wn-pos-product-name">{item.name}</span>
                <strong>{fmtMoney(item.sellingPrice)} MMK</strong>
                <small>{item.sku} · Stock: {available}</small>
              </button>
            ))}
            {visibleProducts.length === 0 && <div className="wn-pos-empty">No products with available stock.</div>}
          </div>
        </section>

        <aside className="wn-pos-cart">
          <header className="wn-pos-cart-head">
            <div><ShoppingCart size={17} /> Cart <span>{itemCount}</span></div>
            <button type="button" onClick={clearSale} disabled={!cart.length}>
              <RotateCcw size={14} /> Clear &amp; Restore
            </button>
          </header>
          <div className="wn-pos-cart-columns"><span>Product</span><span>Price</span><span>Qty</span><span>Total</span></div>
          <div className="wn-pos-cart-items">
            {cart.length ? cart.map((line) => (
              <article className="wn-pos-cart-row" key={line.item.id}>
                <div className="wn-pos-cart-name"><b title={line.item.name}>{line.item.name}</b><small>{line.item.sku}</small></div>
                <input className="wn-pos-price-input" value={line.unitPrice}
                  onChange={(event) => {
                    const unitPrice = Math.max(0, readAmount(event.target.value));
                    setCart((current) => current.map((entry) =>
                      entry.item.id === line.item.id ? { ...entry, unitPrice } : entry));
                  }}
                  inputMode="decimal" aria-label={`${line.item.name} selling price`} />
                <div className="wn-pos-qty">
                  <button type="button" onClick={() => changeQuantity(line, -1)}><Minus size={13} /></button>
                  <b>{line.quantity}</b>
                  <button type="button" onClick={() => changeQuantity(line, 1)}
                    disabled={line.quantity >= stockOf(line.item)}><Plus size={13} /></button>
                </div>
                <strong>{(line.unitPrice * line.quantity).toLocaleString()}</strong>
              </article>
            )) : <div className="wn-pos-cart-empty"><ShoppingCart size={32} /><p>Cart is empty</p></div>}
          </div>

          <div className="wn-pos-summary">
            <div><span>Items</span><b>{itemCount}</b></div>
            <div><span>Subtotal</span><b>{subtotal.toLocaleString()} MMK</b></div>
            <label className="wn-pos-discount"><span>Discount</span>
              <input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" />
            </label>
            {disc > subtotal && <p className="wn-pos-error">Discount cannot exceed subtotal.</p>}
            <div className="wn-pos-grand-total"><span>Grand Total</span><b>{total.toLocaleString()} MMK</b></div>
            <div className="wn-pos-payment-title">Payment Type</div>
            <div className="wn-pos-payment-methods">
              {(["full", "partial", "credit"] as const).map((mode) => (
                <button type="button" key={mode} className={payMode === mode ? "active" : ""}
                  onClick={() => setPayMode(mode)}>
                  <b>{mode === "full" ? "Cash / Full" : mode === "partial" ? "Partial" : "Credit"}</b>
                  <small>{mode === "credit" ? "Customer Debt" : "PAYMENT"}</small>
                </button>
              ))}
            </div>
            {payMode === "partial" && <label className="wn-pos-field"><span>Amount received now</span>
              <input value={partialAmount} onChange={(event) => setPartialAmount(event.target.value)} inputMode="decimal" />
            </label>}
            {payMode === "full" && <>
              <label className="wn-pos-field"><span>Cash received · Change {change.toLocaleString()} MMK</span>
                <input value={cashReceived} onChange={(event) => setCashReceived(event.target.value)}
                  inputMode="decimal" placeholder={total.toString()} />
              </label>
              <div className="wn-pos-cash-options">
                {cashSuggestions(total).map((amount) => <button type="button" key={amount}
                  onClick={() => setCashReceived(amount.toString())}>{amount.toLocaleString()}</button>)}
              </div>
            </>}
            {paidAmount > 0 && <div className="wn-pos-select"><Select label="Receive into wallet"
              value={walletId} onChange={(event) => setWalletId(event.target.value)}>
              {wallets.filter((wallet) => wallet.currency === "MMK")
                .map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
            </Select></div>}
            {creditAmount > 0 && <div className="wn-pos-select"><Select
              label={`Customer owes ${creditAmount.toLocaleString()} MMK`} value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select customer...</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </Select></div>}
            {cashReceived && received < total && <p className="wn-pos-error">Cash received is less than the total.</p>}
            <button type="button" className="wn-pos-pay" disabled={busy || !canCheckout}
              onClick={() => setReviewOpen(true)}><CreditCard size={17} /> Review &amp; Pay</button>
          </div>
        </aside>
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review sale" wide>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
            <div><span className="block text-xs text-gray-500">Customer</span><b>{customerId ? customers.find((c) => c.id === customerId)?.name : "Walk-in"}</b></div>
            <div><span className="block text-xs text-gray-500">Payment</span><b>{payMode}</b></div>
            <div><span className="block text-xs text-gray-500">Cart</span><b>{itemCount} units</b></div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {cart.map((line) => <div key={line.item.id}
              className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-gray-100 py-2 text-sm dark:border-gray-800">
              <span>{line.item.name}</span><b>× {line.quantity}</b>
              <b>{(line.unitPrice * line.quantity).toLocaleString()} MMK</b>
            </div>)}
          </div>
          <div className="space-y-1 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
            <div className="flex justify-between"><span>Total</span><b>{total.toLocaleString()} MMK</b></div>
            <div className="flex justify-between"><span>Received</span><b>{paidAmount.toLocaleString()} MMK</b></div>
            {creditAmount > 0 && <div className="flex justify-between text-amber-600"><span>Customer owes</span><b>{creditAmount.toLocaleString()} MMK</b></div>}
            {change > 0 && <div className="flex justify-between text-green-600"><span>Change</span><b>{change.toLocaleString()} MMK</b></div>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setReviewOpen(false)}>Back to Cart</Button>
            <Button disabled={busy} onClick={checkout}>{busy ? "Processing..." : "Confirm & Complete Sale"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(completedSale)} onClose={() => setCompletedSale(null)} title="Sale completed">
        {completedSale && <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto text-green-600" size={48} />
          <div><p className="font-mono text-lg font-bold">{completedSale.txnNo}</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{fmtMoney(completedSale.total)} MMK</p></div>
          <Button className="w-full" onClick={() => {
            setCompletedSale(null);
            searchRef.current?.focus();
          }}><ShoppingCart size={18} /> Start New Sale</Button>
        </div>}
      </Modal>
    </div>
  );
}
