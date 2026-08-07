import { prisma } from "./prisma";
import {
  approveOrder,
  customerCancel,
  customerChooseSession,
  customerConfirm,
  customerClearStep,
  customerGetStep,
  customerNumbers,
  customerSetStep,
  customerAbout,
  MENU_ABOUT,
  MENU_EXCHANGE,
  MENU_BET,
  MENU_HISTORY,
  customerOrders,
  customerSessionPicked,
  customerSlip,
  customerStart,
  rejectOrder,
  resolveCustomer,
} from "./telegramCustomerBot";
import {
  approveExchangeOrder,
  askAmount,
  askPayMethod,
  askReceiveMethod,
  createExchangeOrder,
  currentRate,
  methodLabel,
  notifyStaffOfExchange,
  quote,
  quoteText,
  rejectExchangeOrder,
  showRates,
} from "./telegramExchange";
import { branchScope } from "./auth";
import type { AuthUser } from "./auth";
import { toMinor, isValidDecimalString } from "./money";
import { gameRules, isValidNumber, numberRangeLabel } from "./lotteryGame";
import { fmtMoney } from "./format";
import { todayBusinessDate } from "./dates";
import { createIncomeExpenseEntry } from "@/services/incomeExpenseService";
import { createTransfer } from "@/services/walletService";
import { createExchange } from "@/services/exchangeService";
import { createThreeDBets, parseBulkLines } from "@/services/threeDService";
import { collectReceivable, payPayable, createReceivable } from "@/services/creditService";
import { ApiError } from "./api";
import {
  notifyAuditFeed, incomeExpenseNotice, transferNotice, exchangeNotice, threeDNotice, creditPayableNotice, newCreditNotice,
} from "./telegramNotify";
import {
  sendMessage, answerCallbackQuery,
  keyboard, btn, TgUpdate,
} from "./telegram";
import { parseModuleAccess, type FeatureKey, type FeatureVisibility } from "./modules";

// ---------------------------------------------------------------------------
// Session state: one row per (owner user, chat), tracking the guided-entry
// flow currently in progress (if any). "step" encodes "<flow>.<stage>".
// Keyed by owner user too: a Telegram private chat's id is the account's own
// id, so in principle the same person could message two different users'
// bots — each gets its own session.
// ---------------------------------------------------------------------------

async function getSession(ownerUserId: string, chatId: string) {
  const row = await prisma.telegramSession.findUnique({ where: { ownerUserId_chatId: { ownerUserId, chatId } } });
  if (!row) return null;
  return { step: row.step, data: JSON.parse(row.data) as Record<string, unknown> };
}

async function setSession(ownerUserId: string, chatId: string, step: string, data: Record<string, unknown>) {
  await prisma.telegramSession.upsert({
    where: { ownerUserId_chatId: { ownerUserId, chatId } },
    create: { ownerUserId, chatId, step, data: JSON.stringify(data) },
    update: { step, data: JSON.stringify(data) },
  });
}

async function clearSession(ownerUserId: string, chatId: string) {
  await prisma.telegramSession.deleteMany({ where: { ownerUserId, chatId } });
}

// ---------------------------------------------------------------------------
// Account resolution: each webhook URL belongs to exactly one Wallet Note
// user (their own bot). The first chat to ever message that bot auto-binds
// as telegramChatId; anyone else gets turned away.
// ---------------------------------------------------------------------------

type ResolveResult =
  | { kind: "ok"; user: AuthUser; justLinked: boolean }
  | { kind: "not_found" }
  | { kind: "chat_mismatch" };

async function resolveOwner(ownerUserId: string, chatId: string): Promise<ResolveResult> {
  const row = await prisma.user.findUnique({
    where: { id: ownerUserId },
    include: { role: true, branches: true },
  });
  if (!row || !row.active || row.deletedAt) return { kind: "not_found" };

  let justLinked = false;
  if (!row.telegramChatId) {
    await prisma.user.update({ where: { id: ownerUserId }, data: { telegramChatId: chatId } });
    justLinked = true;
  } else if (row.telegramChatId !== chatId) {
    return { kind: "chat_mismatch" };
  }

  let permissions: string[];
  try {
    permissions = JSON.parse(row.role.permissions) as string[];
  } catch (e) {
    console.error(`[telegram] bad permissions JSON for role ${row.roleId}:`, e);
    return { kind: "not_found" };
  }

  return {
    kind: "ok",
    justLinked,
    user: {
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      username: row.username,
      roleName: row.role.name,
      permissions,
      allBranches: row.allBranches,
      branchIds: row.branches.map((b) => b.branchId),
      commissionRate: row.commissionRate,
    },
  };
}

async function defaultBranchId(user: AuthUser): Promise<string | null> {
  const branch = await prisma.branch.findFirst({
    where: { businessId: user.businessId, active: true, ...branchScope(user) },
    orderBy: { createdAt: "asc" },
  });
  return branch?.id ?? null;
}

function can(user: AuthUser, perm: string): boolean {
  return user.permissions.includes(perm);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

async function businessFeatures(businessId: string): Promise<FeatureVisibility> {
  const setting = await prisma.systemSetting.findUnique({
    where: { businessId_key: { businessId, key: "modules" } },
    select: { value: true },
  });
  if (!setting) return parseModuleAccess({ miniMartEnabled: true }).features;
  try {
    return parseModuleAccess(JSON.parse(setting.value)).features;
  } catch {
    return parseModuleAccess({ miniMartEnabled: true }).features;
  }
}

function mainMenu(user: AuthUser, features: FeatureVisibility) {
  const row1 = [];
  if (features.threeD && can(user, "three_d.create")) row1.push(btn("🔢 3D", "menu:3d"));
  if (features.incomeExpense && can(user, "income_expense.create")) row1.push(btn("💰 Income", "menu:income"));
  if (features.incomeExpense && can(user, "income_expense.create")) row1.push(btn("💸 Expense", "menu:expense"));
  const row2 = [];
  if (features.transfers && can(user, "wallet.transfer")) row2.push(btn("🔁 Transfer", "menu:transfer"));
  if (features.withdraw && can(user, "wallet.withdraw")) row2.push(btn("➖ Withdraw", "menu:withdraw"));
  if (features.exchange && can(user, "exchange.create")) row2.push(btn("💱 Exchange", "menu:exchange"));
  const row3 = [];
  if (features.credit && can(user, "credit.create")) row3.push(btn("🆕 New credit", "menu:newcredit"));
  if (features.credit && can(user, "credit.collect")) row3.push(btn("🤝 Collect credit", "menu:credit"));
  if (features.credit && can(user, "payable.pay")) row3.push(btn("📤 Pay payable", "menu:payable"));
  const rows = [row1, row2, row3].filter((r) => r.length > 0);
  return keyboard(rows);
}

async function showMenu(chatId: string, user: AuthUser, greeting?: string) {
  await clearSession(user.id, chatId);
  const features = await businessFeatures(user.businessId);
  const text = greeting ?? `Quick start — ${user.name} (${user.roleName})\nPick what you want to record:`;
  await sendMessage(chatId, text, { replyMarkup: mainMenu(user, features) });
}

const CANCEL_ROW = [btn("✕ Cancel", "cancel")];
const SKIP_ROW = [btn("Skip →", "skip")];

function money(n: string): string {
  return fmtMoney(toMinor(n).toString());
}

// ---------------------------------------------------------------------------
// Shared: wallet picker
// ---------------------------------------------------------------------------

async function walletButtons(businessId: string, branchId: string, currency?: string, walletType?: string) {
  const base = {
    businessId, active: true, deletedAt: null,
    OR: [{ branchId }, { branchId: null }],
    ...(currency ? { currency } : {}),
  };
  let wallets = await prisma.wallet.findMany({ where: { ...base, ...(walletType ? { type: walletType } : {}) }, orderBy: { name: "asc" } });
  if (walletType && wallets.length === 0) {
    // Fall back to any wallet if the business has no wallet of the preferred type yet.
    wallets = await prisma.wallet.findMany({ where: base, orderBy: { name: "asc" } });
  }
  return { wallets, rows: wallets.map((w) => [btn(`${w.name} (${fmtMoney(w.currentBalance)} ${w.currency})`, `w:${w.id}`)]) };
}

// ---------------------------------------------------------------------------
// Income / Expense / Withdraw flow — shares one implementation; WITHDRAW
// skips the category step.
// ---------------------------------------------------------------------------

async function startIncomeExpense(chatId: string, user: AuthUser, type: "INCOME" | "EXPENSE" | "WITHDRAW") {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "No branch is available for your account. Contact your admin.");
  const { rows } = await walletButtons(user.businessId, branchId, undefined, type === "WITHDRAW" ? "CASH" : undefined);
  if (rows.length === 0) return sendMessage(chatId, "No wallets found. Create one in Wallet Note first.");
  await setSession(user.id, chatId, `ie.wallet`, { type, branchId });
  const label = type === "INCOME" ? "💰 Income" : type === "EXPENSE" ? "💸 Expense" : "➖ Withdraw";
  await sendMessage(chatId, `${label}\n\nWhich wallet?`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function ieStepWallet(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet not found. /menu to start over.");
  const type = data.type as string;
  if (type === "WITHDRAW") {
    await setSession(user.id, chatId, "ie.amount", { ...data, walletId, walletName: wallet.name, currency: wallet.currency });
    return sendMessage(chatId, `Wallet: ${wallet.name}\n\nEnter the amount to withdraw (${wallet.currency}):`, {
      replyMarkup: keyboard([CANCEL_ROW]),
    });
  }
  const categories = await prisma.category.findMany({
    where: { businessId: user.businessId, active: true, type },
    orderBy: { name: "asc" },
  });
  const rows = categories.map((c) => [btn(c.name, `cat:${c.name}`)]);
  rows.push([btn("+ New category", "cat:__new__")]);
  await setSession(user.id, chatId, "ie.category", { ...data, walletId, walletName: wallet.name, currency: wallet.currency });
  await sendMessage(chatId, `Wallet: ${wallet.name}\n\nChoose a category:`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function ieStepCategoryPick(chatId: string, user: AuthUser, data: Record<string, unknown>, catData: string) {
  if (catData === "__new__") {
    await setSession(user.id, chatId, "ie.category_new", data);
    return sendMessage(chatId, "Type the new category name:", { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  await setSession(user.id, chatId, "ie.amount", { ...data, categoryName: catData });
  return sendMessage(chatId, `Category: ${catData}\n\nEnter the amount (${data.currency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function ieStepCategoryNewText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const name = text.trim();
  if (!name) return sendMessage(chatId, "Category name can't be empty. Try again:");
  await prisma.category.upsert({
    where: { businessId_type_name: { businessId: user.businessId, type: data.type as string, name } },
    create: { businessId: user.businessId, type: data.type as string, name },
    update: { active: true },
  });
  await setSession(user.id, chatId, "ie.amount", { ...data, categoryName: name });
  return sendMessage(chatId, `Category: ${name}\n\nEnter the amount (${data.currency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function ieStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "Enter a valid positive amount, e.g. 5000");
  const type = data.type as string;
  const nextData = { ...data, amount: raw };
  if (type === "WITHDRAW") {
    await setSession(user.id, chatId, "ie.description", nextData);
    return sendMessage(chatId, "Reason (or Skip):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
  }
  await setSession(user.id, chatId, "ie.description", nextData);
  return sendMessage(chatId, "Description (or Skip):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

async function ieAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const type = data.type as string;
  const label = type === "INCOME" ? "Income" : type === "EXPENSE" ? "Expense" : "Withdrawal";
  const lines = [
    `Confirm ${label}`,
    `Wallet: ${data.walletName}`,
    data.categoryName ? `Category: ${data.categoryName}` : undefined,
    `Amount: ${money(data.amount as string)} ${data.currency}`,
    data.description ? `Note: ${data.description}` : undefined,
  ].filter(Boolean);
  await setSession(user.id, chatId, "ie.confirm", data);
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ Confirm", "confirm:yes"), btn("✕ Cancel", "confirm:no")]]) });
}

async function ieStepDescriptionText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  await ieAskConfirm(chatId, user, { ...data, description: text.trim() });
}

async function ieStepDescriptionSkip(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  await ieAskConfirm(chatId, user, data);
}

async function ieConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const item = await prisma.$transaction((tx) =>
      createIncomeExpenseEntry(tx, {
        businessId: user.businessId,
        branchId: data.branchId as string,
        userId: user.id,
        type: data.type as "INCOME" | "EXPENSE" | "WITHDRAW",
        categoryName: data.categoryName as string | undefined,
        amount: toMinor(data.amount as string),
        walletId: data.walletId as string,
        date: todayBusinessDate(),
        description: data.description as string | undefined,
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ Saved — ${item.txnNo}`);
    notifyAuditFeed(user.businessId, incomeExpenseNotice({
      txnNo: item.txnNo, type: item.type, categoryName: item.categoryName ?? "—",
      amount: item.amount, currency: item.currency, createdByName: user.name,
      description: item.description,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
  }
}

// ---------------------------------------------------------------------------
// Transfer flow
// ---------------------------------------------------------------------------

async function startTransfer(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "No branch is available for your account.");
  const { rows } = await walletButtons(user.businessId, branchId);
  if (rows.length < 2) return sendMessage(chatId, "You need at least two wallets to transfer between.");
  await setSession(user.id, chatId, "tr.source", { branchId });
  await sendMessage(chatId, "🔁 Transfer\n\nFrom which wallet?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function trStepSource(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet not found.");
  const { rows } = await walletButtons(user.businessId, data.branchId as string);
  // Every wallet button carries a callback; the guard is for the type, since a button may
  // now carry a link instead.
  const filtered = rows.filter(
    (r) => !("callback_data" in r[0] && r[0].callback_data.endsWith(walletId))
  );
  await setSession(user.id, chatId, "tr.dest", { ...data, sourceWalletId: walletId, sourceName: wallet.name, sourceCurrency: wallet.currency });
  await sendMessage(chatId, `From: ${wallet.name}\n\nTo which wallet?`, { replyMarkup: keyboard([...filtered, CANCEL_ROW]) });
}

async function trStepDest(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet not found.");
  await setSession(user.id, chatId, "tr.amount", { ...data, destWalletId: walletId, destName: wallet.name, destCurrency: wallet.currency });
  await sendMessage(chatId, `To: ${wallet.name}\n\nEnter the amount (${data.sourceCurrency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function trStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "Enter a valid positive amount:");
  const nextData = { ...data, amount: raw };
  if (data.sourceCurrency !== data.destCurrency) {
    await setSession(user.id, chatId, "tr.rate", nextData);
    return sendMessage(chatId, `Exchange rate (${data.destCurrency} per 1 ${data.sourceCurrency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  await setSession(user.id, chatId, "tr.fee", nextData);
  return sendMessage(chatId, "Fee, if any (or Skip):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

async function trStepRateText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "Enter a valid rate:");
  await setSession(user.id, chatId, "tr.fee", { ...data, rate: raw });
  return sendMessage(chatId, "Fee, if any (or Skip):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

async function trAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const lines = [
    "Confirm transfer",
    `${data.sourceName} → ${data.destName}`,
    `Amount: ${money(data.amount as string)} ${data.sourceCurrency}`,
    data.rate ? `Rate: ${data.rate}` : undefined,
    `Fee: ${money((data.fee as string) ?? "0")}`,
  ].filter(Boolean);
  await setSession(user.id, chatId, "tr.confirm", data);
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ Confirm", "confirm:yes"), btn("✕ Cancel", "confirm:no")]]) });
}

async function trStepFeeText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw)) return sendMessage(chatId, "Enter a valid fee amount, or Skip:");
  await trAskConfirm(chatId, user, { ...data, fee: raw });
}

async function trStepFeeSkip(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  await trAskConfirm(chatId, user, { ...data, fee: "0" });
}

async function trConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const transfer = await prisma.$transaction((tx) =>
      createTransfer(tx, {
        businessId: user.businessId,
        userId: user.id,
        sourceWalletId: data.sourceWalletId as string,
        destWalletId: data.destWalletId as string,
        amount: data.amount as string,
        rate: data.rate as string | undefined,
        fee: (data.fee as string) ?? "0",
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ Transferred — ${transfer.txnNo}`);
    notifyAuditFeed(user.businessId, transferNotice({
      txnNo: transfer.txnNo,
      sourceName: data.sourceName as string, destName: data.destName as string,
      sourceAmount: transfer.sourceAmount, sourceCurrency: data.sourceCurrency as string,
      destAmount: transfer.destAmount, destCurrency: data.destCurrency as string,
      createdByName: user.name,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
  }
}

// ---------------------------------------------------------------------------
// Exchange flow (Buy/Sell THB against MMK)
// ---------------------------------------------------------------------------

async function startExchange(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "No branch is available for your account.");
  await setSession(user.id, chatId, "ex.type", { branchId });
  await sendMessage(chatId, "💱 Exchange\n\nWhich direction?", {
    replyMarkup: keyboard([[btn("Buy THB (pay MMK)", "type:BUY_THB"), btn("Sell THB (get MMK)", "type:SELL_THB")], CANCEL_ROW]),
  });
}

async function exStepType(chatId: string, user: AuthUser, data: Record<string, unknown>, type: string) {
  const fromCurrency = type === "BUY_THB" ? "MMK" : "THB";
  const toCurrency = type === "BUY_THB" ? "THB" : "MMK";
  const { rows } = await walletButtons(user.businessId, data.branchId as string, fromCurrency);
  if (rows.length === 0) return sendMessage(chatId, `No ${fromCurrency} wallet found.`);
  await setSession(user.id, chatId, "ex.source", { ...data, type, fromCurrency, toCurrency });
  await sendMessage(chatId, `Pay from which ${fromCurrency} wallet?`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function exStepSource(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet not found.");
  const { rows } = await walletButtons(user.businessId, data.branchId as string, data.toCurrency as string);
  if (rows.length === 0) return sendMessage(chatId, `No ${data.toCurrency} wallet found.`);
  await setSession(user.id, chatId, "ex.dest", { ...data, sourceWalletId: walletId, sourceName: wallet.name });
  await sendMessage(chatId, `Receive into which ${data.toCurrency} wallet?`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function exStepDest(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet not found.");
  await setSession(user.id, chatId, "ex.amount", { ...data, destWalletId: walletId, destName: wallet.name });
  await sendMessage(chatId, `Amount to pay (${data.fromCurrency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function exStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "Enter a valid positive amount:");
  const board = await prisma.exchangeRate.findFirst({
    where: { businessId: user.businessId, pair: "THB/MMK", active: true },
    orderBy: { effectiveAt: "desc" },
  });
  const suggested = board ? (data.type === "BUY_THB" ? board.buyRate : board.sellRate) : undefined;
  await setSession(user.id, chatId, "ex.rate", { ...data, amount: raw });
  const rows = suggested ? [[btn(`Use board rate: ${suggested}`, `rate:${suggested}`)], CANCEL_ROW] : [CANCEL_ROW];
  await sendMessage(chatId, `Rate (${data.toCurrency} per 1 ${data.fromCurrency})?`, { replyMarkup: keyboard(rows) });
}

async function exAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const lines = [
    "Confirm exchange",
    data.type === "BUY_THB" ? "Buy THB" : "Sell THB",
    `${data.sourceName} → ${data.destName}`,
    `Amount: ${money(data.amount as string)} ${data.fromCurrency}`,
    `Rate: ${data.rate}`,
  ];
  await setSession(user.id, chatId, "ex.confirm", data);
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ Confirm", "confirm:yes"), btn("✕ Cancel", "confirm:no")]]) });
}

async function exStepRateText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "Enter a valid rate:");
  await exAskConfirm(chatId, user, { ...data, rate: raw });
}

async function exConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const ex = await prisma.$transaction((tx) =>
      createExchange(tx, {
        businessId: user.businessId,
        branchId: data.branchId as string,
        userId: user.id,
        type: data.type as string,
        fromCurrency: data.fromCurrency as string,
        toCurrency: data.toCurrency as string,
        fromAmount: toMinor(data.amount as string),
        rate: data.rate as string,
        serviceFee: 0n,
        additionalCost: 0n,
        sourceWalletId: data.sourceWalletId as string,
        destWalletId: data.destWalletId as string,
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ Exchange completed — ${ex.txnNo}`);
    notifyAuditFeed(user.businessId, exchangeNotice({
      txnNo: ex.txnNo, type: ex.type,
      fromAmount: ex.fromAmount, fromCurrency: ex.fromCurrency,
      toAmount: ex.toAmount, toCurrency: ex.toCurrency,
      createdByName: user.name,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
  }
}

// ---------------------------------------------------------------------------
// 3D flow
// ---------------------------------------------------------------------------

async function startThreeD(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "No branch is available for your account.");
  // 2D and 3D share this table, so an unfiltered list offers 2D sessions under "3D".
  // Each is shown with its game, or MORNING/EVENING would be ambiguous.
  const allOpen = await prisma.threeDSession.findMany({
    where: { businessId: user.businessId, status: "OPEN" },
    orderBy: { drawDate: "desc" },
    take: 20,
  });
  // Drop draws whose cut-off has gone. In the evening the morning session is still OPEN
  // until the closer runs, and offering it just produces a refusal at save time.
  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { timezone: true },
  });
  const zone = business?.timezone || "Asia/Yangon";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: zone });
  const nowHhMm = new Date().toLocaleTimeString("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const sessions = allOpen
    .filter((s) => s.drawDate > today || !s.cutoffTime || nowHhMm < s.cutoffTime)
    .slice(0, 10);
  if (sessions.length === 0) return sendMessage(chatId, "No session is open for betting right now.");
  const rows = sessions.map((s) => [btn(`${gameRules(s.gameType).label} · ${s.name} (${s.drawDate})`, `s:${s.id}`)]);
  await setSession(user.id, chatId, "3d.session", { branchId });
  await sendMessage(chatId, "🔢 Lottery\n\nWhich session?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function tdStepSession(chatId: string, user: AuthUser, data: Record<string, unknown>, sessionId: string) {
  const session = await prisma.threeDSession.findUnique({ where: { id: sessionId } });
  if (!session) return sendMessage(chatId, "Session not found.");
  // Carried into the next step so the lines are checked against this session's own game.
  await setSession(user.id, chatId, "3d.lines", { ...data, sessionId, sessionName: session.name, gameType: session.gameType });
  const example = gameRules(session.gameType).digits === 2 ? "07=5000\n42=3000" : "123=5000\n456=3000";
  await sendMessage(
    chatId,
    `Session: ${session.name}\n\nSend the numbers, one per line:\n${example}`,
    { replyMarkup: keyboard([CANCEL_ROW]) }
  );
}

async function tdStepLinesText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const gameType = typeof data.gameType === "string" ? data.gameType : "THREE_D";
  const parsed = parseBulkLines(text, gameType);
  if (parsed.errors.length) {
    return sendMessage(chatId, `Invalid lines:\n${parsed.errors.map((e) => `Line ${e.line}: "${e.text}" — ${e.message}`).join("\n")}`);
  }
  if (parsed.rows.length === 0) return sendMessage(chatId, "No valid lines found. Try again, e.g. 123=5000");
  for (const r of parsed.rows) {
    if (!isValidNumber(r.number, gameType))
      return sendMessage(chatId, `"${r.number}" must be a ${gameRules(gameType).label} number (${numberRangeLabel(gameType)}).`);
  }
  const total = parsed.rows.reduce((sum, r) => sum + Number(r.amount.replace(/,/g, "")), 0);
  const lines = [
    `Session: ${data.sessionName}`,
    `${parsed.rows.length} number(s), total ${total.toLocaleString()}`,
    ...parsed.rows.map((r) => `${r.number} = ${r.amount}`),
  ];
  await setSession(user.id, chatId, "3d.confirm", { ...data, rows: parsed.rows });
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ Confirm", "confirm:yes"), btn("✕ Cancel", "confirm:no")]]) });
}

async function tdConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const rows = data.rows as { number: string; amount: string }[];
    const created = await prisma.$transaction((tx) =>
      createThreeDBets(tx, {
        businessId: user.businessId,
        branchId: data.branchId as string,
        userId: user.id,
        sessionId: data.sessionId as string,
        rows,
        commissionRate: user.commissionRate ?? "0",
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ Saved ${created.length} record(s)`);
    const total = created.reduce((sum, t) => sum + t.betAmount, 0n);
    notifyAuditFeed(user.businessId, threeDNotice({
      count: created.length, total, sessionName: data.sessionName as string, createdByName: user.name,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
  }
}

// ---------------------------------------------------------------------------
// Credit / Payable flow — collect a payment against an existing receivable,
// or pay down an existing payable. Shares one implementation; "credit" and
// "payable" only differ in which model/party/service function they touch.
// ---------------------------------------------------------------------------

async function startCreditPayable(chatId: string, user: AuthUser, kind: "credit" | "payable") {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "No branch is available for your account.");

  const outstanding =
    kind === "credit"
      ? await prisma.receivable.findMany({
          where: { businessId: user.businessId, deletedAt: null, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        })
      : await prisma.payable.findMany({
          where: { businessId: user.businessId, deletedAt: null, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
          include: { supplier: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        });
  if (outstanding.length === 0) {
    return sendMessage(chatId, kind === "credit" ? "No outstanding credit to collect." : "No outstanding payables to pay.");
  }

  const rows = outstanding.map((r) => {
    const partyName = kind === "credit"
      ? (r as typeof outstanding[number] & { customer: { name: string } }).customer.name
      : (r as typeof outstanding[number] & { supplier: { name: string } }).supplier.name;
    return [btn(`${partyName} — ${money(r.remainingAmount.toString())} ${r.currency} left`, `r:${r.id}`)];
  });
  await setSession(user.id, chatId, `cp.pick`, { kind, branchId });
  const label = kind === "credit" ? "🤝 Collect credit" : "📤 Pay payable";
  await sendMessage(chatId, `${label}\n\nWhich one?`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function cpStepPick(chatId: string, user: AuthUser, data: Record<string, unknown>, recordId: string) {
  const kind = data.kind as "credit" | "payable";
  const record = kind === "credit"
    ? await prisma.receivable.findUnique({ where: { id: recordId }, include: { customer: { select: { name: true } } } })
    : await prisma.payable.findUnique({ where: { id: recordId }, include: { supplier: { select: { name: true } } } });
  if (!record || record.businessId !== user.businessId) return sendMessage(chatId, "Record not found. /menu to start over.");
  const partyName = kind === "credit"
    ? (record as typeof record & { customer: { name: string } }).customer.name
    : (record as typeof record & { supplier: { name: string } }).supplier.name;

  await setSession(user.id, chatId, "cp.amount", {
    ...data, recordId, partyName, currency: record.currency, remaining: record.remainingAmount.toString(), txnNo: record.txnNo,
  });
  await sendMessage(
    chatId,
    `${partyName} — ${money(record.remainingAmount.toString())} ${record.currency} remaining\n\nHow much ${kind === "credit" ? "was collected" : "are you paying"}?`,
    { replyMarkup: keyboard([CANCEL_ROW]) }
  );
}

async function cpStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "Enter a valid positive amount:");
  if (toMinor(raw) > BigInt(data.remaining as string)) return sendMessage(chatId, `That's more than the ${money(data.remaining as string)} ${data.currency} remaining. Enter a smaller amount:`);
  const { rows } = await walletButtons(user.businessId, data.branchId as string, data.currency as string);
  if (rows.length === 0) return sendMessage(chatId, `No ${data.currency} wallet found.`);
  await setSession(user.id, chatId, "cp.wallet", { ...data, amount: raw });
  await sendMessage(chatId, "Which wallet?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function cpStepWallet(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet not found.");
  const kind = data.kind as "credit" | "payable";
  const lines = [
    `Confirm ${kind === "credit" ? "collection" : "payment"}`,
    `${data.partyName} · ${data.txnNo}`,
    `Amount: ${money(data.amount as string)} ${data.currency}`,
    `Wallet: ${wallet.name}`,
  ];
  await setSession(user.id, chatId, "cp.confirm", { ...data, walletId, walletName: wallet.name });
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ Confirm", "confirm:yes"), btn("✕ Cancel", "confirm:no")]]) });
}

async function cpConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const kind = data.kind as "credit" | "payable";
    const opts = {
      amount: toMinor(data.amount as string),
      walletId: data.walletId as string,
      date: todayBusinessDate(),
      userId: user.id,
      businessId: user.businessId,
    };
    if (kind === "credit") {
      await prisma.$transaction((tx) => collectReceivable(tx, { ...opts, receivableId: data.recordId as string }));
    } else {
      await prisma.$transaction((tx) => payPayable(tx, { ...opts, payableId: data.recordId as string }));
    }
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ Saved — ${data.txnNo}`);
    notifyAuditFeed(user.businessId, creditPayableNotice({
      kind, txnNo: data.txnNo as string, partyName: data.partyName as string,
      amount: opts.amount, currency: data.currency as string, createdByName: user.name,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
  }
}

// ---------------------------------------------------------------------------
// New credit — record a new debt a customer now owes the business (as
// opposed to "Collect credit" above, which settles an existing one).
// ---------------------------------------------------------------------------

async function startNewCredit(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "No branch is available for your account.");
  const customers = await prisma.contact.findMany({
    where: { businessId: user.businessId, type: "CUSTOMER", active: true, deletedAt: null },
    orderBy: { name: "asc" },
    take: 15,
  });
  const rows = customers.map((c) => [btn(c.name, `c:${c.id}`)]);
  rows.push([btn("+ New customer", "c:__new__")]);
  await setSession(user.id, chatId, "nc.customer", { branchId });
  await sendMessage(chatId, "🆕 New credit\n\nWhich customer?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function ncStepCustomerPick(chatId: string, user: AuthUser, data: Record<string, unknown>, customerId: string) {
  if (customerId === "__new__") {
    await setSession(user.id, chatId, "nc.customer_new", data);
    return sendMessage(chatId, "Type the customer's name:", { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  const customer = await prisma.contact.findUnique({ where: { id: customerId } });
  if (!customer || customer.businessId !== user.businessId) return sendMessage(chatId, "Customer not found. /menu to start over.");
  await setSession(user.id, chatId, "nc.amount", { ...data, customerId, customerName: customer.name, currency: customer.currency });
  await sendMessage(chatId, `Customer: ${customer.name}\n\nHow much did they take on credit? (${customer.currency})`, {
    replyMarkup: keyboard([CANCEL_ROW]),
  });
}

async function ncStepCustomerNewText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const name = text.trim();
  if (!name) return sendMessage(chatId, "Name can't be empty. Try again:");
  const customer = await prisma.contact.create({
    data: { businessId: user.businessId, branchId: data.branchId as string, name, type: "CUSTOMER" },
  });
  await setSession(user.id, chatId, "nc.amount", { ...data, customerId: customer.id, customerName: customer.name, currency: customer.currency });
  await sendMessage(chatId, `Customer: ${customer.name}\n\nHow much did they take on credit? (${customer.currency})`, {
    replyMarkup: keyboard([CANCEL_ROW]),
  });
}

async function ncStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "Enter a valid positive amount:");
  await setSession(user.id, chatId, "nc.note", { ...data, amount: raw });
  await sendMessage(chatId, "Note (or Skip):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

/** Ask which wallet the cash was handed out from. Handing out cash is optional —
 *  a credit sale moves goods, not money — so "no wallet" stays a first-class choice. */
async function ncAskWallet(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const { rows } = await walletButtons(user.businessId, data.branchId as string, data.currency as string);
  await setSession(user.id, chatId, "nc.wallet", data);
  await sendMessage(
    chatId,
    "Which wallet did the cash come out of?\n\nPick a wallet only if you actually handed money over — it is deducted straight away. Choose \"No wallet\" for goods sold on credit.",
    { replyMarkup: keyboard([...rows, [btn("⏭ No wallet (goods on credit)", "w:none")], CANCEL_ROW]) }
  );
}

async function ncStepWallet(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  if (walletId === "none") return ncAskConfirm(chatId, user, data);
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet || wallet.businessId !== user.businessId) return sendMessage(chatId, "Wallet not found.");
  await ncAskConfirm(chatId, user, { ...data, walletId, walletName: wallet.name });
}

async function ncAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const lines = [
    "Confirm new credit",
    `Customer: ${data.customerName}`,
    `Amount: ${money(data.amount as string)} ${data.currency}`,
    data.walletName ? `Paid out from: ${data.walletName}` : "Paid out from: — (goods on credit, no cash moved)",
    data.notes ? `Note: ${data.notes}` : undefined,
  ].filter(Boolean);
  await setSession(user.id, chatId, "nc.confirm", data);
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ Confirm", "confirm:yes"), btn("✕ Cancel", "confirm:no")]]) });
}

async function ncStepNoteText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  await ncAskWallet(chatId, user, { ...data, notes: text.trim() });
}

async function ncStepNoteSkip(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  await ncAskWallet(chatId, user, data);
}

async function ncConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const rec = await prisma.$transaction((tx) =>
      createReceivable(tx, {
        businessId: user.businessId,
        branchId: data.branchId as string,
        userId: user.id,
        customerId: data.customerId as string,
        amount: toMinor(data.amount as string),
        currency: data.currency as string,
        creditDate: todayBusinessDate(),
        notes: data.notes as string | undefined,
        walletId: data.walletId as string | undefined,
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ Saved — ${rec.txnNo}`);
    notifyAuditFeed(user.businessId, newCreditNotice({
      txnNo: rec.txnNo, customerName: data.customerName as string,
      amount: rec.originalAmount, currency: rec.currency, createdByName: user.name,
      notes: data.notes as string | undefined,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

const FLOW_REQUIRED_PERM: Record<string, string> = {
  income: "income_expense.create",
  expense: "income_expense.create",
  withdraw: "wallet.withdraw",
  transfer: "wallet.transfer",
  exchange: "exchange.create",
  "3d": "three_d.create",
  credit: "credit.collect",
  payable: "payable.pay",
  newcredit: "credit.create",
};

const FLOW_FEATURE: Record<string, FeatureKey> = {
  income: "incomeExpense",
  expense: "incomeExpense",
  withdraw: "withdraw",
  transfer: "transfers",
  exchange: "exchange",
  "3d": "threeD",
  credit: "credit",
  payable: "credit",
  newcredit: "credit",
};

/** ownerUserId identifies whose bot this webhook belongs to — resolved from
 *  the webhook URL by the caller (one bot = one Wallet Note user). */
export async function handleUpdate(update: TgUpdate, ownerUserId: string) {
  const chatId =
    update.message?.chat.id.toString() ?? update.callback_query?.message?.chat.id.toString();
  if (!chatId) return;

  // A shop's bot answers its own staff member in one chat. Any other chat is a customer,
  // and only ever reaches the customer flow — never a staff menu. The check is on the
  // already-linked chat, so the first-chat-links-the-owner behaviour is untouched: until
  // a staff member has linked, there is no customer side at all.
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { telegramChatId: true, businessId: true },
  });
  if (owner?.telegramChatId && owner.telegramChatId !== chatId) {
    return handleCustomerUpdate(update, ownerUserId, owner.businessId, chatId);
  }

  if (update.message) return handleMessage(ownerUserId, chatId, update.message.text ?? "");
  if (update.callback_query) return handleCallback(ownerUserId, update.callback_query);
}

/** Is this shop letting customers place bets over Telegram? Off unless switched on, so no
 *  existing shop starts taking orders from strangers because of an upgrade. */
async function customerBettingOn(businessId: string): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { businessId_key: { businessId, key: "payments" } },
    select: { value: true },
  });
  if (!setting) return false;
  try {
    const parsed = JSON.parse(setting.value) as { customerBetting?: unknown };
    return parsed.customerBetting === true;
  } catch {
    return false;
  }
}

async function handleCustomerUpdate(
  update: TgUpdate,
  ownerUserId: string,
  businessId: string,
  chatId: string
) {
  if (!(await customerBettingOn(businessId))) {
    // Unchanged message for the case this used to be: someone else's chat.
    return sendMessage(chatId, "This bot is already linked to a different Telegram account. Unlink it in Wallet Note first if this is you.");
  }

  const from = update.message?.from ?? update.callback_query?.from;
  const customer = await resolveCustomer(
    ownerUserId,
    businessId,
    chatId,
    from?.first_name,
    from?.username
  );
  if (customer.blocked) return;

  if (update.callback_query) {
    await answerCallbackQuery(update.callback_query.id);
    const data = update.callback_query.data ?? "";
    if (data === "c:cancel") return customerCancel(customer);
    if (data === "c:bet") return customerChooseSession(customer);
    if (data === "c:orders") return customerOrders(customer);
    if (data === "c:about") return customerAbout(customer);

    // Currency exchange: pick a direction, then how to pay, then where to receive.
    if (data.startsWith("x:d:")) {
      const direction = data.slice(4) === "SELL_THB" ? "SELL_THB" : "BUY_THB";
      await customerSetStep(ownerUserId, chatId, "x.amount", { direction });
      return askAmount(customer, direction);
    }
    if (data.startsWith("x:pay:")) {
      const { step, data: stepData } = await customerGetStep(ownerUserId, chatId);
      if (step !== "x.pay") return customerStart(customer);
      await customerSetStep(ownerUserId, chatId, "x.get", { ...stepData, payMethod: data.slice(6) });
      return askReceiveMethod(customer);
    }
    if (data.startsWith("x:get:")) {
      const { step, data: stepData } = await customerGetStep(ownerUserId, chatId);
      if (step !== "x.get") return customerStart(customer);
      const raw = stepData.quote as Record<string, string>;
      const agreed = {
        type: raw.type as "BUY_THB" | "SELL_THB",
        fromCurrency: raw.fromCurrency as "THB" | "MMK",
        toCurrency: raw.toCurrency as "THB" | "MMK",
        fromAmount: BigInt(raw.fromAmount),
        toAmount: BigInt(raw.toAmount),
        rate: raw.rate,
      };
      // No account number is asked for. The shop has the customer's Telegram and their
      // slip already, and asking someone to type a payment number into a chat is a step
      // they can get wrong for a detail nobody needs typed to settle up.
      const order = await createExchangeOrder(
        customer,
        agreed,
        String(stepData.payMethod ?? ""),
        (await methodLabel(businessId, data.slice(6))) ?? "",
        ""
      );
      await customerSetStep(ownerUserId, chatId, "x.slip", { orderId: order.id });
      return;
    }
    if (data.startsWith("c:s:")) return customerSessionPicked(customer, data.slice(4));
    if (data === "c:ok") {
      const { step, data: stepData } = await customerGetStep(ownerUserId, chatId);
      if (step !== "c.confirm") return customerStart(customer);
      return customerConfirm(customer, stepData);
    }
    return customerStart(customer);
  }

  const message = update.message;
  if (!message) return;

  const text = (message.text ?? "").trim();
  if (text === "/start" || text === "/menu") return customerStart(customer);

  // The menu sits under the text box, so its buttons arrive as ordinary messages. They
  // are handled before the conversation step: someone half-way through typing numbers who
  // taps "my history" means to look at their history, not to bet "🧾".
  if (text === MENU_BET) return customerChooseSession(customer);
  if (text === MENU_HISTORY) return customerOrders(customer);
  if (text === MENU_ABOUT) return customerAbout(customer);
  if (text === MENU_EXCHANGE) return showRates(customer);

  const { step, data: stepData } = await customerGetStep(ownerUserId, chatId);
  if (message.photo?.length || message.document) {
    if (step === "x.slip") {
      const fileId =
        message.photo?.[message.photo.length - 1]?.file_id ?? message.document?.file_id ?? null;
      if (!fileId) return sendMessage(chatId, "ငွေလွှဲပြေစာ ဓာတ်ပုံကို ပို့ပေးပါ။");
      const orderId = String(stepData.orderId ?? "");
      const order = await prisma.exchangeOrder.findUnique({ where: { id: orderId } });
      if (!order || order.status !== "AWAITING_SLIP") {
        await customerClearStep(ownerUserId, chatId);
        return sendMessage(chatId, "အော်ဒါ မတွေ့ပါ။ /start နှိပ်၍ ပြန်စပါ။");
      }
      await prisma.exchangeOrder.update({
        where: { id: order.id },
        data: { status: "REVIEW", slipFileId: fileId },
      });
      await customerClearStep(ownerUserId, chatId);
      await sendMessage(chatId, `✅ ရရှိပါပြီ — ${order.orderNo}

ဆိုင်မှ စစ်ဆေးပြီးပါက အကြောင်းပြန်ပါမည်။`);
      return notifyStaffOfExchange(order.id, fileId);
    }
    if (step !== "c.slip") {
      return sendMessage(chatId, "ပြေစာ ပို့ရန် အချိန် မဟုတ်သေးပါ။ /start နှိပ်၍ စတင်ပါ။");
    }
    return customerSlip(customer, stepData, message);
  }
  if (step === "c.numbers") return customerNumbers(customer, stepData, text);

  if (step === "x.amount") {
    const amount = toMinor(text.replace(/,/g, ""));
    if (amount <= 0n) return sendMessage(chatId, "ပမာဏကို ဂဏန်းဖြင့် ရိုက်ပါ။ ဥပမာ — 10000");
    const rate = await currentRate(businessId);
    if (!rate) return sendMessage(chatId, "ငွေလဲနှုန်း မသတ်မှတ်ရသေးပါ။");
    const direction = stepData.direction === "SELL_THB" ? "SELL_THB" : "BUY_THB";
    const q = quote(direction, amount, rate.buyRate, rate.sellRate);
    await customerSetStep(ownerUserId, chatId, "x.pay", {
      ...stepData,
      quote: { ...q, fromAmount: q.fromAmount.toString(), toAmount: q.toAmount.toString() },
    });
    await sendMessage(chatId, quoteText(q));
    return askPayMethod(customer);
  }

  if (step === "c.slip") {
    return sendMessage(chatId, "ငွေလွှဲပြေစာ ဓာတ်ပုံကို ပို့ပေးပါ။");
  }
  return customerStart(customer);
}

async function handleMessage(ownerUserId: string, chatId: string, text: string) {
  const resolved = await resolveOwner(ownerUserId, chatId);
  if (resolved.kind === "not_found") return sendMessage(chatId, "This bot isn't set up correctly. Contact the Wallet Note admin.");
  if (resolved.kind === "chat_mismatch") return sendMessage(chatId, "This bot is already linked to a different Telegram account. Unlink it in Wallet Note first if this is you.");
  const { user, justLinked } = resolved;
  if (justLinked) return showMenu(chatId, user, `✅ Linked as ${user.name} (${user.roleName}).\n\nQuick start:`);

  const trimmed = text.trim();
  if (trimmed === "/start" || trimmed === "/menu" || trimmed === "/cancel") return showMenu(chatId, user);

  const session = await getSession(ownerUserId, chatId);
  if (!session) return sendMessage(chatId, "Tap /menu to start.");

  const [flow, step] = session.step.split(".");
  try {
    if (flow === "ie") {
      if (step === "category_new") return ieStepCategoryNewText(chatId, user, session.data, trimmed);
      if (step === "amount") return ieStepAmountText(chatId, user, session.data, trimmed);
      if (step === "description") return ieStepDescriptionText(chatId, user, session.data, trimmed);
    }
    if (flow === "tr") {
      if (step === "amount") return trStepAmountText(chatId, user, session.data, trimmed);
      if (step === "rate") return trStepRateText(chatId, user, session.data, trimmed);
      if (step === "fee") return trStepFeeText(chatId, user, session.data, trimmed);
    }
    if (flow === "ex") {
      if (step === "amount") return exStepAmountText(chatId, user, session.data, trimmed);
      if (step === "rate") return exStepRateText(chatId, user, session.data, trimmed);
    }
    if (flow === "3d") {
      if (step === "lines") return tdStepLinesText(chatId, user, session.data, trimmed);
    }
    if (flow === "cp") {
      if (step === "amount") return cpStepAmountText(chatId, user, session.data, trimmed);
    }
    if (flow === "xord") {
      if (step === "reject") {
        const orderId = String(session.data.orderId ?? "");
        await clearSession(ownerUserId, chatId);
        const result = await rejectExchangeOrder(orderId, user.id, trimmed);
        return sendMessage(chatId, result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
      }
    }
    if (flow === "ord") {
      if (step === "reject") {
        const orderId = String(session.data.orderId ?? "");
        await clearSession(ownerUserId, chatId);
        const result = await rejectOrder(orderId, user.id, trimmed);
        return sendMessage(chatId, result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
      }
    }
    if (flow === "nc") {
      if (step === "customer_new") return ncStepCustomerNewText(chatId, user, session.data, trimmed);
      if (step === "amount") return ncStepAmountText(chatId, user, session.data, trimmed);
      if (step === "note") return ncStepNoteText(chatId, user, session.data, trimmed);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
    return;
  }
  return sendMessage(chatId, "Please use the buttons above, or /cancel to start over.");
}

async function handleCallback(ownerUserId: string, cq: { id: string; message?: { chat: { id: number } }; data?: string }) {
  const chatId = cq.message?.chat.id.toString();
  const data = cq.data ?? "";
  if (!chatId) return answerCallbackQuery(cq.id);
  await answerCallbackQuery(cq.id);

  const resolved = await resolveOwner(ownerUserId, chatId);
  if (resolved.kind === "not_found") return sendMessage(chatId, "This bot isn't set up correctly. Contact the Wallet Note admin.");
  if (resolved.kind === "chat_mismatch") return sendMessage(chatId, "This bot is already linked to a different Telegram account. Unlink it in Wallet Note first if this is you.");
  const { user, justLinked } = resolved;
  if (justLinked) return showMenu(chatId, user, `✅ Linked as ${user.name} (${user.roleName}).\n\nQuick start:`);

  if (data === "cancel") {
    await clearSession(ownerUserId, chatId);
    return showMenu(chatId, user, "Cancelled.");
  }

  // Exchange requests waiting on a slip check. Booking one moves money between two
  // wallets, so the staff member is asked which pair before anything is written.
  if (data.startsWith("x:ok:") || data.startsWith("x:no:")) {
    if (!can(user, "exchange.create")) return sendMessage(chatId, "You don't have permission for that.");
    const orderId = data.slice(5);
    if (data.startsWith("x:no:")) {
      await setSession(ownerUserId, chatId, "xord.reject", { orderId });
      return sendMessage(chatId, "Why is it rejected? Send a short reason, or /cancel.", {
        replyMarkup: keyboard([CANCEL_ROW]),
      });
    }
    const order = await prisma.exchangeOrder.findUnique({ where: { id: orderId } });
    if (!order) return sendMessage(chatId, "Order not found.");
    const branchId = await defaultBranchId(user);
    if (!branchId) return sendMessage(chatId, "No branch is available for your account.");
    // The customer's money lands in a wallet of the currency they paid, and the shop pays
    // out of one holding the other currency.
    const { rows } = await walletButtons(user.businessId, branchId, order.fromCurrency);
    if (rows.length === 0) return sendMessage(chatId, `No ${order.fromCurrency} wallet found.`);
    await setSession(ownerUserId, chatId, "xord.source", { orderId, branchId });
    return sendMessage(chatId, `${order.orderNo}

Which wallet received the ${order.fromCurrency}?`, {
      replyMarkup: keyboard([...rows, CANCEL_ROW]),
    });
  }

  // Customer orders waiting on a slip check.
  if (data.startsWith("o:ok:") || data.startsWith("o:no:")) {
    if (!can(user, "three_d.create")) return sendMessage(chatId, "You don't have permission for that.");
    const orderId = data.slice(5);
    if (data.startsWith("o:no:")) {
      await setSession(ownerUserId, chatId, "ord.reject", { orderId });
      return sendMessage(chatId, "Why is it rejected? Send a short reason, or /cancel.", {
        replyMarkup: keyboard([CANCEL_ROW]),
      });
    }
    const branchId = await defaultBranchId(user);
    if (!branchId) return sendMessage(chatId, "No branch is available for your account.");
    const result = await approveOrder(orderId, user.id, branchId);
    return sendMessage(chatId, result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
  }

  if (data.startsWith("menu:")) {
    const key = data.slice(5);
    const perm = FLOW_REQUIRED_PERM[key];
    if (perm && !can(user, perm)) return sendMessage(chatId, "You don't have permission for that.");
    const feature = FLOW_FEATURE[key];
    if (feature && !(await businessFeatures(user.businessId))[feature]) {
      return sendMessage(chatId, "This function is turned off in Wallet Note Settings.");
    }
    if (key === "income") return startIncomeExpense(chatId, user, "INCOME");
    if (key === "expense") return startIncomeExpense(chatId, user, "EXPENSE");
    if (key === "withdraw") return startIncomeExpense(chatId, user, "WITHDRAW");
    if (key === "transfer") return startTransfer(chatId, user);
    if (key === "exchange") return startExchange(chatId, user);
    if (key === "3d") return startThreeD(chatId, user);
    if (key === "credit") return startCreditPayable(chatId, user, "credit");
    if (key === "payable") return startCreditPayable(chatId, user, "payable");
    if (key === "newcredit") return startNewCredit(chatId, user);
    return;
  }

  const session = await getSession(ownerUserId, chatId);
  if (!session) return sendMessage(chatId, "Tap /menu to start.");
  const [flow, step] = session.step.split(".");

  try {
    // Approving an exchange takes two wallets: the one the customer paid into, then the
    // one the shop pays out of.
    if (flow === "xord") {
      if (step === "source" && data.startsWith("w:")) {
        const order = await prisma.exchangeOrder.findUnique({
          where: { id: String(session.data.orderId ?? "") },
        });
        if (!order) return sendMessage(chatId, "Order not found.");
        const { rows } = await walletButtons(
          user.businessId,
          String(session.data.branchId ?? ""),
          order.toCurrency
        );
        if (rows.length === 0) return sendMessage(chatId, `No ${order.toCurrency} wallet found.`);
        await setSession(ownerUserId, chatId, "xord.dest", {
          ...session.data,
          sourceWalletId: data.slice(2),
        });
        return sendMessage(chatId, `Which wallet pays out the ${order.toCurrency}?`, {
          replyMarkup: keyboard([...rows, CANCEL_ROW]),
        });
      }
      if (step === "dest" && data.startsWith("w:")) {
        const orderId = String(session.data.orderId ?? "");
        await clearSession(ownerUserId, chatId);
        const result = await approveExchangeOrder(
          orderId,
          user.id,
          String(session.data.branchId ?? ""),
          String(session.data.sourceWalletId ?? ""),
          data.slice(2)
        );
        return sendMessage(chatId, result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
      }
    }
    if (flow === "ie") {
      if (step === "wallet" && data.startsWith("w:")) return ieStepWallet(chatId, user, session.data, data.slice(2));
      if (step === "category" && data.startsWith("cat:")) return ieStepCategoryPick(chatId, user, session.data, data.slice(4));
      if (step === "description" && data === "skip") return ieStepDescriptionSkip(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:yes") return ieConfirm(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "Cancelled.");
    }
    if (flow === "tr") {
      if (step === "source" && data.startsWith("w:")) return trStepSource(chatId, user, session.data, data.slice(2));
      if (step === "dest" && data.startsWith("w:")) return trStepDest(chatId, user, session.data, data.slice(2));
      if (step === "fee" && data === "skip") return trStepFeeSkip(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:yes") return trConfirm(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "Cancelled.");
    }
    if (flow === "ex") {
      if (step === "type" && data.startsWith("type:")) return exStepType(chatId, user, session.data, data.slice(5));
      if (step === "source" && data.startsWith("w:")) return exStepSource(chatId, user, session.data, data.slice(2));
      if (step === "dest" && data.startsWith("w:")) return exStepDest(chatId, user, session.data, data.slice(2));
      if (step === "rate" && data.startsWith("rate:")) return exAskConfirm(chatId, user, { ...session.data, rate: data.slice(5) });
      if (step === "confirm" && data === "confirm:yes") return exConfirm(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "Cancelled.");
    }
    if (flow === "3d") {
      if (step === "session" && data.startsWith("s:")) return tdStepSession(chatId, user, session.data, data.slice(2));
      if (step === "confirm" && data === "confirm:yes") return tdConfirm(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "Cancelled.");
    }
    if (flow === "cp") {
      if (step === "pick" && data.startsWith("r:")) return cpStepPick(chatId, user, session.data, data.slice(2));
      if (step === "wallet" && data.startsWith("w:")) return cpStepWallet(chatId, user, session.data, data.slice(2));
      if (step === "confirm" && data === "confirm:yes") return cpConfirm(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "Cancelled.");
    }
    if (flow === "nc") {
      if (step === "customer" && data.startsWith("c:")) return ncStepCustomerPick(chatId, user, session.data, data.slice(2));
      if (step === "note" && data === "skip") return ncStepNoteSkip(chatId, user, session.data);
      if (step === "wallet" && data.startsWith("w:")) return ncStepWallet(chatId, user, session.data, data.slice(2));
      if (step === "confirm" && data === "confirm:yes") return ncConfirm(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "Cancelled.");
    }
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "Something went wrong."}`);
    return;
  }
}
