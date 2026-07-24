"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
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

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

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
    <main className="flex flex-1 items-center justify-center p-4 py-8">
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

        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/login">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
