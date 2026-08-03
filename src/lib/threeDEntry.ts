import { gameRules } from "./lotteryGame";

/** Typing "123" and having "=" appear saves a keystroke per line. The digit count comes
 *  from the game, or a 2D line would only complete after a third digit that never comes. */
export function autoInsertThreeDEquals(value: string, gameType: string = "THREE_D"): string {
  const { digits } = gameRules(gameType);
  const complete = new RegExp(`^\\d{${digits}}$`);
  return value
    .split("\n")
    .map((line) => (complete.test(line) ? `${line}=` : line))
    .join("\n");
}
