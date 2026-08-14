"use client";

import { useCallback, useEffect, useState, use } from "react";
import { api } from "@/lib/client";
import { ExposureChart } from "@/components/ExposureChart";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Badge, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { autoInsertThreeDEquals } from "@/lib/threeDEntry";
import { gameRules, numberRangeLabel } from "@/lib/lotteryGame";
import { encodeCsv, THREE_D_IMPORT_HEADERS } from "@/lib/threeDTransfer";

interface Detail {
  session: { id: string; name: string; drawDate: string; status: string; gameType: string; resultNumber?: string; defaultOdds: string; numberLimit?: string | null; settlement?: { id: string; netProfit: string; totalPayout: string; grossCollected: string; totalCommission: string } };
  exposure: { number: string; totalStake: string; potentialPayout: string; count: number; laidOff: string }[];
  layoffs: { id: string; number: string; amount: string; odds: string; bookmaker: string; note?: string; createdAt: string }[];
  totals: { count: number; totalBet: string; totalCommission: string };
}
interface Txn {
  id: string; txnNo: string; number: string; betAmount: string; potentialPayout: string;
  commissionAmount: string; isWinner: boolean; settlementStatus: string;
  customerName?: string; customer?: { name: string };
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Preview { resultNumber: string; totalRecords: number; grossCollected: string; totalCommission: string; winningRecords: number; totalPayout: string; netProfit: string }

/** The records, exposure and settlement flow are identical for 2D and 3D — only the digit
 *  count differs — so one component serves both routes rather than two that drift apart. */
export default function LotterySessionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showEntry, setShowEntry] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [showLimit, setShowLimit] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [layoff, setLayoff] = useState<{ number: string; amount: string; odds: string; bookmaker: string; note: string } | null>(null);
  const [entry, setEntry] = useState({ bulkText: "", customerName: "", customerPhone: "", odds: "", commissionRate: "" });
  const [settle, setSettle] = useState({ resultNumber: "", walletId: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm, defaultBranchId, branches, me } = useAuth();
  const [branchId, setBranchId] = useState("");

  /** The cap is a decision the shop revisits, so it is edited here rather than buried in
   *  settings. Clearing the box removes it and the chart goes back to plain ranking. */
  async function saveLimit() {
    try {
      await api(`/api/v1/three-d/sessions/${id}`, {
        method: "PATCH",
        body: { numberLimit: limitInput.trim() === "" ? null : limitInput.trim() },
      });
      setShowLimit(false);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  /** The rows the receiving shop imports, in the format its own Import already expects.
   *
   *  Handed over as a file rather than written into the other shop's records directly.
   *  Every query in this app is fenced by businessId, and letting one shop write into
   *  another's books would open exactly the hole that fence exists to close — anyone who
   *  learned a shop's id could push liabilities into it. This way the receiving shop
   *  imports it themselves, into their own session, at their own odds, and a bookmaker who
   *  does not use Wallet Note is unaffected: the written record still stands on its own.
   */
  function exportLayoffs() {
    if (!detail) return;
    const session = detail.session;
    const rows = detail.layoffs.map((l) => [
      // Quoted so a spreadsheet cannot eat the leading zero on 007 or 07.
      `="${l.number}"`,
      (Number(l.amount) / 100).toFixed(2),
      me?.business?.name ?? "",
      "",
      l.odds,
      "0",
      `${gameRules(session.gameType).label} ${session.name} ${session.drawDate}${l.note ? ` — ${l.note}` : ""}`,
    ]);
    const csv = "﻿" + encodeCsv([[...THREE_D_IMPORT_HEADERS], ...rows]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `layoffs-${session.drawDate}-${session.name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveLayoff() {
    if (!layoff) return;
    try {
      await api("/api/v1/three-d/layoffs", {
        method: "POST",
        body: {
          sessionId: id,
          number: layoff.number,
          amount: layoff.amount,
          odds: layoff.odds,
          bookmaker: layoff.bookmaker,
          note: layoff.note || undefined,
        },
      });
      setLayoff(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function removeLayoff(layoffId: string) {
    try {
      await api(`/api/v1/three-d/layoffs?id=${layoffId}`, { method: "DELETE" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  const load = useCallback(() => {
    api<Detail>(`/api/v1/three-d/sessions/${id}`).then(setDetail).catch((e) => push(e.message, "error"));
    api<{ transactions: Txn[] }>(`/api/v1/three-d/transactions?sessionId=${id}&pageSize=200`)
      .then((d) => setTxns(d.transactions)).catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [id, push]);
  useEffect(load, [load]);

  async function saveEntry() {
    setBusy(true);
    try {
      const res = await api<{ created: number }>("/api/v1/three-d/transactions", {
        method: "POST",
        body: {
          sessionId: id,
          branchId: branchId || defaultBranchId,
          bulkText: entry.bulkText,
          customerName: entry.customerName || undefined,
          customerPhone: entry.customerPhone || undefined,
          odds: entry.odds || undefined,
          commissionRate: entry.commissionRate || undefined,
        },
      });
      push(`${res.created} record(s) saved`);
      setEntry({ ...entry, bulkText: "" });
      setShowEntry(false);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function previewSettle() {
    try {
      setPreview(await api<Preview>(`/api/v1/three-d/sessions/${id}/settle`, {
        method: "POST",
        body: { resultNumber: settle.resultNumber, preview: true },
      }));
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function confirmSettle() {
    setBusy(true);
    try {
      await api(`/api/v1/three-d/sessions/${id}/settle`, {
        method: "POST",
        body: { resultNumber: settle.resultNumber, walletId: settle.walletId || undefined },
      });
      push("Session settled");
      setShowSettle(false); setPreview(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      await api(`/api/v1/three-d/sessions/${id}/reopen`, { method: "POST", body: { reason: reopenReason } });
      push("Settlement reopened");
      setShowReopen(false);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    try {
      await api(`/api/v1/three-d/sessions/${id}`, { method: "PATCH", body: { status } });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (!detail) return <Spinner />;
  const s = detail.session;
  // 2D and 3D share this page, so every digit count and label below comes from the
  // session itself rather than being written as "3".
  const game = gameRules(s.gameType);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{s.name} · {s.drawDate}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Badge status={s.status} />
            {s.resultNumber && <span className="font-mono text-lg font-bold text-purple-600">Result: {s.resultNumber}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.status === "OPEN" && hasPerm("three_d.create") && (
            <Button onClick={() => setShowEntry(true)}>New records</Button>
          )}
          {s.status === "OPEN" && hasPerm("three_d.edit") && (
            <Button variant="secondary" onClick={() => setStatus("CLOSED")}>Close session</Button>
          )}
          {s.status === "CLOSED" && hasPerm("three_d.edit") && (
            <Button variant="secondary" onClick={() => setStatus("OPEN")}>Reopen entry</Button>
          )}
          {(s.status === "OPEN" || s.status === "CLOSED") && hasPerm("three_d.settle") && (
            <Button onClick={() => setShowSettle(true)}>Enter result & settle</Button>
          )}
          {s.status === "SETTLED" && hasPerm("three_d.reopen") && (
            <Button variant="danger" onClick={() => setShowReopen(true)}>Reopen settlement</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Records" value={detail.totals.count} />
        <StatCard label="Total bet" value={fmtMoney(detail.totals.totalBet, "MMK")} />
        <StatCard label="Total commission" value={fmtMoney(detail.totals.totalCommission, "MMK")} />
        {s.status === "SETTLED" && s.settlement && (
          <StatCard label="Paid out" value={fmtMoney(s.settlement.totalPayout, "MMK")} />
        )}
      </div>

      {s.settlement && s.status === "SETTLED" && hasPerm("three_d.view_profit") && (
        <Card className="border-green-300 dark:border-green-800">
          <h3 className="mb-2 text-sm font-semibold">Settlement result</h3>
          <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
            <div>Gross collected: <span className="font-bold tabular-nums">{fmtMoney(s.settlement.grossCollected)}</span></div>
            <div>Commission: <span className="font-bold tabular-nums">{fmtMoney(s.settlement.totalCommission)}</span></div>
            <div>Winning payout: <span className="font-bold tabular-nums">{fmtMoney(s.settlement.totalPayout)}</span></div>
            <div>
              Net profit/loss:{" "}
              <span className={`font-bold tabular-nums ${BigInt(s.settlement.netProfit) >= 0n ? "text-green-600" : "text-red-600"}`}>
                {fmtMoney(s.settlement.netProfit)} MMK
              </span>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Money on each number</h3>
          {hasPerm("three_d.edit") && (
            <button
              onClick={() => { setLimitInput(s.numberLimit ? String(Number(s.numberLimit) / 100) : ""); setShowLimit(true); }}
              className="text-xs font-medium text-blue-600 underline dark:text-blue-400"
            >
              {s.numberLimit ? `Limit ${fmtMoney(s.numberLimit)} — change` : "Set a limit per number"}
            </button>
          )}
        </div>
        <ExposureChart
          rows={detail.exposure.map((e) => ({
            number: e.number,
            totalStake: BigInt(e.totalStake),
            laidOff: BigInt(e.laidOff ?? "0"),
          }))}
          limit={s.numberLimit ? BigInt(s.numberLimit) : null}
          onLayOff={
            s.status === "SETTLED" || !hasPerm("three_d.create")
              ? undefined
              : (number, suggested) =>
                  setLayoff({
                    number,
                    // Prefilled with exactly what is over the line, which is the amount a
                    // shop passing a number on almost always wants to hand over.
                    amount: suggested > 0n ? String(Number(suggested) / 100) : "",
                    odds: s.defaultOdds,
                    bookmaker: detail.layoffs[0]?.bookmaker ?? "",
                    note: "",
                  })
          }
        />

        {detail.layoffs.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-gray-500">Passed to other bookmakers</h4>
              <button onClick={exportLayoffs} className="text-xs font-medium text-blue-600 underline dark:text-blue-400">
                Export for the other shop
              </button>
            </div>
            <Table headers={["Number", "Amount", "Odds", "Bookmaker", "Back if it wins", ""]} rightAlign={[1, 2, 4]}>
              {detail.layoffs.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-1.5 font-mono font-bold">{l.number}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(l.amount)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{l.odds}</td>
                  <td className="px-3 py-1.5">{l.bookmaker}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-green-600">
                    {fmtMoney(String(BigInt(l.amount) * BigInt(Math.round(Number(l.odds)))))}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {s.status !== "SETTLED" && hasPerm("three_d.edit") && (
                      <button onClick={() => removeLayoff(l.id)} className="text-xs text-red-600 underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">
            {s.status === "SETTLED" ? "Records by number (highest first)" : "Exposure by number (highest first)"}
          </h3>
          {detail.exposure.length === 0 ? <Empty message="No records yet" /> : (
            <div className="max-h-96 overflow-y-auto">
              <Table headers={["Number", "Bets", "Total stake", s.status === "SETTLED" ? "Payout if drawn" : "Potential payout"]} rightAlign={[1, 2, 3]}>
                {detail.exposure.map((e) => (
                  <tr key={e.number} className={e.number === s.resultNumber ? "bg-green-50 dark:bg-green-900/20" : ""}>
                    <td className="px-3 py-2 font-mono font-bold">{e.number}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(e.totalStake)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-600">{fmtMoney(e.potentialPayout)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold">Records ({txns.length})</h3>
          {txns.length === 0 ? <Empty message="No records yet" /> : (
            <div className="max-h-96 overflow-y-auto">
              <Table headers={["No", "Number", "Customer", "Bet", "Payout", ""]} rightAlign={[3, 4]}>
                {txns.map((t) => (
                  <tr key={t.id} className={t.isWinner ? "bg-green-50 dark:bg-green-900/20" : ""}>
                    <td className="px-3 py-2 text-xs text-gray-500">{t.txnNo}</td>
                    <td className="px-3 py-2 font-mono font-bold">{t.number}</td>
                    <td className="px-3 py-2 text-xs">{t.customer?.name ?? t.customerName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.betAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.potentialPayout)}</td>
                    <td className="px-3 py-2">{t.isWinner && <span className="text-xs font-bold text-green-600">WIN</span>}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
      </div>

      {/* Entry modal */}
      <Modal open={showEntry} onClose={() => setShowEntry(false)} title={`New ${game.label} records`} wide>
        <div className="space-y-3">
          {branches.length > 1 && (
            <Select label="Branch" value={branchId || defaultBranchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Customer name (optional)" value={entry.customerName} onChange={(e) => setEntry({ ...entry, customerName: e.target.value })} />
            <Input label="Phone (optional)" value={entry.customerPhone} onChange={(e) => setEntry({ ...entry, customerPhone: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={`Odds (default ${s.defaultOdds})`} value={entry.odds} onChange={(e) => setEntry({ ...entry, odds: e.target.value })} placeholder={s.defaultOdds} />
            <Input label="Commission % (optional)" value={entry.commissionRate} onChange={(e) => setEntry({ ...entry, commissionRate: e.target.value })} placeholder="10" />
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Numbers — one per line as number=amount, and a name after it if you want one
            </span>
            <textarea
              value={entry.bulkText}
              onChange={(e) => setEntry({ ...entry, bulkText: autoInsertThreeDEquals(e.target.value, s.gameType) })}
              rows={8}
              placeholder={
                game.digits === 2
                  ? "07=5000\n42=3000 Ko Aung\n00=2000"
                  : "123=5000\n456=3000 Ko Aung\n007=2000"
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
          <p className="text-xs text-gray-500">
            {game.digits === 2
              ? "Leading zeros are preserved: 07 and 70 are different numbers."
              : "Leading zeros are preserved: 001, 010 and 100 are different numbers."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowEntry(false)}>Cancel</Button>
            <Button onClick={saveEntry} disabled={busy || !entry.bulkText.trim()}>{busy ? "Saving…" : "Save records"}</Button>
          </div>
        </div>
      </Modal>

      {/* Settle modal */}
      <Modal open={showSettle} onClose={() => { setShowSettle(false); setPreview(null); }} title="Enter result & settle">
        <div className="space-y-3">
          <Input
            label={`Winning number (${game.digits} digits, ${numberRangeLabel(s.gameType)})`}
            value={settle.resultNumber}
            onChange={(e) => { setSettle({ ...settle, resultNumber: e.target.value.replace(/\D/g, "").slice(0, game.digits) }); setPreview(null); }}
            className="font-mono text-2xl tracking-[0.5em]"
            maxLength={game.digits}
            inputMode="numeric"
          />
          <Select label="Settlement wallet (optional — records net P/L movement)" value={settle.walletId} onChange={(e) => setSettle({ ...settle, walletId: e.target.value })}>
            <option value="">No wallet movement</option>
            {wallets.filter((w) => w.currency === "MMK").map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>
            ))}
          </Select>
          {!preview ? (
            <Button onClick={previewSettle} disabled={settle.resultNumber.length !== game.digits} className="w-full">Preview settlement</Button>
          ) : (
            <>
              <Card className="space-y-1 bg-gray-50 text-sm dark:bg-gray-800/50">
                <div className="flex justify-between"><span>Winning records</span><b>{preview.winningRecords}</b></div>
                <div className="flex justify-between"><span>Gross collected</span><b className="tabular-nums">{fmtMoney(preview.grossCollected)} MMK</b></div>
                <div className="flex justify-between"><span>Total commission</span><b className="tabular-nums">{fmtMoney(preview.totalCommission)} MMK</b></div>
                <div className="flex justify-between"><span>Winning payout</span><b className="tabular-nums text-amber-600">{fmtMoney(preview.totalPayout)} MMK</b></div>
                <div className="flex justify-between border-t border-gray-200 pt-1 dark:border-gray-700">
                  <span>Net profit / loss</span>
                  <b className={`tabular-nums ${BigInt(preview.netProfit) >= 0n ? "text-green-600" : "text-red-600"}`}>{fmtMoney(preview.netProfit)} MMK</b>
                </div>
              </Card>
              <Button onClick={confirmSettle} disabled={busy} className="w-full">
                {busy ? "Settling…" : `Confirm settlement with result ${preview.resultNumber}`}
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* Reopen modal */}
      <Modal open={showReopen} onClose={() => setShowReopen(false)} title="Reopen settlement">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Reopening reverses all wallet movements from this settlement and unlocks the records. This is logged in the audit trail.
          </p>
          <Input label="Reason (required)" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowReopen(false)}>Cancel</Button>
            <Button variant="danger" onClick={reopen} disabled={busy || reopenReason.trim().length < 3}>Reopen</Button>
          </div>
        </div>
      </Modal>

      <Modal open={layoff !== null} onClose={() => setLayoff(null)} title={layoff ? `Pass on ${layoff.number}` : ""}>
        {layoff && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Hand part of this number to another bookmaker. The bet with your customer does
              not change — you still owe them if it comes out — but you carry less of it.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Amount to pass on"
                value={layoff.amount}
                onChange={(e) => setLayoff({ ...layoff, amount: e.target.value })}
                inputMode="decimal"
                autoFocus
              />
              <Input
                label="Their odds"
                value={layoff.odds}
                onChange={(e) => setLayoff({ ...layoff, odds: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <Input
              label="Bookmaker"
              value={layoff.bookmaker}
              onChange={(e) => setLayoff({ ...layoff, bookmaker: e.target.value })}
              placeholder="Who is taking it"
            />
            {Number(layoff.amount) > 0 && Number(layoff.odds) > 0 && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
                If {layoff.number} comes out you collect{" "}
                <b>{(Number(layoff.amount) * Number(layoff.odds)).toLocaleString()}</b> from them.
              </p>
            )}
            <Input
              label="Note"
              value={layoff.note}
              onChange={(e) => setLayoff({ ...layoff, note: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLayoff(null)}>Cancel</Button>
              <Button
                onClick={saveLayoff}
                disabled={!layoff.amount || !layoff.odds || !layoff.bookmaker.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showLimit} onClose={() => setShowLimit(false)} title="Limit per number">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The most you are willing to carry on any one number in this draw. Anything taken
            past it is shown separately, so you can see what to lay off elsewhere.
          </p>
          <Input
            label="Limit (MMK)"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            inputMode="decimal"
            placeholder="60000"
          />
          <p className="text-xs text-gray-500">Leave it empty for no limit.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowLimit(false)}>Cancel</Button>
            <Button onClick={saveLimit}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
