"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, Input, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import {
  defaultFeaturesForMode,
  FEATURE_DEFINITIONS,
  moduleSettingFromFeatures,
  parseModuleAccess,
  type FeatureVisibility,
} from "@/lib/modules";
import { DEFAULT_ABOUT, mergeAbout, type AboutContent } from "@/lib/about";

interface SettingsData {
  business: { id: string; name: string; phone?: string; address?: string; telegram?: string; website?: string; currency: string; timezone: string };
  settings: Record<string, Record<string, unknown>>;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [biz, setBiz] = useState({ name: "", phone: "", address: "", telegram: "", website: "" });
  const [threeD, setThreeD] = useState({ defaultOdds: "500", defaultCommissionRate: "10", maxPerNumber: "", warnThreshold: "" });
  const [about, setAbout] = useState<AboutContent>(DEFAULT_ABOUT);
  const [features, setFeatures] = useState<FeatureVisibility>(
    defaultFeaturesForMode("WALLET_ONLY")
  );
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { refreshAuth, playEdition } = useAuth();

  const load = useCallback(() => {
    api<SettingsData>("/api/v1/settings").then((d) => {
      setData(d);
      setBiz({
        name: d.business.name ?? "", phone: d.business.phone ?? "", address: d.business.address ?? "",
        telegram: d.business.telegram ?? "", website: d.business.website ?? "",
      });
      const t = d.settings.three_d as typeof threeD | undefined;
      if (t) setThreeD({ ...threeD, ...t });
      const a = d.settings.about as Partial<AboutContent> | undefined;
      setAbout(mergeAbout(a));
      setFeatures(parseModuleAccess(d.settings.modules ?? { miniMartEnabled: true }).features);
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
        body: { key: "modules", value: moduleSettingFromFeatures(features) },
      });
      await refreshAuth();
      push("Module setting saved");
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
          <div className="grid gap-3 sm:grid-cols-2">
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
        <h3 className="text-sm font-semibold">Sidebar functions</h3>
        {(["Mini Mart", "Wallet Note", "General"] as const).map((group) => (
          <div key={group} className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">{group}</h4>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {FEATURE_DEFINITIONS
                .filter((item) => item.group === group && (!playEdition || item.key !== "threeD"))
                .map((item) => (
                <div key={item.key} className="flex min-h-12 items-center justify-between gap-4 px-3 py-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={features[item.key]}
                    aria-label={`${item.label} ${features[item.key] ? "on" : "off"}`}
                    onClick={() =>
                      setFeatures((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }))
                    }
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      features[item.key] ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                        features[item.key] ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                ))}
            </div>
          </div>
        ))}
        <Button className="mt-3" disabled={busy} onClick={saveModules}>
          Save sidebar functions
        </Button>
      </Card>

      {!playEdition && <Card>
        <h3 className="mb-3 text-sm font-semibold">3D settings</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Default odds" value={threeD.defaultOdds} onChange={(e) => setThreeD({ ...threeD, defaultOdds: e.target.value })} />
          <Input label="Default commission %" value={threeD.defaultCommissionRate} onChange={(e) => setThreeD({ ...threeD, defaultCommissionRate: e.target.value })} />
          <Input label="Max amount per number" value={threeD.maxPerNumber} onChange={(e) => setThreeD({ ...threeD, maxPerNumber: e.target.value })} />
          <Input label="Warning threshold" value={threeD.warnThreshold} onChange={(e) => setThreeD({ ...threeD, warnThreshold: e.target.value })} />
        </div>
        <Button className="mt-3" disabled={busy} onClick={() => save(() => api("/api/v1/settings", { method: "PUT", body: { key: "three_d", value: threeD } }))}>
          Save 3D settings
        </Button>
      </Card>}

      <Card>
        <h3 className="mb-3 text-sm font-semibold">About Us page content</h3>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="App name" value={about.appName} onChange={(e) => setAbout({ ...about, appName: e.target.value })} />
            <Input label="Version" value={about.version} onChange={(e) => setAbout({ ...about, version: e.target.value })} />
          </div>
          <Input label="Description" value={about.description} onChange={(e) => setAbout({ ...about, description: e.target.value })} />
          <Input label="Location" value={about.location} onChange={(e) => setAbout({ ...about, location: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Developer / company" value={about.developer} onChange={(e) => setAbout({ ...about, developer: e.target.value })} />
            <Input label="Contact phone" value={about.phone} onChange={(e) => setAbout({ ...about, phone: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Developer photo path" value={about.developerPhoto} onChange={(e) => setAbout({ ...about, developerPhoto: e.target.value })} />
            <Input label="Developer photo source" value={about.developerPhotoSource} onChange={(e) => setAbout({ ...about, developerPhotoSource: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Telegram" value={about.telegram} onChange={(e) => setAbout({ ...about, telegram: e.target.value })} />
            <Input label="TikTok" value={about.tiktok} onChange={(e) => setAbout({ ...about, tiktok: e.target.value })} />
          </div>
          <Input label="Telegram community" value={about.community} onChange={(e) => setAbout({ ...about, community: e.target.value })} />
          <Input label="Facebook page" value={about.facebook} onChange={(e) => setAbout({ ...about, facebook: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Website" value={about.website} onChange={(e) => setAbout({ ...about, website: e.target.value })} />
            <Input label="Customer live URL" value={about.customerLiveUrl} onChange={(e) => setAbout({ ...about, customerLiveUrl: e.target.value })} />
          </div>
          <Input label="Copyright" value={about.copyright} onChange={(e) => setAbout({ ...about, copyright: e.target.value })} />
          {!playEdition && <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
            <h4 className="mb-3 text-sm font-semibold">Donation QR details</h4>
            <div className="space-y-3">
              <Input label="KBZ Pay display name" value={about.kbzName} onChange={(e) => setAbout({ ...about, kbzName: e.target.value })} />
              <Input label="KBZ Pay QR payload" value={about.kbzPayload} onChange={(e) => setAbout({ ...about, kbzPayload: e.target.value })} />
              <Input label="USDT BEP20 address" value={about.cryptoName} onChange={(e) => setAbout({ ...about, cryptoName: e.target.value, cryptoPayload: e.target.value })} />
              <Input label="PromptPay display name" value={about.promptPayName} onChange={(e) => setAbout({ ...about, promptPayName: e.target.value })} />
              <Input label="PromptPay QR payload" value={about.promptPayPayload} onChange={(e) => setAbout({ ...about, promptPayPayload: e.target.value })} />
            </div>
          </div>}
          <Button disabled={busy} onClick={() => save(() => api("/api/v1/settings", { method: "PUT", body: { key: "about", value: about } }))}>
            Save About content
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">Privacy and account</h3>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/privacy">Privacy policy</Link>
          <Link className="font-medium text-red-600 hover:text-red-700" href="/account-deletion">Request account deletion</Link>
        </div>
      </Card>
    </div>
  );
}
