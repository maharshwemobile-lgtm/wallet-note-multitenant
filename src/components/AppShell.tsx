"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Hash, ArrowLeftRight, Wallet, HandCoins, FileBarChart,
  Users, UserCog, Settings, ScrollText, Info, Menu, X, LogOut,
  Moon, Sun, Receipt, Plus, ShoppingCart, Package, Boxes, Truck, Building2,
} from "lucide-react";
import { api } from "@/lib/client";
import { ToastProvider, cn } from "./ui";
import { PwaInstall } from "./PwaInstall";
import { LanguageSwitch } from "./LanguageProvider";
import type { ModuleMode } from "@/lib/modules";

interface Me {
  user: {
    id: string; name: string; username: string; roleName: string;
    permissions: string[]; allBranches: boolean; branchIds: string[];
  };
  branches: { id: string; name: string; code: string }[];
  modules: { mode: ModuleMode; miniMartEnabled: boolean; walletNoteEnabled: boolean };
}

const AuthCtx = createContext<{
  me: Me | null;
  hasPerm: (p: string) => boolean;
  branches: Me["branches"];
  defaultBranchId: string;
  miniMartEnabled: boolean;
  walletNoteEnabled: boolean;
  moduleMode: ModuleMode;
  refreshAuth: () => Promise<void>;
}>({
  me: null,
  hasPerm: () => false,
  branches: [],
  defaultBranchId: "",
  miniMartEnabled: false,
  walletNoteEnabled: true,
  moduleMode: "WALLET_ONLY",
  refreshAuth: async () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/pos", label: "Sales & POS", icon: ShoppingCart, perm: "sale.create", miniMart: true },
  { href: "/purchases", label: "Purchases", icon: Truck, perm: "purchase.view", miniMart: true },
  { href: "/items", label: "Items", icon: Package, perm: "item.view", miniMart: true },
  { href: "/stock", label: "Stock", icon: Boxes, perm: "stock.view", miniMart: true },
  { href: "/three-d", label: "3D Records", icon: Hash, perm: "three_d.view", walletNote: true },
  { href: "/exchange", label: "Exchange", icon: ArrowLeftRight, perm: "exchange.view", walletNote: true },
  { href: "/wallets", label: "Wallets", icon: Wallet, perm: "wallet.view", walletNote: true },
  { href: "/credit", label: "Credit & Payable", icon: HandCoins, perm: "credit.view", walletNote: true },
  { href: "/income-expense", label: "Income & Expense", icon: Receipt, perm: "income_expense.view", walletNote: true },
  { href: "/reports", label: "Reports", icon: FileBarChart, perm: "report.view" },
  { href: "/customers", label: "Customers", icon: Users, perm: "customer.view" },
  { href: "/suppliers", label: "Suppliers", icon: Building2, perm: "customer.view", miniMart: true },
  { href: "/users", label: "Users & Roles", icon: UserCog, perm: "users.manage" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings.manage" },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, perm: "audit.view" },
  { href: "/about", label: "About Us", icon: Info, perm: null },
];

const MINI_MART_PATHS = ["/pos", "/sales", "/purchases", "/items", "/stock", "/suppliers"];
const WALLET_NOTE_PATHS = ["/three-d", "/exchange", "/wallets", "/credit", "/income-expense"];

export function AppShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [dark, setDark] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const refreshAuth = useCallback(async () => {
    const next = await api<Me>("/api/v1/auth/me");
    setMe(next);
  }, []);

  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("wn-theme", next ? "dark" : "light");
  }

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const miniMartEnabled = me?.modules.miniMartEnabled ?? false;
  const walletNoteEnabled = me?.modules.walletNoteEnabled ?? true;
  const blockedMiniMartPath = !miniMartEnabled && MINI_MART_PATHS.some((path) => pathname.startsWith(path));
  const blockedWalletNotePath = !walletNoteEnabled && WALLET_NOTE_PATHS.some((path) => pathname.startsWith(path));
  const blockedModulePath = blockedMiniMartPath || blockedWalletNotePath;

  useEffect(() => {
    if (me && blockedModulePath) router.replace("/");
  }, [blockedModulePath, me, router]);

  if (loading || !me) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  const hasPerm = (p: string) => me.user.permissions.includes(p);
  const visibleNav = NAV.filter((n) =>
    (!n.perm || hasPerm(n.perm)) &&
    (!n.miniMart || miniMartEnabled) &&
    (!n.walletNote || walletNoteEnabled)
  );
  const mobileNav = visibleNav.slice(0, 4);

  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-3">
      {visibleNav.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setDrawer(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            )}
          >
            <n.icon size={18} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <AuthCtx.Provider
      value={{
        me,
        hasPerm,
        branches: me.branches,
        defaultBranchId: me.branches[0]?.id ?? "",
        miniMartEnabled,
        walletNoteEnabled,
        moduleMode: me.modules.mode,
        refreshAuth,
      }}
    >
      <ToastProvider>
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <aside className="no-print hidden w-60 shrink-0 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:block">
            <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="rounded-lg bg-blue-600 p-1.5 text-white"><Wallet size={18} /></div>
              <span className="font-bold">Wallet Note</span>
            </div>
            {sidebar}
          </aside>

          {/* Mobile drawer */}
          {drawer && (
            <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setDrawer(false)}>
              <aside className="h-full w-[min(18rem,88vw)] overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
                  <span className="font-bold">Wallet Note</span>
                  <button onClick={() => setDrawer(false)}><X size={20} /></button>
                </div>
                {sidebar}
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Top bar */}
            <header className="no-print sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-gray-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 sm:px-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden" onClick={() => setDrawer(true)}>
                  <Menu size={20} />
                </button>
                <span className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                  {me.user.name} · {me.user.roleName}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <LanguageSwitch className="mr-1" />
                <PwaInstall compact />
                <button onClick={toggleTheme} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Toggle theme">
                  {dark ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <button onClick={logout} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Sign out">
                  <LogOut size={18} />
                </button>
              </div>
            </header>

            <main className="min-w-0 flex-1 p-3 pb-24 sm:p-4 lg:pb-6">
              {blockedModulePath ? (
                <div className="flex min-h-40 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                </div>
              ) : children}
            </main>

            {/* Mobile bottom nav */}
            <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-800 dark:bg-gray-900 lg:hidden">
              {mobileNav.map((n) => {
                const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium",
                      active ? "text-blue-600" : "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    <n.icon size={20} />
                    <span className="max-w-full truncate">{n.label.split(" ")[0]}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Floating new-transaction button (mobile) */}
            {walletNoteEnabled && hasPerm("three_d.create") && (
              <Link
                href="/three-d?new=1"
                className="no-print fixed bottom-16 right-4 z-30 rounded-full bg-blue-600 p-3.5 text-white shadow-lg lg:hidden"
                title="New transaction"
              >
                <Plus size={22} />
              </Link>
            )}
          </div>
        </div>
      </ToastProvider>
    </AuthCtx.Provider>
  );
}
