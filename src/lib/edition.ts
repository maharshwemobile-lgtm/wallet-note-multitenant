export type AppEdition = "FULL" | "PLAY";

export function appEdition(): AppEdition {
  return process.env.APP_EDITION === "PLAY" ? "PLAY" : "FULL";
}

export function isPlayEdition(): boolean {
  return appEdition() === "PLAY";
}

// 2D is part of the same lottery area — it shares the sessions table, the sync route and
// the three_d permissions — so the PLAY edition has to recognise its paths too, or the 2D
// page would be reachable in an edition that hides 3D.
export function isThreeDPath(pathname: string): boolean {
  return pathname === "/three-d" ||
    pathname.startsWith("/three-d/") ||
    pathname === "/two-d" ||
    pathname.startsWith("/two-d/") ||
    pathname === "/api/v1/three-d" ||
    pathname.startsWith("/api/v1/three-d/") ||
    pathname.startsWith("/api/v1/two-d/") ||
    pathname === "/api/internal/three-d-sync";
}
