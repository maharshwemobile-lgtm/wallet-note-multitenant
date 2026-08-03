"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { todayBusinessDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Session {
  id: string; name: string; drawDate: string; drawTime?: string; status: string;
  resultNumber?: string; defaultOdds: string;
  totalBet: string; totalPotentialPayout: string;
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
  // Only needed to fill a gap — a Thai holiday, or a day auto-open missed. The normal
  // path creates these by itself.
  const [form, setForm] = useState(() => ({
    name: "MORNING",
    drawDate: todayBusinessDate(),
    drawTime: "12:01",
    cutoffTime: "11:55",
    defaultOdds: "85",
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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">2D Sessions</h1>
        {hasPerm("three_d.create") && (
          <Button variant="secondary" onClick={() => setShowNew(true)}>
            <Plus size={16} className="mr-1 inline" />Add a missed session
          </Button>
        )}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Morning and evening sessions open by themselves every trading day and settle against
        the official number once it is out. Nothing here needs to be created by hand.
      </p>

      {sessions.length === 0 ? (
        <Card>
          <Empty message="No 2D sessions yet. They open automatically on the next trading day once 2D is switched on in Settings → Modules." />
        </Card>
      ) : (
        <Table headers={["Session", "Draw date", "Status", "Result", "Records", "Total bet", "Exposure"]} rightAlign={[4, 5, 6]}>
          {sessions.map((s) => (
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
              {/* A drawn session owes nothing further, so it carries no exposure. */}
              <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">
                {s.status === "SETTLED" ? <span className="text-gray-400">—</span> : fmtMoney(s.totalPotentialPayout)}
              </td>
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
          <Input label="Session name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Draw date" type="date" value={form.drawDate} onChange={(e) => setForm({ ...form, drawDate: e.target.value })} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Draw time" type="time" value={form.drawTime} onChange={(e) => setForm({ ...form, drawTime: e.target.value })} />
            <Input label="Cut-off time" type="time" value={form.cutoffTime} onChange={(e) => setForm({ ...form, cutoffTime: e.target.value })} />
          </div>
          <Input label="Default odds (payout multiplier)" value={form.defaultOdds} onChange={(e) => setForm({ ...form, defaultOdds: e.target.value })} />
          <p className="text-xs text-gray-500">
            The name must be MORNING or EVENING for the official number to settle it automatically.
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
