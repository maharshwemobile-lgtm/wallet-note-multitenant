import { afterEach, describe, expect, it, vi } from "vitest";
import { appEdition, isPlayEdition, isThreeDPath } from "../src/lib/edition";

describe("application editions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the full edition", () => {
    vi.stubEnv("APP_EDITION", "");
    expect(appEdition()).toBe("FULL");
    expect(isPlayEdition()).toBe(false);
  });

  it("recognizes the Play Store edition", () => {
    vi.stubEnv("APP_EDITION", "PLAY");
    expect(appEdition()).toBe("PLAY");
    expect(isPlayEdition()).toBe(true);
  });

  it("identifies every explicit 3D route boundary", () => {
    expect(isThreeDPath("/three-d")).toBe(true);
    expect(isThreeDPath("/three-d/session-id")).toBe(true);
    expect(isThreeDPath("/api/v1/three-d/sessions")).toBe(true);
    expect(isThreeDPath("/api/internal/three-d-sync")).toBe(true);
    expect(isThreeDPath("/wallets")).toBe(false);
    expect(isThreeDPath("/api/v1/wallets")).toBe(false);
  });
});
