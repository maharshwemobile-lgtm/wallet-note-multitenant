"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Wallet } from "lucide-react";
import { Button, Card, Input, Modal, Select } from "@/components/ui";
import { PwaInstall } from "@/components/PwaInstall";
import { LanguageSwitch } from "@/components/LanguageProvider";
import { api } from "@/lib/client";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    username: "",
    email: "",
    phone: "",
    currency: "MMK",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModuleChoice, setShowModuleChoice] = useState(false);

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setShowModuleChoice(true);
  }

  async function register(miniMartEnabled: boolean) {
    setShowModuleChoice(false);
    setLoading(true);
    try {
      await api("/api/v1/auth/register", {
        method: "POST",
        body: {
          businessName: form.businessName,
          ownerName: form.ownerName,
          username: form.username,
          email: form.email,
          phone: form.phone || undefined,
          currency: form.currency,
          timezone: "Asia/Yangon",
          password: form.password,
          miniMartEnabled,
        },
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-x-hidden p-4 pb-8 pt-20">
      <LanguageSwitch className="absolute right-4 top-4" />
      <Card className="w-full max-w-xl">
        <div className="mb-6 flex flex-col items-center gap-2 pt-2">
          <div className="rounded-xl bg-blue-600 p-3 text-white">
            <Wallet size={28} />
          </div>
          <h1 className="text-xl font-bold">Create your Wallet Note</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Free private workspace for your business</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Business name"
            value={form.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            autoFocus
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Your name"
              value={form.ownerName}
              onChange={(event) => update("ownerName", event.target.value)}
              autoComplete="name"
              required
            />
            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              autoComplete="tel"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Username"
              value={form.username}
              onChange={(event) => update("username", event.target.value.toLowerCase())}
              autoComplete="username"
              required
            />
            <Select
              label="Main currency"
              value={form.currency}
              onChange={(event) => update("currency", event.target.value)}
            >
              <option value="MMK">MMK</option>
              <option value="THB">THB</option>
            </Select>
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            autoComplete="email"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <Input
              label="Confirm password"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => update("confirmPassword", event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Use at least 8 characters.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            disabled={loading || !form.businessName || !form.ownerName || !form.username || !form.email || !form.password}
            className="w-full"
          >
            {loading ? "Creating account..." : "Create free account"}
          </Button>
        </form>

        <Modal open={showModuleChoice} onClose={() => setShowModuleChoice(false)} title="Enable Mini Mart functions?">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <ShoppingCart size={20} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Turn this on for items, stock, purchases, suppliers, and Sales &amp; POS.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" disabled={loading} onClick={() => register(false)}>
                Wallet Note only
              </Button>
              <Button disabled={loading} onClick={() => register(true)}>
                Enable Mini Mart
              </Button>
            </div>
          </div>
        </Modal>

        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/login">
            Sign in
          </Link>
        </p>
        <div className="mt-3 flex justify-center">
          <PwaInstall />
        </div>
      </Card>
    </main>
  );
}
