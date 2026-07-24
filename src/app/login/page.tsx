"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Button, Input, Card } from "@/components/ui";
import { PwaInstall } from "@/components/PwaInstall";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/v1/auth/login", { method: "POST", body: { username, password } });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 pt-2">
          <div className="rounded-2xl bg-blue-600 p-3 text-white">
            <Wallet size={28} />
          </div>
          <h1 className="text-xl font-bold">Wallet Note</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sign in to your account</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Username or email" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading || !username || !password} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          New to Wallet Note?{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/register">
            Create a free account
          </Link>
        </p>
        <div className="mt-3 flex justify-center">
          <PwaInstall />
        </div>
      </Card>
    </main>
  );
}
