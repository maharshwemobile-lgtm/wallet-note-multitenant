"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Rate { id: string; pair: string; buyRate: string; sellRate: string; effectiveAt: string; active: boolean }
interface Wallet { id: string; name: string; currency: string; currentBalance: string; branchId?: string }
interface Txn {
  id: string; txnNo: string; type: string; fromCurrency: string; toCurrency: string;
  fromAmount: string; toAmount: string; rate: string; serviceFee: string; profit: string;
  status: string; createdAt: string; customer?: { name: string };
}

export default function ExchangePage() {
  const [rates, setRates] = useState<Rate[]>([]);
  // What the shop actually quotes, which is the market feed plus its margin when that is
  // switched on. The stored rate below is only the manual fallback.
  const [quoted, setQuoted] = useState<{
    buyRate: string; sellRate: string; source: "market" | "manual";
    postedAt?: string; staleWarning?: string;
  } | null>(null);
  // The published figure, kept as a last resort for the rate box: a shop that has not set
  // its own board rate yet had an empty field and nothing worked out, which reads as the
  // feature being broken rather than unconfigured.
  const [market, setMarket] = useState<{ buy: string; sell: string; fresh: boolean } | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useNewModal();
  const [showRate, setShowRate] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm, defaultBranchId } = useAuth();

  const [form, setForm] = useState({
    type: "BUY_THB", amount: "", rate: "", serviceFee: "0",
    sourceWalletId: "", destWalletId: "", reference: "", notes: "",
  });
  const [rateForm, setRateForm] = useState({ buyRate: "", sellRate: "" });

  const load = useCallback(() => {
    api<Rate[]>("/api/v1/exchange/rates").then(setRates).catch(() => {});
    api<{ effective: typeof quoted; market: typeof market }>("/api/v1/exchange/market-rate")
      .then((d) => { setQuoted(d.effective); setMarket(d.market); })
      .catch(() => { setQuoted(null); setMarket(null); });
    api<{ transactions: Txn[] }>("/api/v1/exchange/transactions?pageSize=50")
      .then((d) => setTxns(d.transactions)).catch((e) => push(e.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  const active = rates.find((r) => r.active);

  // BUY_THB: business pays MMK (source MMK wallet), receives THB (dest THB wallet)
  const fromCurrency = form.type === "BUY_THB" ? "MMK" : "THB";
  const toCurrency = form.type === "BUY_THB" ? "THB" : "MMK";
  const sourceWallets = wallets.filter((w) => w.currency === fromCurrency);
  const destWallets = wallets.filter((w) => w.currency === toCurrency);

  const computed = useMemo(() => {
    const amt = parseFloat(form.amount.replace(/,/g, ""));
    const rate = parseFloat(form.rate);
    if (!amt || !rate) return null;
    // display-only estimate; the server computes authoritative values
    const to = fromCurrency === "MMK" ? amt / rate : amt * rate;
    return to.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }, [form.amount, form.rate, fromCurrency]);

  /** The figure to start the form with, best source first.
   *
   *  The shop's own board rate is what it has decided to trade at, so it wins. Failing
   *  that, whatever it currently quotes, then the published market figure — a teller with
   *  no rate set at all is better served by today's market number to correct than by an
   *  empty box that computes nothing.
   */
  function defaultRate(type: string) {
    const buying = type === "BUY_THB";
    if (active) return buying ? active.buyRate : active.sellRate;
    if (quoted) return buying ? quoted.buyRate : quoted.sellRate;
    if (market) return buying ? market.buy : market.sell;
    return "";
  }

  /** The starting figure for the direction currently selected, and where it came from —
   *  a teller should be able to tell the shop's own rate from today's market number. */
  const boardRate = defaultRate(form.type);
  const boardRateSource = active ? "your rate" : quoted ? "your quote" : market ? "market" : "";

  function openNewExchange() {
    setForm((current) => ({ ...current, rate: current.rate || defaultRate(current.type) }));
    setShowNew(true);
  }

  // The form can also be opened by the floating "+", which does not go through
  // openNewExchange — so the rate was blank there and nothing was worked out until the
  // teller typed one in by hand. Filling it whenever the form opens covers both doors.
  useEffect(() => {
    if (!showNew) return;
    // Deferred a tick, as elsewhere in the app, so this is an ordinary update rather than
    // one made during the effect. `active` is a dependency because it arrives with the
    // rates: a form opened before that fetch landed would otherwise sit there empty.
    const timer = window.setTimeout(() => {
      setForm((current) => (current.rate ? current : { ...current, rate: defaultRate(current.type) }));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNew, active, quoted, market]);

  function changeExchangeType(type: string) {
    setForm((current) => ({
      ...current,
      type,
      sourceWalletId: "",
      destWalletId: "",
      rate: defaultRate(type),
    }));
  }

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/exchange/transactions", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          type: form.type,
          fromCurrency, toCurrency,
          fromAmount: form.amount,
          rate: form.rate,
          serviceFee: form.serviceFee || "0",
          sourceWalletId: form.sourceWalletId,
          destWalletId: form.destWalletId,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
        },
      });
      push("Exchange recorded");
      setShowNew(false);
      setForm({ ...form, amount: "", reference: "", notes: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveRate() {
    try {
      await api("/api/v1/exchange/rates", { method: "POST", body: { pair: "THB/MMK", ...rateForm } });
      push("Rate updated");
      setShowRate(false);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function reverse() {
    if (!reverseId) return;
    setBusy(true);
    try {
      await api(`/api/v1/exchange/transactions/${reverseId}/reverse`, { method: "POST", body: { reason: reverseReason } });
      push("Transaction reversed");
      setReverseId(null); setReverseReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!txns) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Money Exchange</h1>
        <div className="flex flex-wrap gap-2">
          {hasPerm("exchange.rates") && <Button variant="secondary" onClick={() => { setRateForm({ buyRate: active?.buyRate ?? "", sellRate: active?.sellRate ?? "" }); setShowRate(true); }}>Update rate</Button>}
          {hasPerm("exchange.create") && <Button onClick={openNewExchange}><Plus size={16} className="mr-1 inline" />New exchange</Button>}
        </div>
      </div>

      {(quoted || active) && (
        <Card className="py-3 text-sm">
          <div className="flex flex-wrap items-center gap-6">
            <span className="font-semibold">THB/MMK</span>
            <span>We buy THB @ <b className="text-green-600">{quoted?.buyRate ?? active?.buyRate}</b></span>
            <span>We sell THB @ <b className="text-blue-600">{quoted?.sellRate ?? active?.sellRate}</b></span>
            {quoted?.source === "market" ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                market {quoted.postedAt ? fmtDateTime(quoted.postedAt) : ""}
              </span>
            ) : (
              <span className="text-xs text-gray-500">
                your rate{active ? ` · since ${fmtDateTime(active.effectiveAt)}` : ""}
              </span>
            )}
          </div>
          {quoted?.staleWarning && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{quoted.staleWarning}</p>
          )}
        </Card>
      )}

      {txns.length === 0 ? (
        <Card><Empty message="No exchange transactions yet" /></Card>
      ) : (
        <Table headers={["Txn", "Type", "From", "To", "Rate", "Fee", "Profit", "Status", "Date", ""]} rightAlign={[2, 3, 4, 5, 6]}>
          {txns.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2 text-xs">{t.txnNo}</td>
              <td className="px-3 py-2 text-xs font-medium">{t.type.replace("_", " ")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.fromAmount)} {t.fromCurrency}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.toAmount)} {t.toCurrency}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.rate}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.serviceFee)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${BigInt(t.profit) >= 0n ? "text-green-600" : "text-red-600"}`}>{fmtMoney(t.profit)}</td>
              <td className="px-3 py-2"><Badge status={t.status} /></td>
              <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(t.createdAt)}</td>
              <td className="px-3 py-2">
                {t.status === "COMPLETED" && hasPerm("exchange.reverse") && (
                  <Button size="sm" variant="ghost" onClick={() => setReverseId(t.id)}>Reverse</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* New exchange */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New exchange transaction">
        <div className="space-y-3">
          <Select label="Type" value={form.type} onChange={(e) => changeExchangeType(e.target.value)}>
            <option value="BUY_THB">Buy THB (pay MMK)</option>
            <option value="SELL_THB">Sell THB (receive MMK)</option>
          </Select>
          {(sourceWallets.length === 0 || destWallets.length === 0) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              You need a {sourceWallets.length === 0 ? fromCurrency : toCurrency} wallet before you can record this exchange.{" "}
              <Link href="/wallets" className="font-semibold underline">Create one on the Wallets page</Link> first.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={`Amount (${fromCurrency})`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" autoFocus />
            <div>
              <Input label="Rate (MMK per 1 THB)" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} inputMode="decimal" />
              {/* The board rate is the starting point, not a rule: a teller settles a deal
                  at whatever was agreed. Typing over it is expected, so the way back to the
                  board figure is one tap rather than remembering what it was. */}
              {boardRate && form.rate !== boardRate && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, rate: boardRate })}
                  className="mt-1 text-xs text-blue-600 underline dark:text-blue-400"
                >
                  {boardRateSource} is {boardRate} — use it
                </button>
              )}
              {!boardRate && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  No rate set yet. Type one, or set your board rate above.
                </p>
              )}
            </div>
          </div>
          {computed ? (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm dark:bg-blue-900/30">
              <div className="flex justify-between text-blue-700 dark:text-blue-300">
                <span>Customer gives</span>
                <b className="tabular-nums">{form.amount} {fromCurrency}</b>
              </div>
              <div className="mt-0.5 flex justify-between text-blue-700 dark:text-blue-300">
                <span>Customer receives</span>
                <b className="tabular-nums">≈ {computed} {toCurrency}</b>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Enter the amount and the rest is worked out at the rate above.
            </p>
          )}
          <Select label={`Source wallet (${fromCurrency} out)`} value={form.sourceWalletId} onChange={(e) => setForm({ ...form, sourceWalletId: e.target.value })}>
            <option value="">Select wallet…</option>
            {sourceWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>)}
          </Select>
          <Select label={`Destination wallet (${toCurrency} in)`} value={form.destWalletId} onChange={(e) => setForm({ ...form, destWalletId: e.target.value })}>
            <option value="">Select wallet…</option>
            {destWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>)}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Service fee (MMK)" value={form.serviceFee} onChange={(e) => setForm({ ...form, serviceFee: e.target.value })} inputMode="decimal" />
            <Input label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !form.amount || !form.rate || !form.sourceWalletId || !form.destWalletId}>
              {busy ? "Saving…" : "Confirm exchange"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rate update */}
      <Modal open={showRate} onClose={() => setShowRate(false)} title="Update THB/MMK board rate">
        <div className="space-y-3">
          <Input label="Buy rate (we buy THB at)" value={rateForm.buyRate} onChange={(e) => setRateForm({ ...rateForm, buyRate: e.target.value })} inputMode="decimal" />
          <Input label="Sell rate (we sell THB at)" value={rateForm.sellRate} onChange={(e) => setRateForm({ ...rateForm, sellRate: e.target.value })} inputMode="decimal" />
          <p className="text-xs text-gray-500">Changing the board rate never modifies existing transactions. Full history is kept.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowRate(false)}>Cancel</Button>
            <Button onClick={saveRate} disabled={!rateForm.buyRate || !rateForm.sellRate}>Save rate</Button>
          </div>
        </div>
      </Modal>

      {/* Reverse */}
      <Modal open={!!reverseId} onClose={() => setReverseId(null)} title="Reverse exchange transaction">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Both wallet movements will be reversed. This action is logged.</p>
          <Input label="Reason (required)" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReverseId(null)}>Cancel</Button>
            <Button variant="danger" onClick={reverse} disabled={busy || reverseReason.trim().length < 3}>Reverse</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
