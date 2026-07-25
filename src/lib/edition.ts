export type AppEdition = "FULL" | "PLAY";

export function appEdition(): AppEdition {
  return process.env.APP_EDITION === "PLAY" ? "PLAY" : "FULL";
}

export function isPlayEdition(): boolean {
  return appEdition() === "PLAY";
}

export function isThreeDPath(pathname: string): boolean {
  return pathname === "/three-d" ||
    pathname.startsWith("/three-d/") ||
    pathname === "/api/v1/three-d" ||
    pathname.startsWith("/api/v1/three-d/") ||
    pathname === "/api/internal/three-d-sync";
}
