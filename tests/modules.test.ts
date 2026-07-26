import { describe, expect, it } from "vitest";
import {
  BUSINESS_CATEGORIES,
  categoryPreset,
  defaultFeaturesForMode,
  moduleSetting,
  moduleSettingForCategory,
  moduleSettingFromFeatures,
  parseModuleAccess,
} from "../src/lib/modules";

describe("module access", () => {
  it("supports all three workspace modes", () => {
    expect(parseModuleAccess(moduleSetting("WALLET_ONLY"))).toMatchObject({
      mode: "WALLET_ONLY",
      miniMartEnabled: false,
      walletNoteEnabled: true,
    });
    expect(parseModuleAccess(moduleSetting("MINI_MART_ONLY"))).toMatchObject({
      mode: "MINI_MART_ONLY",
      miniMartEnabled: true,
      walletNoteEnabled: false,
    });
    expect(parseModuleAccess(moduleSetting("BOTH"))).toMatchObject({
      mode: "BOTH",
      miniMartEnabled: true,
      walletNoteEnabled: true,
    });
  });

  it("keeps legacy Mini Mart settings compatible", () => {
    expect(parseModuleAccess({ miniMartEnabled: true }).mode).toBe("BOTH");
    expect(parseModuleAccess({ miniMartEnabled: false }).mode).toBe("WALLET_ONLY");
  });

  it("defaults invalid settings to Wallet Note only", () => {
    expect(parseModuleAccess(null).mode).toBe("WALLET_ONLY");
    expect(parseModuleAccess({ mode: "UNKNOWN" }).mode).toBe("WALLET_ONLY");
  });

  it("uses focused feature presets for every registration category", () => {
    const personal = parseModuleAccess(moduleSettingForCategory("PERSONAL"));
    expect(personal.features.transfers).toBe(true);
    expect(personal.features.pos).toBe(false);
    expect(personal.features.threeD).toBe(false);

    const miniMart = parseModuleAccess(moduleSettingForCategory("MINI_MART"));
    expect(miniMart.features.pos).toBe(true);
    expect(miniMart.features.stock).toBe(true);
    expect(miniMart.features.exchange).toBe(false);
    expect(miniMart.features.threeD).toBe(false);

    const threeD = parseModuleAccess(moduleSettingForCategory("THREE_D"));
    expect(threeD.features.threeD).toBe(true);
    expect(threeD.features.pos).toBe(false);

    const moneyService = parseModuleAccess(moduleSettingForCategory("MONEY_SERVICE"));
    expect(moneyService.features.exchange).toBe(true);
    expect(moneyService.features.transfers).toBe(true);
    expect(moneyService.features.threeD).toBe(false);

    const allInOne = parseModuleAccess(moduleSettingForCategory("ALL_IN_ONE"));
    expect(Object.values(allInOne.features).every(Boolean)).toBe(true);
    expect(BUSINESS_CATEGORIES).toHaveLength(5);
  });

  it("recomputes workspace mode from individual feature switches", () => {
    const features = defaultFeaturesForMode("WALLET_ONLY");
    features.pos = true;
    features.exchange = false;
    const parsed = parseModuleAccess(moduleSettingFromFeatures(features));

    expect(parsed.mode).toBe("BOTH");
    expect(parsed.features.pos).toBe(true);
    expect(parsed.features.exchange).toBe(false);
    expect(parsed.category).toBe("CUSTOM");
  });

  it("fills missing feature flags with backward-compatible defaults", () => {
    const parsed = parseModuleAccess({
      mode: "WALLET_ONLY",
      features: { transfers: false },
    });
    expect(parsed.features.transfers).toBe(false);
    expect(parsed.features.wallets).toBe(true);
    expect(parsed.features.pos).toBe(false);
    expect(categoryPreset("ALL_IN_ONE").about).toBe(true);
  });
});
