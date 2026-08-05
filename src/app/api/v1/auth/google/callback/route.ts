import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exchangeCodeForIdentity, googleConfig, GOOGLE_STATE_COOKIE } from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

function backToLogin(reason: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL(`/login?error=${reason}`, base));
  // The attempt is over either way; leaving the state behind only invites replay.
  response.cookies.delete(GOOGLE_STATE_COOKIE);
  return response;
}

export async function GET(req: NextRequest) {
  const config = googleConfig();
  if (!config) return backToLogin("google_unavailable");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return backToLogin("google_cancelled");

  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  // Compared before anything is exchanged: a callback that did not begin at our start
  // route is not one we act on.
  if (!code || !state || !expected || state !== expected) {
    return backToLogin("google_state");
  }

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  let identity;
  try {
    identity = await exchangeCodeForIdentity(config, code);
  } catch (error) {
    console.error("[google auth]", error);
    return backToLogin("google_failed");
  }

  // An unverified address proves nothing about who is signing in.
  if (!identity.emailVerified) return backToLogin("google_unverified");

  const user = await prisma.user.findFirst({
    where: { email: identity.email, deletedAt: null },
  });

  // No account is matched rather than created. An email from Google says who someone is,
  // not that they should reach a shop's money — an admin adds them first.
  if (!user || !user.active) return backToLogin("google_no_account");
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return backToLogin("locked");
  }

  // Signing in another way clears the failure count, exactly as a password login does.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  const { token, expiresAt } = await createSession(user.id, { ip, userAgent });
  await audit(prisma, {
    businessId: user.businessId,
    userId: user.id,
    action: "LOGIN",
    module: "auth",
    ip,
    userAgent,
    after: { method: "google" },
  });

  const response = NextResponse.redirect(new URL("/", process.env.APP_URL));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  response.cookies.delete(GOOGLE_STATE_COOKIE);
  return response;
}
