/** Signing in with Google.
 *
 *  Uses the authorization-code flow: the browser only ever carries a one-time code, and
 *  the exchange for an identity happens server to server with the client secret. The
 *  identity is then read from Google's userinfo endpoint over that same channel rather
 *  than by parsing a token the browser handed us — nothing a caller controls is trusted.
 *
 *  This signs a person in to an account that already exists. It does not create users or
 *  businesses: an email address arriving from Google says who someone is, not that they
 *  should have access to a shop's money.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_STATE_COOKIE = "wn_oauth_state";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Null when the deployment has not been given credentials, which is how the sign-in
 *  button knows to stay hidden rather than offering something that cannot work. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!clientId || !clientSecret || !appUrl) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/+$/, "")}/api/v1/auth/google/callback`,
  };
}

export function googleAuthUrl(config: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    // Google remembers the last account; this makes switching possible on a shared device.
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Trade the one-time code for the signed-in person's details. */
export async function exchangeCodeForIdentity(
  config: GoogleConfig,
  code: string
): Promise<GoogleIdentity> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed (${tokenResponse.status})`);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Google returned no access token");

  const userResponse = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) {
    throw new Error(`Google userinfo failed (${userResponse.status})`);
  }
  const profile = (await userResponse.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profile.email) throw new Error("Google returned no email address");

  return {
    email: profile.email.toLowerCase(),
    // Google sends this as a boolean, but a string has been seen from some tenants.
    emailVerified: profile.email_verified === true || String(profile.email_verified) === "true",
    name: profile.name,
  };
}
