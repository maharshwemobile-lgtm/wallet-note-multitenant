"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, Input, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import {
  defaultFeaturesForMode,
  FEATURE_DEFINITIONS,
  FEATURE_GROUPS,
  moduleSettingFromFeatures,
  parseModuleAccess,
  type FeatureVisibility,
} from "@/lib/modules";
import { DEFAULT_ABOUT, mergeAbout, type AboutContent } from "@/lib/about";
import {
  parsePaymentMethods,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL_MY,
  type PaymentMethod,
} from "@/lib/payments";

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
  const [exchange, setExchange] = useState({ autoRate: false, buyAdjust: "0", sellAdjust: "0" });
  const [market, setMarket] = useState<{ buy: string; sell: string; postedAt: string } | null>(null);
  const [payMethods, setPayMethods] = useState<PaymentMethod[]>([]);
  const [customerBetting, setCustomerBetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { push } = useToast();
  const { refreshAuth, playEdition, me } = useAuth();

  async function deleteBusiness() {
    setDeleting(true);
    try {
      await api("/api/v1/account/delete", { method: "POST", body: { confirmName: deleteConfirm.trim() } });
      // The account no longer exists, so there is nothing to return to — leave the app
      // entirely rather than routing to a page that would fail to load.
      window.location.href = "/login";
    } catch (e) {
      push(e instanceof Error ? e.message : "Delete failed", "error");
      setDeleting(false);
    }
  }

  const load = useCallback(() => {
    api<{ market: { buy: string; sell: string; postedAt: string; fresh: boolean } | null }>(
      "/api/v1/exchange/market-rate"
    )
      .then((d) => setMarket(d.market))
      .catch(() => setMarket(null));
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
      const ex = d.settings.exchange as { autoRate?: boolean; buyAdjust?: number; sellAdjust?: number } | undefined;
      if (ex) {
        setExchange({
          autoRate: ex.autoRate === true,
          buyAdjust: String(ex.buyAdjust ?? 0),
          sellAdjust: String(ex.sellAdjust ?? 0),
        });
      }
      const pay = d.settings.payments;
      setPayMethods(parsePaymentMethods(pay));
      setCustomerBetting(pay?.customerBetting === true);
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
        {FEATURE_GROUPS.map((group) => (
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
        <h3 className="text-sm font-semibold">Exchange rate</h3>
        <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
          Take the published market rate each day and put your own margin on it, or leave it
          off and quote the rate you set yourself.
        </p>

        {market && (
          <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/50">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">Market today</span>
              <span className="tabular-nums font-medium">buy {market.buy} · sell {market.sell}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">Published {market.postedAt}</div>
          </div>
        )}

        <label className="mb-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={exchange.autoRate}
            onChange={(e) => setExchange({ ...exchange, autoRate: e.target.checked })}
            className="mt-1 h-4 w-4"
          />
          <span>
            Follow the market rate
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              If the feed goes quiet, your own rate below is used instead — never another
              source. Every other live feed reports the official rate, which is about half
              the market.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Buy adjustment (kyat)"
            value={exchange.buyAdjust}
            onChange={(e) => setExchange({ ...exchange, buyAdjust: e.target.value })}
            placeholder="-2"
          />
          <Input
            label="Sell adjustment (kyat)"
            value={exchange.sellAdjust}
            onChange={(e) => setExchange({ ...exchange, sellAdjust: e.target.value })}
            placeholder="2"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Added to the market rate. Buy under it and sell over it to keep your margin — a
          buy of -2 and a sell of +2 on a market of 130 / 132.7 quotes 128 / 134.7.
        </p>
        {market && exchange.autoRate && (
          <p className="mt-2 text-sm">
            You would quote{" "}
            <b className="tabular-nums">
              {Math.max(0, Number(market.buy) + (Number(exchange.buyAdjust) || 0))} /{" "}
              {Math.max(0, Number(market.sell) + (Number(exchange.sellAdjust) || 0))}
            </b>
          </p>
        )}

        <Button
          className="mt-3"
          disabled={busy}
          onClick={() => save(() => api("/api/v1/settings", {
            method: "PUT",
            body: {
              key: "exchange",
              value: {
                autoRate: exchange.autoRate,
                buyAdjust: Number(exchange.buyAdjust) || 0,
                sellAdjust: Number(exchange.sellAdjust) || 0,
              },
            },
          }))}
        >
          Save exchange settings
        </Button>
      </Card>

      {!playEdition && <Card>
        <h3 className="text-sm font-semibold">Telegram orders &amp; payment methods</h3>
        <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
          Lets customers place bets through your Telegram bot. They send a payment slip, and
          nothing is recorded until you approve it in Telegram. Customers only ever see Myanmar.
        </p>

        <label className="mb-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={customerBetting}
            onChange={(e) => setCustomerBetting(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            Accept bets from customers on Telegram
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Off by default. Needs at least one payment method below.
            </span>
          </span>
        </label>

        <div className="space-y-3">
          {payMethods.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No payment methods yet.</p>
          )}
          {payMethods.map((method, index) => (
            <div key={method.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Type</span>
                  <select
                    value={method.type}
                    onChange={(e) => setPayMethods(payMethods.map((m, i) => i === index ? { ...m, type: e.target.value as PaymentMethod["type"] } : m))}
                    className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  >
                    {PAYMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{PAYMENT_TYPE_LABEL_MY[type]}</option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Account number"
                  value={method.accountNumber}
                  onChange={(e) => setPayMethods(payMethods.map((m, i) => i === index ? { ...m, accountNumber: e.target.value } : m))}
                />
                <Input
                  label="Account name"
                  value={method.accountName}
                  onChange={(e) => setPayMethods(payMethods.map((m, i) => i === index ? { ...m, accountName: e.target.value } : m))}
                />
                <Input
                  label="Note (optional)"
                  value={method.note ?? ""}
                  onChange={(e) => setPayMethods(payMethods.map((m, i) => i === index ? { ...m, note: e.target.value } : m))}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={method.active}
                    onChange={(e) => setPayMethods(payMethods.map((m, i) => i === index ? { ...m, active: e.target.checked } : m))}
                    className="h-4 w-4"
                  />
                  Show to customers
                </label>
                <Button variant="secondary" onClick={() => setPayMethods(payMethods.filter((_, i) => i !== index))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setPayMethods([...payMethods, {
              id: `pm-${Date.now()}`, type: "KPAY", accountName: "", accountNumber: "", active: true,
            }])}
          >
            Add payment method
          </Button>
          <Button
            disabled={busy}
            onClick={() => save(() => api("/api/v1/settings", {
              method: "PUT",
              body: { key: "payments", value: { customerBetting, methods: payMethods } },
            }))}
          >
            Save payment settings
          </Button>
        </div>
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

      {me?.user.roleName === "Owner" && (
        <Card className="border-red-300 dark:border-red-900">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete this business</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Erases this business and everything in it — wallets and their history, credits,
            sales, purchases, stock, records, users and audit logs. It happens immediately
            and cannot be undone, and there is no copy afterwards.
          </p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Type <b>{data.business.name}</b> to confirm.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                label="Business name"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={data.business.name}
              />
            </div>
            <Button
              variant="danger"
              disabled={deleting || deleteConfirm.trim().toLowerCase() !== data.business.name.trim().toLowerCase()}
              onClick={deleteBusiness}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
