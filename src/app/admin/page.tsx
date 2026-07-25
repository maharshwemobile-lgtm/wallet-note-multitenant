"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, RefreshCw, Search, ShieldCheck, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface AdminStats {
  registeredAccounts: number;
  registeredUsers: number;
  enabledUsers: number;
  activeUsers: number;
  registeredToday: number;
  registrationAuditRecords: number;
  users: {
    id: string;
    name: string;
    username: string;
    businessName: string;
    active: boolean;
    hasValidSession: boolean;
    lastSessionAt: string | null;
    createdAt: string;
  }[];
  updatedAt: string;
}

const stats = [
  { key: "registeredAccounts", label: "Registered Accounts", icon: Building2, tone: "text-blue-600 dark:text-blue-400" },
  { key: "registeredUsers", label: "Registered Users", icon: Users, tone: "text-gray-700 dark:text-gray-200" },
  { key: "activeUsers", label: "Valid Login Sessions", icon: ShieldCheck, tone: "text-green-600 dark:text-green-400" },
  { key: "enabledUsers", label: "Enabled Users", icon: UserCheck, tone: "text-teal-600 dark:text-teal-400" },
  { key: "registeredToday", label: "Registered Today", icon: UserPlus, tone: "text-amber-600 dark:text-amber-400" },
  { key: "registrationAuditRecords", label: "Registration Audit Records", icon: UserPlus, tone: "text-violet-600 dark:text-violet-400" },
] as const;

export default function AdminPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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

  const needle = query.trim().toLowerCase();
  const visibleUsers = (data?.users ?? []).filter((user) =>
    !needle ||
    user.username.toLowerCase().includes(needle) ||
    user.name.toLowerCase().includes(needle) ||
    user.businessName.toLowerCase().includes(needle)
  );

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

        <section className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
            <div>
              <h2 className="text-sm font-semibold">Registered User Audit</h2>
              <p className="mt-1 text-xs text-gray-500">
                PostgreSQL user records, newest first. A valid session does not necessarily mean the user is online now.
              </p>
            </div>
            <label className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search username, owner, business"
                className="min-h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </label>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950">
                <tr>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Owner name</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Login session</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium">{user.businessName}</td>
                    <td className="px-4 py-3">{user.name}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700 dark:text-blue-400">{user.username}</td>
                    <td className="px-4 py-3">
                      <span className={user.active ? "text-green-700 dark:text-green-400" : "text-red-600"}>
                        {user.active ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={user.hasValidSession ? "text-green-700 dark:text-green-400" : "text-gray-400"}>
                        {user.hasValidSession ? "Valid" : "None"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{fmtDateTime(user.createdAt)}</td>
                  </tr>
                ))}
                {!loading && visibleUsers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No registered users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800">
            Showing {visibleUsers.length.toLocaleString()} of {(data?.users.length ?? 0).toLocaleString()} loaded users
          </footer>
        </section>

        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>Auto refresh: 30 seconds</span>
          <span>{data ? `Updated ${fmtDateTime(data.updatedAt)}` : "Loading..."}</span>
        </div>
      </div>
    </main>
  );
}
