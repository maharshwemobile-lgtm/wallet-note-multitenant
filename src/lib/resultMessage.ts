/** What a customer is told when a number comes out.
 *
 *  Myanmar only, like the rest of the customer side. Kept apart from the sending so the
 *  wording can be tested without a bot token — it goes to every customer a shop has, and
 *  a mistake in it is a mistake everyone reads.
 */

export interface ResultAnnouncement {
  gameType: string;
  /** MORNING / EVENING for 2D; the draw's own name for 3D. */
  sessionName: string;
  drawDate: string;
  resultNumber: string;
  /** 2D carries the figures the number is derived from; a shop's customers ask for them. */
  setValue?: string | null;
  value?: string | null;
}

const SESSION_MY: Record<string, string> = {
  MORNING: "မနက်ပိုင်း",
  EVENING: "ညနေပိုင်း",
};

/** 2026-08-14 as a customer reads it. */
export function formatDrawDate(drawDate: string): string {
  const match = drawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return drawDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function sessionLabel(sessionName: string): string {
  return SESSION_MY[sessionName.toUpperCase()] ?? sessionName;
}

export function resultMessage(result: ResultAnnouncement): string {
  const game = result.gameType === "TWO_D" ? "2D" : "3D";
  const lines = [`🔔 ${game} ရလဒ် ထွက်ပါပြီ`, ""];

  // 3D has one draw a fortnight and no session to speak of, so naming one reads as noise.
  if (result.gameType === "TWO_D") {
    lines.push(`${sessionLabel(result.sessionName)} — ${formatDrawDate(result.drawDate)}`);
  } else {
    lines.push(formatDrawDate(result.drawDate));
  }

  lines.push("", `🎯  ${result.resultNumber}`);

  if (result.setValue || result.value) {
    lines.push("");
    if (result.setValue) lines.push(`SET — ${result.setValue}`);
    if (result.value) lines.push(`VALUE — ${result.value}`);
  }

  return lines.join("\n");
}
