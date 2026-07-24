"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { History, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Session {
  id: string; name: string; drawDate: string; drawTime?: string; status: string;
  resultNumber?: string; defaultOdds: string;
  totalBet: string; totalPotentialPayout: string;
  _count: { transactions: number };
}
interface OfficialResult {
  id: string; drawDate: string; drawTime?: string; sessionName: string; resultNumber: string;
}

function ThreeDContent() {
  const search = useSearchParams();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [results, setResults] = useState<OfficialResult[]>([]);
  const [showNew, setShowNew] = useState(() => search.get("new") === "1");
  const [form, setForm] = useState({ name: "Morning", drawDate: "", drawTime: "12:01", cutoffTime: "11:45", defaultOdds: "500" });
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">3D Sessions</h1>
        {hasPerm("three_d.create") && (
          <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New session</Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <Card><Empty message="No sessions yet. Create the first draw session." /></Card>
      ) : (
        <Table headers={["Session", "Draw date", "Status", "Result", "Records", "Total bet", "Exposure"]} rightAlign={[4, 5, 6]}>
          {sessions.map((s) => (
            <tr key={s.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => router.push(`/three-d/${s.id}`)}>
              <td className="px-3 py-2.5 font-medium">{s.name} {s.drawTime && <span className="text-xs text-gray-400">{s.drawTime}</span>}</td>
              <td className="px-3 py-2.5">{s.drawDate}</td>
              <td className="px-3 py-2.5"><Badge status={s.status} /></td>
              <td className="px-3 py-2.5 font-mono font-bold">{s.resultNumber ?? "—"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{s._count.transactions}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(s.totalBet)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{fmtMoney(s.totalPotentialPayout)}</td>
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
          <Input label="Draw date" type="date" value={form.drawDate} onChange={(e) => setForm({ ...form, drawDate: e.target.value })} />
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

export default function ThreeDPage() {
  return <Suspense fallback={<Spinner />}><ThreeDContent /></Suspense>;
}
