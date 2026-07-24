import { describe, expect, it } from "vitest";
import { moduleSetting, parseModuleAccess } from "../src/lib/modules";

describe("module access", () => {
  it("supports all three workspace modes", () => {
    expect(parseModuleAccess(moduleSetting("WALLET_ONLY"))).toEqual({
      mode: "WALLET_ONLY",
      miniMartEnabled: false,
      walletNoteEnabled: true,
    });
    expect(parseModuleAccess(moduleSetting("MINI_MART_ONLY"))).toEqual({
      mode: "MINI_MART_ONLY",
      miniMartEnabled: true,
      walletNoteEnabled: false,
    });
    expect(parseModuleAccess(moduleSetting("BOTH"))).toEqual({
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
});
