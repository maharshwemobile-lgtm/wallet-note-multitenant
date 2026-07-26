import { prisma } from "./prisma";
import { sendMessage, withBotToken } from "./telegram";

// Live audit feed over Telegram: after a Sale / 3D / Transfer / Withdraw /
// Income & Expense / Exchange transaction is committed, push a short summary
// to every linked user (within the same business) who can view the audit log.
//
// Fire-and-forget by design: callers should NOT await this — the HTTP
// response (or the bot's own confirmation message) must not wait on Telegram
// delivery. Recipients are messaged in parallel, and every failure is caught
// internally so a bad send can never surface as an unhandled rejection or
// affect the transaction that already committed.
export function notifyAuditFeed(businessId: string, text: string, excludeChatId?: string): void {
  run(businessId, text, excludeChatId).catch((e) => console.error("[telegram notify] failed:", e));
}

async function run(businessId: string, text: string, excludeChatId?: string) {
  const users = await prisma.user.findMany({
    where: { businessId, active: true, deletedAt: null, telegramChatId: { not: null }, telegramBotToken: { not: null } },
    include: { role: true },
  });
  const recipients = users.filter((u) => {
    if (u.telegramChatId === excludeChatId) return false; // already got a direct confirmation
    try {
      const perms: string[] = JSON.parse(u.role.permissions);
      return perms.includes("audit.view");
    } catch (e) {
      // One corrupt Role.permissions row must not silence the feed for everyone else.
      console.error(`[telegram notify] bad permissions JSON for role ${u.roleId}:`, e);
      return false;
    }
  });
  // Each recipient reads this over their OWN bot, so each send runs with that
  // recipient's own token as the active Telegram client.
  await Promise.all(
    recipients.map((u) => withBotToken(u.telegramBotToken!, () => sendMessage(u.telegramChatId!, text)))
  );
}

function money(minor: bigint | string, currency = "MMK") {
  const v = typeof minor === "string" ? BigInt(minor) : minor;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = abs % 100n;
  const s = frac === 0n ? whole : `${whole}.${frac.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${s} ${currency}`;
}

export function saleNotice(opts: { txnNo: string; total: bigint; profit: bigint; createdByName: string }) {
  return `🧾 Sale ${opts.txnNo}\nBy: ${opts.createdByName} · Total: ${money(opts.total)} · Profit: ${money(opts.profit)}`;
}

export function threeDNotice(opts: { count: number; total: bigint; sessionName: string; createdByName: string }) {
  return `🔢 3D — ${opts.count} record(s), ${money(opts.total)}\nSession: ${opts.sessionName} · By: ${opts.createdByName}`;
}

export function transferNotice(opts: { txnNo: string; sourceName: string; destName: string; sourceAmount: bigint; sourceCurrency: string; destAmount: bigint; destCurrency: string; createdByName: string }) {
  const amount = opts.sourceCurrency === opts.destCurrency
    ? money(opts.sourceAmount, opts.sourceCurrency)
    : `${money(opts.sourceAmount, opts.sourceCurrency)} → ${money(opts.destAmount, opts.destCurrency)}`;
  return `🔁 Transfer ${opts.txnNo}\n${opts.sourceName} → ${opts.destName} · ${amount}\nBy: ${opts.createdByName}`;
}

export function incomeExpenseNotice(opts: { txnNo: string; type: string; categoryName: string; amount: bigint; currency: string; createdByName: string }) {
  const icon = opts.type === "INCOME" ? "💰" : opts.type === "WITHDRAW" ? "➖" : "💸";
  const label = opts.type === "INCOME" ? "Income" : opts.type === "WITHDRAW" ? "Withdraw" : "Expense";
  return `${icon} ${label} ${opts.txnNo}\n${opts.categoryName} · ${money(opts.amount, opts.currency)}\nBy: ${opts.createdByName}`;
}

export function exchangeNotice(opts: { txnNo: string; type: string; fromAmount: bigint; fromCurrency: string; toAmount: bigint; toCurrency: string; createdByName: string }) {
  const label = opts.type === "BUY_THB" ? "Buy THB" : opts.type === "SELL_THB" ? "Sell THB" : "Convert";
  return `💱 Exchange ${opts.txnNo} — ${label}\n${money(opts.fromAmount, opts.fromCurrency)} → ${money(opts.toAmount, opts.toCurrency)}\nBy: ${opts.createdByName}`;
}
