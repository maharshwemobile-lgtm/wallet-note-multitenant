"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileDown, History, Plus, Upload } from "lucide-react";
import { api } from "@/lib/client";
import { todayBusinessDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Select, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { parseThreeDImportCsv, threeDImportTemplate, type ThreeDImportRow } from "@/lib/threeDTransfer";
import { useNewModal } from "@/lib/useNewModal";

interface Session {
  id: string; name: string; drawDate: string; drawTime?: string; status: string;
  branchId?: string;
  resultNumber?: string; defaultOdds: string;
  totalBet: string; totalPotentialPayout: string;
  _count: { transactions: number };
}
interface OfficialResult {
  id: string; drawDate: string; drawTime?: string; sessionName: string; resultNumber: string;
}

export default function ThreeDPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [results, setResults] = useState<OfficialResult[]>([]);
  const [showNew, setShowNew] = useNewModal();
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferSessionId, setTransferSessionId] = useState("");
  const [transferBranchId, setTransferBranchId] = useState("");
  const [templateDownloaded, setTemplateDownloaded] = useState(false);
  const [importRows, setImportRows] = useState<ThreeDImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState(() => ({
    name: "Morning",
    drawDate: todayBusinessDate(),
    drawTime: "12:01",
    cutoffTime: "11:45",
    defaultOdds: "500",
  }));
  const router = useRouter();
  const { push } = useToast();
  const { hasPerm, branches, defaultBranchId } = useAuth();

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

  function downloadBlob(content: BlobPart, filename: string, type = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    downloadBlob(threeDImportTemplate(), "three-d-import-template.csv");
    setTemplateDownloaded(true);
    setImportRows([]);
    setImportErrors([]);
    setImportFileName("");
  }

  async function exportSession() {
    if (!transferSessionId) return;
    try {
      const response = await fetch(`/api/v1/three-d/transfer?sessionId=${encodeURIComponent(transferSessionId)}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Export failed");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "three-d-records.csv";
      downloadBlob(await response.blob(), filename);
    } catch (error) {
      push(error instanceof Error ? error.message : "Export failed", "error");
    }
  }

  async function chooseImportFile(file?: File) {
    setImportRows([]);
    setImportErrors([]);
    setImportFileName(file?.name ?? "");
    if (!file) return;
    const parsed = parseThreeDImportCsv(await file.text());
    setImportRows(parsed.rows);
    setImportErrors(parsed.errors);
  }

  async function importRecords() {
    if (!transferSessionId || !transferBranchId || importRows.length === 0 || importErrors.length) return;
    setImporting(true);
    try {
      const result = await api<{ created: number }>("/api/v1/three-d/transfer", {
        method: "POST",
        body: { sessionId: transferSessionId, branchId: transferBranchId, rows: importRows },
      });
      push(`${result.created} record(s) imported`);
      setShowTransfer(false);
      setImportRows([]);
      setImportFileName("");
      load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  function openTransfer() {
    const firstOpen = sessions?.find((session) => session.status === "OPEN");
    setTransferSessionId(firstOpen?.id ?? sessions?.[0]?.id ?? "");
    setTransferBranchId(firstOpen?.branchId ?? defaultBranchId);
    setTemplateDownloaded(false);
    setImportRows([]);
    setImportErrors([]);
    setImportFileName("");
    setShowTransfer(true);
  }

  if (!sessions) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">3D Sessions</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={openTransfer}>
            <Upload size={16} className="mr-1 inline" />Export / Import
          </Button>
          {hasPerm("three_d.create") && (
            <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New session</Button>
          )}
        </div>
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

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="3D records export / import" wide>
        <div className="space-y-4">
          <Select
            label="Session"
            value={transferSessionId}
            onChange={(event) => {
              const session = sessions.find((item) => item.id === event.target.value);
              setTransferSessionId(event.target.value);
              setTransferBranchId(session?.branchId ?? defaultBranchId);
              setImportRows([]);
              setImportErrors([]);
              setImportFileName("");
            }}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.drawDate} · {session.name} · {session.status}
              </option>
            ))}
          </Select>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={exportSession} disabled={!transferSessionId}>
              <FileDown size={16} className="mr-1 inline" />Export selected session
            </Button>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download size={16} className="mr-1 inline" />Download import template
            </Button>
          </div>

          {hasPerm("three_d.create") && (
            <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-800">
              {branches.length > 1 && (
                <Select label="Import branch" value={transferBranchId} onChange={(event) => setTransferBranchId(event.target.value)}>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </Select>
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Completed template CSV</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!templateDownloaded}
                  onChange={(event) => chooseImportFile(event.target.files?.[0])}
                  className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                />
              </label>
              {!templateDownloaded && (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Download the import template first.</p>
              )}
              {importFileName && importErrors.length === 0 && (
                <p className="text-sm text-green-700 dark:text-green-400">
                  {importFileName}: {importRows.length.toLocaleString()} valid record(s)
                </p>
              )}
              {importErrors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {importErrors.slice(0, 20).map((error) => <div key={error}>{error}</div>)}
                </div>
              )}
              <Button
                onClick={importRecords}
                disabled={
                  importing ||
                  !templateDownloaded ||
                  !transferBranchId ||
                  importRows.length === 0 ||
                  importErrors.length > 0 ||
                  sessions.find((session) => session.id === transferSessionId)?.status !== "OPEN"
                }
                className="w-full"
              >
                <Upload size={16} className="mr-1 inline" />
                {importing ? "Importing..." : `Import ${importRows.length.toLocaleString()} record(s)`}
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New 3D session">
        <div className="space-y-3">
          <Input label="Session name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Draw date" type="date" value={form.drawDate} onChange={(e) => setForm({ ...form, drawDate: e.target.value })} required />
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
