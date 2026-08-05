"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Button, Input, Card } from "@/components/ui";
import { PwaInstall } from "@/components/PwaInstall";
import { LanguageSwitch } from "@/components/LanguageProvider";
import { api } from "@/lib/client";

/** Google sends people back here with a reason when sign-in did not go through. Each one
 *  says what to do next; "no account" is the common one and is not a failure of theirs. */
const SIGN_IN_ERRORS: Record<string, string> = {
  google_no_account:
    "No Wallet Note account uses that Google address. Ask an admin to add it to your user first.",
  google_unverified: "That Google address is not verified. Verify it with Google, then try again.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "That sign-in link expired. Please try again.",
  google_failed: "Google sign-in could not be completed. Please try again.",
  google_unavailable: "Google sign-in is not set up for this site.",
  locked: "Account is locked. Try again shortly.",
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    // Read straight from the URL rather than through useSearchParams, which would make
    // this page dynamic and need a Suspense boundary for one query parameter. Deferred a
    // frame so it is an ordinary update rather than one during mount.
    const frame = window.requestAnimationFrame(() => {
      const reason = new URLSearchParams(window.location.search).get("error");
      if (reason) setError(SIGN_IN_ERRORS[reason] ?? "Sign-in failed. Please try again.");

      // The button appears only where it would work, so nobody taps a dead end.
      api<{ enabled: boolean }>("/api/v1/auth/google/status")
        .then((d) => setGoogleEnabled(d.enabled))
        .catch(() => setGoogleEnabled(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
    <main className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-x-hidden p-4 pt-16">
      <LanguageSwitch className="absolute right-4 top-4" />
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

        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
              <span className="text-xs text-gray-400">or</span>
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            </div>
            {/* A plain link, not fetch: this leaves the site for Google and comes back. */}
            <a
              href="/api/v1/auth/google/start"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
              </svg>
              Continue with Google
            </a>
          </>
        )}
        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          New to Wallet Note?{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/register">
            Create a free account
          </Link>
        </p>
        <div className="mt-3 flex justify-center">
          <PwaInstall />
        </div>
        <div className="mt-4 flex justify-center gap-4 text-xs">
          <Link className="text-gray-500 hover:text-blue-600" href="/privacy">Privacy</Link>
          <Link className="text-gray-500 hover:text-red-600" href="/account-deletion">Delete account</Link>
        </div>
      </Card>
    </main>
  );
}
