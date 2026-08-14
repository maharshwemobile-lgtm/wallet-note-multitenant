"use client";

import { useState } from "react";
import { Download, FileDown, Upload } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Modal, Select, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { gameRules } from "@/lib/lotteryGame";
import {
  encodeCsv,
  parseThreeDImportCsv,
  THREE_D_IMPORT_HEADERS,
  type ThreeDImportRow,
} from "@/lib/threeDTransfer";

/** Moving records between shops, as a file.
 *
 *  This is how a shop hands what it has laid off to the house taking it on, and how that
 *  house takes it up. Deliberately a file rather than one shop writing into another's
 *  records: every query in this app is fenced by businessId, and a direct write would open
 *  the hole that fence exists to close. It also keeps working when the other house does
 *  not use Wallet Note at all.
 *
 *  One component for both games. It used to live on the 3D page alone, so a 2D shop — the
 *  common case here — had no way to take records in at all.
 */

export interface TransferSession {
  id: string;
  name: string;
  drawDate: string;
  status: string;
  branchId?: string;
}

export function LotteryTransfer({
  gameType,
  sessions,
  onImported,
}: {
  gameType: string;
  sessions: TransferSession[];
  onImported: () => void;
}) {
  const { hasPerm, defaultBranchId, branches } = useAuth();
  const { push } = useToast();
  const rules = gameRules(gameType);

  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [templateDownloaded, setTemplateDownloaded] = useState(false);
  const [rows, setRows] = useState<ThreeDImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  function clearFile() {
    setRows([]);
    setErrors([]);
    setFileName("");
  }

  function downloadBlob(content: BlobPart, name: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** The template carries this game's own digits, or a 2D shop would be handed 3D
   *  examples and file numbers this session cannot accept. */
  function downloadTemplate() {
    const example = rules.digits === 2 ? ["07", "70"] : ["123", "007"];
    const csv =
      "﻿" +
      encodeCsv([
        [...THREE_D_IMPORT_HEADERS],
        [`="${example[0]}"`, "5000", "Mg Mg", "09123456789", "", "", ""],
        [`="${example[1]}"`, "2000", "", "", "", "", "Leading zero example"],
      ]);
    downloadBlob(csv, `${rules.label.toLowerCase()}-import-template.csv`);
    setTemplateDownloaded(true);
    clearFile();
  }

  async function exportSession() {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/v1/three-d/transfer?sessionId=${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Export failed");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? "records.csv";
      downloadBlob(await response.blob(), name);
    } catch (error) {
      push(error instanceof Error ? error.message : "Export failed", "error");
    }
  }

  async function chooseFile(file?: File) {
    clearFile();
    setFileName(file?.name ?? "");
    if (!file) return;
    const parsed = parseThreeDImportCsv(await file.text(), rules.digits);
    setRows(parsed.rows);
    setErrors(parsed.errors);
  }

  async function importRecords() {
    if (!sessionId || !branchId || rows.length === 0 || errors.length) return;
    setImporting(true);
    try {
      const result = await api<{ created: number }>("/api/v1/three-d/transfer", {
        method: "POST",
        body: { sessionId, branchId, rows },
      });
      push(`${result.created} record(s) imported`);
      setOpen(false);
      clearFile();
      onImported();
    } catch (error) {
      push(error instanceof Error ? error.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  function openTransfer() {
    const firstOpen = sessions.find((session) => session.status === "OPEN");
    setSessionId(firstOpen?.id ?? sessions[0]?.id ?? "");
    setBranchId(firstOpen?.branchId ?? defaultBranchId);
    setTemplateDownloaded(false);
    clearFile();
    setOpen(true);
  }

  const chosen = sessions.find((session) => session.id === sessionId);

  return (
    <>
      <Button variant="secondary" onClick={openTransfer}>
        <Upload size={16} className="mr-1 inline" />Export / Import
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`${rules.label} records export / import`} wide>
        <div className="space-y-4">
          <Select
            label="Session"
            value={sessionId}
            onChange={(event) => {
              const session = sessions.find((item) => item.id === event.target.value);
              setSessionId(event.target.value);
              setBranchId(session?.branchId ?? defaultBranchId);
              clearFile();
            }}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.drawDate} · {session.name} · {session.status}
              </option>
            ))}
          </Select>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={exportSession} disabled={!sessionId}>
              <FileDown size={16} className="mr-1 inline" />Export selected session
            </Button>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download size={16} className="mr-1 inline" />Download import template
            </Button>
          </div>

          {hasPerm("three_d.create") && (
            <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-800">
              {branches.length > 1 && (
                <Select label="Import branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Completed template CSV</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!templateDownloaded}
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                  className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                />
              </label>
              {!templateDownloaded && (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Download the import template first.
                </p>
              )}
              {fileName && errors.length === 0 && (
                <p className="text-sm text-green-700 dark:text-green-400">
                  {fileName}: {rows.length.toLocaleString()} valid record(s)
                </p>
              )}
              {errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {errors.slice(0, 20).map((error) => <div key={error}>{error}</div>)}
                </div>
              )}
              <Button
                onClick={importRecords}
                disabled={
                  importing ||
                  !templateDownloaded ||
                  !branchId ||
                  rows.length === 0 ||
                  errors.length > 0 ||
                  chosen?.status !== "OPEN"
                }
                className="w-full"
              >
                <Upload size={16} className="mr-1 inline" />
                {importing ? "Importing..." : `Import ${rows.length.toLocaleString()} record(s)`}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
