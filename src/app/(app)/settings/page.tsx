"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Input, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface SettingsData {
  business: { id: string; name: string; phone?: string; address?: string; telegram?: string; website?: string; currency: string; timezone: string };
  settings: Record<string, Record<string, unknown>>;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [biz, setBiz] = useState({ name: "", phone: "", address: "", telegram: "", website: "" });
  const [threeD, setThreeD] = useState({ defaultOdds: "500", defaultCommissionRate: "10", maxPerNumber: "", warnThreshold: "" });
  const [about, setAbout] = useState({ appName: "Wallet Note", version: "1.0.0", description: "", developer: "", phone: "", telegram: "", website: "", copyright: "" });
  const [miniMartEnabled, setMiniMartEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { refreshAuth } = useAuth();

  const load = useCallback(() => {
    api<SettingsData>("/api/v1/settings").then((d) => {
      setData(d);
      setBiz({
        name: d.business.name ?? "", phone: d.business.phone ?? "", address: d.business.address ?? "",
        telegram: d.business.telegram ?? "", website: d.business.website ?? "",
      });
      const t = d.settings.three_d as typeof threeD | undefined;
      if (t) setThreeD({ ...threeD, ...t });
      const a = d.settings.about as typeof about | undefined;
      if (a) setAbout({ ...about, ...a });
      const modules = d.settings.modules as { miniMartEnabled?: boolean } | undefined;
      setMiniMartEnabled(modules ? modules.miniMartEnabled === true : true);
    }).catch((e) => push(e.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push]);
  useEffect(load, [load]);

  async function save(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      push("Settings saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveModules() {
    setBusy(true);
    try {
      await api("/api/v1/settings", {
        method: "PUT",
        body: { key: "modules", value: { miniMartEnabled } },
      });
      await refreshAuth();
      push("Mini Mart setting saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Business profile</h3>
        <div className="space-y-3">
          <Input label="Business name" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} />
            <Input label="Telegram" value={biz.telegram} onChange={(e) => setBiz({ ...biz, telegram: e.target.value })} />
          </div>
          <Input label="Address" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} />
          <Input label="Website" value={biz.website} onChange={(e) => setBiz({ ...biz, website: e.target.value })} />
          <p className="text-xs text-gray-500">Default currency: {data.business.currency} · Time zone: {data.business.timezone}</p>
          <Button disabled={busy} onClick={() => save(() => api("/api/v1/settings", { method: "PATCH", body: biz }))}>Save profile</Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Mini Mart functions</h3>
            <p className="mt-1 text-xs text-gray-500">
              Items, stock, purchases, suppliers, and Sales &amp; POS
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={miniMartEnabled}
            onClick={() => setMiniMartEnabled((enabled) => !enabled)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${miniMartEnabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${miniMartEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <Button className="mt-3" disabled={busy} onClick={saveModules}>
          Save Mini Mart setting
        </Button>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">3D settings</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Default odds" value={threeD.defaultOdds} onChange={(e) => setThreeD({ ...threeD, defaultOdds: e.target.value })} />
          <Input label="Default commission %" value={threeD.defaultCommissionRate} onChange={(e) => setThreeD({ ...threeD, defaultCommissionRate: e.target.value })} />
          <Input label="Max amount per number" value={threeD.maxPerNumber} onChange={(e) => setThreeD({ ...threeD, maxPerNumber: e.target.value })} />
          <Input label="Warning threshold" value={threeD.warnThreshold} onChange={(e) => setThreeD({ ...threeD, warnThreshold: e.target.value })} />
        </div>
        <Button className="mt-3" disabled={busy} onClick={() => save(() => api("/api/v1/settings", { method: "PUT", body: { key: "three_d", value: threeD } }))}>
          Save 3D settings
        </Button>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">About Us page content</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="App name" value={about.appName} onChange={(e) => setAbout({ ...about, appName: e.target.value })} />
            <Input label="Version" value={about.version} onChange={(e) => setAbout({ ...about, version: e.target.value })} />
          </div>
          <Input label="Description" value={about.description} onChange={(e) => setAbout({ ...about, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Developer / company" value={about.developer} onChange={(e) => setAbout({ ...about, developer: e.target.value })} />
            <Input label="Contact phone" value={about.phone} onChange={(e) => setAbout({ ...about, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Telegram" value={about.telegram} onChange={(e) => setAbout({ ...about, telegram: e.target.value })} />
            <Input label="Website" value={about.website} onChange={(e) => setAbout({ ...about, website: e.target.value })} />
          </div>
          <Input label="Copyright" value={about.copyright} onChange={(e) => setAbout({ ...about, copyright: e.target.value })} />
          <Button disabled={busy} onClick={() => save(() => api("/api/v1/settings", { method: "PUT", body: { key: "about", value: about } }))}>
            Save About content
          </Button>
        </div>
      </Card>
    </div>
  );
}
