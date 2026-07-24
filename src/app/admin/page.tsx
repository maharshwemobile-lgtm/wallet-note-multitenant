"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Building2, RefreshCw, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface AdminStats {
  registeredAccounts: number;
  registeredUsers: number;
  enabledUsers: number;
  activeUsers: number;
  registeredToday: number;
  updatedAt: string;
}

const stats = [
  { key: "registeredAccounts", label: "Registered Accounts", icon: Building2, tone: "text-blue-600 dark:text-blue-400" },
  { key: "registeredUsers", label: "Registered Users", icon: Users, tone: "text-gray-700 dark:text-gray-200" },
  { key: "activeUsers", label: "Active Users", icon: Activity, tone: "text-green-600 dark:text-green-400" },
  { key: "enabledUsers", label: "Enabled Users", icon: UserCheck, tone: "text-teal-600 dark:text-teal-400" },
  { key: "registeredToday", label: "Registered Today", icon: UserPlus, tone: "text-amber-600 dark:text-amber-400" },
] as const;

export default function AdminPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/stats", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Unable to load statistics");
      setData(body.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load statistics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 30_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
    };
  }, [load]);

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 dark:bg-gray-950 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-blue-600 p-2 text-white">
              <Wallet size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">Wallet Note Admin</h1>
              <p className="text-xs text-gray-500">Registration and user activity</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={`mr-1.5 inline ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {stats.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.key} className="min-h-28">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-gray-500">{item.label}</span>
                  <Icon size={18} className={item.tone} />
                </div>
                <div className={`mt-4 text-3xl font-bold tabular-nums ${item.tone}`}>
                  {data ? data[item.key].toLocaleString() : "-"}
                </div>
              </Card>
            );
          })}
        </section>

        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>Auto refresh: 30 seconds</span>
          <span>{data ? `Updated ${fmtDateTime(data.updatedAt)}` : "Loading..."}</span>
        </div>
      </div>
    </main>
  );
}
