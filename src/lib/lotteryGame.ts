/** What differs between 2D and 3D, in one place.
 *
 *  Number length was previously hardcoded as "three digits" in six separate call sites.
 *  Keeping the rule here means a 2D session cannot end up accepting a 3D number — or the
 *  reverse — because one of those sites was missed.
 */
export type GameType = "THREE_D" | "TWO_D";

export const GAME_RULES = {
  THREE_D: {
    digits: 3,
    label: "3D",
    defaultOdds: "500",
    /** Thai draws: the 1st and 16th, so a session is created by hand. */
    autoOpen: false,
    sessions: [] as { name: string; drawTime: string; cutoffTime: string }[],
  },
  TWO_D: {
    digits: 2,
    label: "2D",
    defaultOdds: "85",
    /** Two draws every trading day, so sessions are opened automatically. */
    autoOpen: true,
    sessions: [
      { name: "MORNING", drawTime: "12:01", cutoffTime: "11:55" },
      { name: "EVENING", drawTime: "16:30", cutoffTime: "16:25" },
    ],
  },
} as const satisfies Record<GameType, unknown>;

export function isGameType(value: unknown): value is GameType {
  return value === "THREE_D" || value === "TWO_D";
}

export function gameRules(gameType: string) {
  return isGameType(gameType) ? GAME_RULES[gameType] : GAME_RULES.THREE_D;
}

/** True when `n` is a valid bet number for this game — exact digit count, leading zeros
 *  kept, nothing else. "07" is a 2D number; "7" and "007" are not. */
export function isValidNumber(n: string, gameType: string): boolean {
  const { digits } = gameRules(gameType);
  return new RegExp(`^\\d{${digits}}$`).test(String(n ?? "").trim());
}

export function numberRangeLabel(gameType: string): string {
  const { digits } = gameRules(gameType);
  return digits === 2 ? "00–99" : "000–999";
}
