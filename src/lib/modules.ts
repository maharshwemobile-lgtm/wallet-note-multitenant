export const MODULE_MODES = ["WALLET_ONLY", "MINI_MART_ONLY", "BOTH"] as const;

export type ModuleMode = (typeof MODULE_MODES)[number];

export interface ModuleAccess {
  mode: ModuleMode;
  miniMartEnabled: boolean;
  walletNoteEnabled: boolean;
}

export function parseModuleAccess(value: unknown): ModuleAccess {
  const setting = value && typeof value === "object"
    ? value as { mode?: unknown; miniMartEnabled?: unknown }
    : {};
  const mode = MODULE_MODES.includes(setting.mode as ModuleMode)
    ? setting.mode as ModuleMode
    : setting.miniMartEnabled === true
      ? "BOTH"
      : "WALLET_ONLY";

  return {
    mode,
    miniMartEnabled: mode !== "WALLET_ONLY",
    walletNoteEnabled: mode !== "MINI_MART_ONLY",
  };
}

export function moduleSetting(mode: ModuleMode) {
  return {
    mode,
    miniMartEnabled: mode !== "WALLET_ONLY",
  };
}
