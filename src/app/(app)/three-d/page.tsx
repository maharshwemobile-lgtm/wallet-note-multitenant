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
import { LotteryTransfer } from "@/components/LotteryTransfer";
import { nextDrawDate, sessionSchedule } from "@/lib/lotteryGame";

interface Session {
  id: string; name: string; drawDate: string; drawTime?: string; status: string;
  branchId?: string;
  resultNumber?: string; defaultOdds: string;
  totalBet: string;
  _count: { transactions: number };
}
interface OfficialResult {
  id: string; drawDate: string; drawTime?: string; sessionName: string; resultNumber: string;
}

export default function ThreeDPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [results, setResults] = useState<OfficialResult[]>([]);
  const [showNew, setShowNew] = useNewModal();
  // Thai 3D draws on the 1st and the 16th, so the date is worked out rather than typed;
  // the times come from the game's schedule. All still editable for an odd draw.
  const [form, setForm] = useState(() => {
    const schedule = sessionSchedule("THREE_D", "Official");
    return {
      name: "Official",
      drawDate: nextDrawDate("THREE_D", todayBusinessDate()),
      drawTime: schedule?.drawTime ?? "16:00",
      cutoffTime: schedule?.cutoffTime ?? "15:30",
      defaultOdds: "500",
    };
  });
  const router = useRouter();
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<{ sessions: Session[] }>("/api/v1/three-d/sessions")
      .then((d) => setSessions(d.sessions))
      .catch((e) => push(e.message, "error"));
    api<{ results: OfficialResult[] }>("/api/v1/three-d/results?pageSize=20")
      .then((data) => setResults(data.results))
      .catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  async function createSession() {
    try {
      const s = await api<Session>("/api/v1/three-d/sessions", {
        method: "POST",
        body: { ...form, drawDate: form.drawDate || undefined },
      });
      push("Session created");
      setShowNew(false);
      router.push(`/three-d/${s.id}`);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (!sessions) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">3D Sessions</h1>
        <div className="flex flex-wrap gap-2">
          <LotteryTransfer gameType="THREE_D" sessions={sessions} onImported={load} />
          {hasPerm("three_d.create") && (
            <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New session</Button>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <Card><Empty message="No sessions yet. Create the first draw session." /></Card>
      ) : (
        <Table headers={["Session", "Draw date", "Status", "Result", "Records", "Total bet"]} rightAlign={[4, 5]}>
          {sessions.map((s) => (
            <tr key={s.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => router.push(`/three-d/${s.id}`)}>
              <td className="px-3 py-2.5 font-medium">{s.name} {s.drawTime && <span className="text-xs text-gray-400">{s.drawTime}</span>}</td>
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
          <h2 className="text-sm font-semibold">Official 3D result history</h2>
        </div>
        {results.length === 0 ? (
          <Empty message="Official result history is waiting for the API provider." />
        ) : (
          <Table headers={["Draw date", "Session", "Time", "Result"]}>
            {results.map((result) => (
              <tr key={result.id}>
                <td className="px-3 py-2.5">{result.drawDate}</td>
                <td className="px-3 py-2.5">{result.sessionName}</td>
                <td className="px-3 py-2.5">{result.drawTime ?? "-"}</td>
                <td className="px-3 py-2.5 font-mono text-lg font-bold text-blue-600">{result.resultNumber}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>


      <Modal open={showNew} onClose={() => setShowNew(false)} title="New 3D session">
        <div className="space-y-3">
          <Input label="Session name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Draw date" type="date" value={form.drawDate} onChange={(e) => setForm({ ...form, drawDate: e.target.value })} required />
          <p className="text-xs text-gray-500">Set to the next official draw (the 1st or the 16th).</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Draw time" type="time" value={form.drawTime} onChange={(e) => setForm({ ...form, drawTime: e.target.value })} />
            <Input label="Cut-off time" type="time" value={form.cutoffTime} onChange={(e) => setForm({ ...form, cutoffTime: e.target.value })} />
          </div>
          <Input label="Default odds (payout multiplier)" value={form.defaultOdds} onChange={(e) => setForm({ ...form, defaultOdds: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={createSession}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
