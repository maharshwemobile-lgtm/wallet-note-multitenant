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
    /** Thai draws twice a month, so a session is still opened by hand — but on a date
     *  nobody should have to look up. Confirmed by the official results, which land on
     *  the 1st and the 16th. */
    autoOpen: false,
    drawDays: [1, 16] as number[],
    sessions: [
      { name: "Official", drawTime: "16:00", cutoffTime: "15:30" },
    ],
  },
  TWO_D: {
    digits: 2,
    label: "2D",
    defaultOdds: "85",
    /** Two draws every trading day, so sessions are opened automatically. */
    autoOpen: true,
    drawDays: [] as number[],
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

/** The draw and cut-off times a named session runs to, or null if the game has no fixed
 *  schedule. 2D draws at the same two times every trading day, so nobody should have to
 *  type them — and a typo in the cut-off would let bets in after the number is known. */
export function sessionSchedule(
  gameType: string,
  name: string
): { drawTime: string; cutoffTime: string } | null {
  // Compared case-insensitively on both sides: 2D names are stored upper case and 3D's
  // is not, and a session typed as "official" means the same draw either way.
  const wanted = String(name ?? "").trim().toUpperCase();
  const match = gameRules(gameType).sessions.find(
    (session) => session.name.toUpperCase() === wanted
  );
  return match ? { drawTime: match.drawTime, cutoffTime: match.cutoffTime } : null;
}

/** The next date this game actually draws, on or after `from` (YYYY-MM-DD).
 *
 *  3D draws on the 1st and the 16th, so picking a session date by hand invites an
 *  off-by-a-fortnight. 2D draws every trading day, so today is always the answer.
 */
export function nextDrawDate(gameType: string, from: string): string {
  const days = gameRules(gameType).drawDays;
  if (days.length === 0) return from;

  const start = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return from;

  // At most a month ahead: the widest gap between draw days is shorter than that.
  for (let step = 0; step <= 32; step += 1) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + step);
    if (days.includes(day.getUTCDate())) return day.toISOString().slice(0, 10);
  }
  return from;
}

export function numberRangeLabel(gameType: string): string {
  const { digits } = gameRules(gameType);
  return digits === 2 ? "00–99" : "000–999";
}
