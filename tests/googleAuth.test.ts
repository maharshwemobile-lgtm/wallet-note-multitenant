import { afterEach, describe, expect, it } from "vitest";
import { googleAuthUrl, googleConfig } from "@/lib/googleAuth";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function configure(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("google config", () => {
  it("is off unless every piece is present", () => {
    // A half-configured deployment must not offer the button: the redirect URI is built
    // from APP_URL, and a wrong one fails at Google with nothing useful shown.
    const complete = {
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      APP_URL: "https://walletnote.example",
    };
    for (const missing of Object.keys(complete)) {
      configure({ ...complete, [missing]: undefined });
      expect(googleConfig(), `missing ${missing}`).toBeNull();
    }
    configure(complete);
    expect(googleConfig()).not.toBeNull();
  });

  it("treats blank settings as absent", () => {
    configure({ GOOGLE_CLIENT_ID: "  ", GOOGLE_CLIENT_SECRET: "s", APP_URL: "https://x.example" });
    expect(googleConfig()).toBeNull();
  });

  it("builds the callback under the app's own address", () => {
    configure({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      APP_URL: "https://walletnote.example/",
    });
    // The trailing slash is the shape people actually paste into an env file.
    expect(googleConfig()?.redirectUri).toBe(
      "https://walletnote.example/api/v1/auth/google/callback"
    );
  });
});

describe("google authorisation url", () => {
  const config = {
    clientId: "the-client",
    clientSecret: "the-secret",
    redirectUri: "https://walletnote.example/api/v1/auth/google/callback",
  };

  it("asks only for who the person is", () => {
    const url = new URL(googleAuthUrl(config, "state-123"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("carries the state, which is what makes the callback verifiable", () => {
    const url = new URL(googleAuthUrl(config, "state-123"));
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("never puts the secret in a browser-visible url", () => {
    const url = googleAuthUrl(config, "state-123");
    expect(url).not.toContain(config.clientSecret);
  });

  it("lets someone pick an account on a shared device", () => {
    const url = new URL(googleAuthUrl(config, "s"));
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });
});
