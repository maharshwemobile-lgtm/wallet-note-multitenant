"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { todayBusinessDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Select, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { LotteryTransfer } from "@/components/LotteryTransfer";

interface Session {
  id: string; name: string; drawDate: string; drawTime?: string; cutoffTime?: string; status: string;
  resultNumber?: string; defaultOdds: string;
  totalBet: string;
  _count: { transactions: number };
}
interface OfficialResult {
  drawDate: string; drawTime?: string; sessionName: string; resultNumber: string;
  setValue?: string; value?: string;
}

export default function TwoDPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [results, setResults] = useState<OfficialResult[]>([]);
  const [showNew, setShowNew] = useNewModal();
  // Yesterday's draws and today's finished ones are history, not something to act on.
  const [showPast, setShowPast] = useState(false);
  // Only needed to fill a gap — a Thai holiday, or a day auto-open missed. The normal
  // path creates these by itself.
  // Only the draw and the date. Times come from the session name on the server, and the
  // odds from the game, so there is nothing here that can be mistyped.
  const [form, setForm] = useState(() => ({
    name: "MORNING",
    drawDate: todayBusinessDate(),
  }));
  const router = useRouter();
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<{ sessions: Session[] }>("/api/v1/three-d/sessions?game=TWO_D")
      .then((d) => setSessions(d.sessions))
      .catch((e) => push(e.message, "error"));
    api<OfficialResult[]>("/api/v1/two-d/results?limit=20")
      .then(setResults)
      .catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  async function createSession() {
    try {
      const s = await api<Session>("/api/v1/three-d/sessions", {
        method: "POST",
        body: { ...form, gameType: "TWO_D" },
      });
      push("Session created");
      setShowNew(false);
      router.push(`/two-d/${s.id}`);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (!sessions) return <Spinner />;

  // In the evening the morning draw is over and only clutters the list; in the morning the
  // evening one has not come round yet. Only what can still be acted on is shown, and the
  // rest is a click away.
  const today = todayBusinessDate();
  const nowHhMm = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const isCurrent = (session: Session) =>
    session.drawDate > today ||
    (session.drawDate === today && (!session.cutoffTime || nowHhMm < session.cutoffTime));
  const current = sessions.filter(isCurrent);
  const past = sessions.filter((session) => !isCurrent(session));
  const visible = showPast ? sessions : current;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">2D Sessions</h1>
        <div className="flex flex-wrap gap-2">
          {/* 2D had no way to take records in at all, so a shop being handed what another
              laid off had nowhere to put it. */}
          <LotteryTransfer gameType="TWO_D" sessions={sessions} onImported={load} />
          {hasPerm("three_d.create") && (
            <Button variant="secondary" onClick={() => setShowNew(true)}>
              <Plus size={16} className="mr-1 inline" />Add a missed session
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Morning and evening open by themselves every trading day and settle once the
          official number is out. Nothing here needs creating by hand.
        </p>
        {past.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPast((current) => !current)}
            className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {showPast ? "Hide finished draws" : `Show finished draws (${past.length})`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <Card>
          <Empty
            message={
              past.length > 0
                ? "No draw is open right now. The next one opens on its own."
                : "No 2D sessions yet. They open automatically on the next trading day."
            }
          />
        </Card>
      ) : (
        <Table headers={["Session", "Draw date", "Status", "Result", "Records", "Total bet"]} rightAlign={[4, 5]}>
          {visible.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
              onClick={() => router.push(`/two-d/${s.id}`)}
            >
              <td className="px-3 py-2.5 font-medium">
                {s.name} {s.drawTime && <span className="text-xs text-gray-400">{s.drawTime}</span>}
              </td>
              <td className="px-3 py-2.5">{s.drawDate}</td>
              <td className="px-3 py-2.5"><Badge status={s.status} /></td>
              <td className="px-3 py-2.5 font-mono font-bold">{s.resultNumber ?? "—"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{s._count.transactions}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(s.totalBet)}</td>
            </tr>
          ))}
        </Table>
      )}

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <History size={18} className="text-blue-600" />
          <h2 className="text-sm font-semibold">Official 2D result history</h2>
        </div>
        {results.length === 0 ? (
          <Empty message="No official results fetched yet." />
        ) : (
          <Table headers={["Draw date", "Session", "Time", "SET", "Value", "Result"]}>
            {results.map((result) => (
              <tr key={`${result.drawDate}:${result.sessionName}`}>
                <td className="px-3 py-2.5">{result.drawDate}</td>
                <td className="px-3 py-2.5">{result.sessionName}</td>
                <td className="px-3 py-2.5">{result.drawTime ?? "-"}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-500">{result.setValue ?? "-"}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-500">{result.value ?? "-"}</td>
                <td className="px-3 py-2.5 font-mono text-lg font-bold text-blue-600">{result.resultNumber}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Add a missed 2D session">
        <div className="space-y-3">
          <Select label="Draw" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}>
            <option value="MORNING">Morning — draws 12:01, closes 11:55</option>
            <option value="EVENING">Evening — draws 16:30, closes 16:25</option>
          </Select>
          <Input label="Draw date" type="date" value={form.drawDate} onChange={(e) => setForm({ ...form, drawDate: e.target.value })} required />
          <p className="text-xs text-gray-500">
            Times and odds (85) are set from the draw you pick.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={createSession}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
