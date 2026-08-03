/** The customer side of a shop's Telegram bot.
 *
 *  A shop's bot has always answered exactly one chat: the staff member who owns it. This
 *  adds a second audience — the shop's own customers — who can ask to place bets but
 *  cannot reach anything else. Nothing they send books a record or moves money: an order
 *  waits until a staff member has looked at the payment slip and approved it.
 *
 *  Everything a customer sees is Myanmar. They are not app users and never chose a
 *  language, so there is nothing to switch on.
 */

import { prisma } from "./prisma";
import { btn, keyboard, sendMessage, sendPhoto, type TgMessage } from "./telegram";
import { gameRules, numberRangeLabel } from "./lotteryGame";
import { parseBulkLines, createThreeDBets } from "@/services/threeDService";
import { activePaymentMethods, paymentInstructionsMy, type PaymentMethod } from "./payments";
import { nextNumber } from "./sequence";
import { audit } from "./audit";
import { toMinor } from "./money";
import { fmtMoneyMy } from "./telegramCustomerText";

const CANCEL = [[btn("✕ ပယ်ဖျက်", "c:cancel")]];

interface CustomerRow {
  id: string;
  businessId: string;
  ownerUserId: string;
  chatId: string;
  name: string | null;
  username: string | null;
  phone: string | null;
  blocked: boolean;
}

/** How a customer is written in a staff-facing message: the @handle if they have one,
 *  because a display name can change and a chat id alone means nothing to a person. */
function customerLabel(customer: { name: string | null; username: string | null; chatId: string }): string {
  const parts = [customer.name, customer.username ? `@${customer.username}` : null].filter(Boolean);
  parts.push(`#${customer.chatId}`);
  return parts.join(" · ");
}

/** Customer conversations reuse the staff session table, keyed by the owning bot and the
 *  customer's own chat, so two customers never share a step. */
async function getStep(ownerUserId: string, chatId: string) {
  const row = await prisma.telegramSession.findUnique({
    where: { ownerUserId_chatId: { ownerUserId, chatId } },
  });
  if (!row) return { step: "", data: {} as Record<string, unknown> };
  try {
    return { step: row.step, data: JSON.parse(row.data) as Record<string, unknown> };
  } catch {
    return { step: row.step, data: {} as Record<string, unknown> };
  }
}

async function setStep(ownerUserId: string, chatId: string, step: string, data: Record<string, unknown>) {
  await prisma.telegramSession.upsert({
    where: { ownerUserId_chatId: { ownerUserId, chatId } },
    create: { ownerUserId, chatId, step, data: JSON.stringify(data) },
    update: { step, data: JSON.stringify(data) },
  });
}

async function clearStep(ownerUserId: string, chatId: string) {
  await prisma.telegramSession.deleteMany({ where: { ownerUserId, chatId } });
}

/** Find or create the customer record for this chat. The business comes from the bot's
 *  owner, never from anything the customer sends. */
export async function resolveCustomer(
  ownerUserId: string,
  businessId: string,
  chatId: string,
  name?: string,
  username?: string
): Promise<CustomerRow> {
  const existing = await prisma.telegramCustomer.findUnique({
    where: { ownerUserId_chatId: { ownerUserId, chatId } },
  });
  if (!existing) {
    return prisma.telegramCustomer.create({
      data: { businessId, ownerUserId, chatId, name: name ?? null, username: username ?? null },
    });
  }
  // People rename themselves and add handles later, so keep the record current — but
  // never blank a stored value just because this update did not carry one.
  const patch: { name?: string; username?: string } = {};
  if (name && name !== existing.name) patch.name = name;
  if (username && username !== existing.username) patch.username = username;
  if (Object.keys(patch).length === 0) return existing;
  return prisma.telegramCustomer.update({ where: { id: existing.id }, data: patch });
}

/** HH:mm now, in the business's own timezone — the cut-off is written in local time. */
function nowHhMm(timezone: string): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: timezone || "Asia/Yangon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function todayIn(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone || "Asia/Yangon" });
}

/** Sessions a customer may still bet into: open, drawn today or later, and not past their
 *  cut-off. The cut-off matters most — betting after the number is known is the one thing
 *  that must never be possible. */
async function bettableSessions(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  const timezone = business?.timezone || "Asia/Yangon";
  const today = todayIn(timezone);
  const now = nowHhMm(timezone);

  const sessions = await prisma.threeDSession.findMany({
    where: { businessId, status: "OPEN", drawDate: { gte: today } },
    orderBy: [{ drawDate: "asc" }, { cutoffTime: "asc" }],
    take: 10,
  });

  return sessions.filter((session) => {
    if (session.drawDate > today) return true;
    return !session.cutoffTime || now < session.cutoffTime;
  });
}

export async function customerStart(customer: CustomerRow) {
  await clearStep(customer.ownerUserId, customer.chatId);
  await sendMessage(
    customer.chatId,
    "မင်္ဂလာပါ 🙏\n\nထီထိုးရန် အောက်က ခလုတ်ကို နှိပ်ပါ။",
    { replyMarkup: keyboard([[btn("🎯 ထီထိုးမည်", "c:bet")], [btn("🧾 ကျွန်ုပ်၏ မှတ်တမ်း", "c:orders")]]) }
  );
}

export async function customerChooseSession(customer: CustomerRow) {
  const sessions = await bettableSessions(customer.businessId);
  if (sessions.length === 0) {
    await clearStep(customer.ownerUserId, customer.chatId);
    return sendMessage(customer.chatId, "ယခုအချိန်တွင် ဖွင့်ထားသော ထီအလှည့် မရှိသေးပါ။ ခဏနေ ပြန်ကြိုးစားပါ။");
  }

  const rows = sessions.map((session) => [
    btn(
      `${gameRules(session.gameType).label} · ${session.name} · ${session.drawDate}`,
      `c:s:${session.id}`
    ),
  ]);
  await setStep(customer.ownerUserId, customer.chatId, "c.session", {});
  await sendMessage(customer.chatId, "🎯 ဘယ်အလှည့်ကို ထိုးမလဲ ရွေးပါ။", {
    replyMarkup: keyboard([...rows, ...CANCEL]),
  });
}

export async function customerSessionPicked(customer: CustomerRow, sessionId: string) {
  const open = await bettableSessions(customer.businessId);
  const session = open.find((s) => s.id === sessionId);
  if (!session) {
    return sendMessage(customer.chatId, "ဤအလှည့်ကို ပိတ်လိုက်ပါပြီ။ /start နှိပ်၍ ပြန်စပါ။");
  }

  const rules = gameRules(session.gameType);
  const example = rules.digits === 2 ? "07=5000\n42=3000" : "123=5000\n456=3000";
  await setStep(customer.ownerUserId, customer.chatId, "c.numbers", {
    sessionId: session.id,
    gameType: session.gameType,
  });
  await sendMessage(
    customer.chatId,
    `${rules.label} · ${session.name} · ${session.drawDate}\n` +
      (session.cutoffTime ? `ပိတ်ချိန် — ${session.cutoffTime}\n` : "") +
      `\nထိုးလိုသော နံပါတ်များကို တစ်ကြောင်းလျှင် တစ်ခုစီ ပို့ပါ။\n\n${example}\n\n` +
      `(နံပါတ်သည် ${numberRangeLabel(session.gameType)} ဖြစ်ရပါမည်)`,
    { replyMarkup: keyboard(CANCEL) }
  );
}

export async function customerNumbers(customer: CustomerRow, data: Record<string, unknown>, text: string) {
  const gameType = typeof data.gameType === "string" ? data.gameType : "THREE_D";
  const sessionId = String(data.sessionId ?? "");
  const parsed = parseBulkLines(text, gameType);

  if (parsed.errors.length) {
    const lines = parsed.errors.slice(0, 10).map((e) => `• ${e.text}`);
    return sendMessage(
      customer.chatId,
      `အောက်ပါ စာကြောင်းများ မှားနေပါသည် —\n${lines.join("\n")}\n\n` +
        `ပုံစံ — ${gameRules(gameType).digits === 2 ? "07=5000" : "123=5000"}`,
      { replyMarkup: keyboard(CANCEL) }
    );
  }
  if (parsed.rows.length === 0) {
    return sendMessage(customer.chatId, "နံပါတ် မတွေ့ပါ။ ဥပမာ — 07=5000", { replyMarkup: keyboard(CANCEL) });
  }

  let total = 0n;
  for (const row of parsed.rows) {
    const amount = toMinor(row.amount);
    if (amount <= 0n) {
      return sendMessage(customer.chatId, "ငွေပမာဏသည် ၀ ထက် ကြီးရပါမည်။", { replyMarkup: keyboard(CANCEL) });
    }
    total += amount;
  }

  await setStep(customer.ownerUserId, customer.chatId, "c.confirm", {
    sessionId,
    gameType,
    rows: parsed.rows,
    total: total.toString(),
  });

  const list = parsed.rows.map((r) => `${r.number} — ${r.amount}`).join("\n");
  await sendMessage(
    customer.chatId,
    `📋 အတည်ပြုပါ\n\n${list}\n\nစုစုပေါင်း — ${fmtMoneyMy(total)} ကျပ်`,
    { replyMarkup: keyboard([[btn("✅ အတည်ပြုမည်", "c:ok"), btn("✕ ပယ်ဖျက်", "c:cancel")]]) }
  );
}

async function shopPaymentMethods(businessId: string): Promise<PaymentMethod[]> {
  const setting = await prisma.systemSetting.findUnique({
    where: { businessId_key: { businessId, key: "payments" } },
    select: { value: true },
  });
  if (!setting) return [];
  try {
    return activePaymentMethods(JSON.parse(setting.value));
  } catch {
    return [];
  }
}

/** Records the order and asks for the slip. The bets themselves are not created here —
 *  only approval does that. */
export async function customerConfirm(customer: CustomerRow, data: Record<string, unknown>) {
  const sessionId = String(data.sessionId ?? "");
  const rows = (Array.isArray(data.rows) ? data.rows : []) as { number: string; amount: string }[];
  const total = BigInt(String(data.total ?? "0"));
  if (!sessionId || rows.length === 0) {
    return sendMessage(customer.chatId, "မှတ်တမ်း မတွေ့ပါ။ /start နှိပ်၍ ပြန်စပါ။");
  }

  // Re-checked at confirm time: the cut-off may have passed while the numbers were typed.
  const open = await bettableSessions(customer.businessId);
  if (!open.some((s) => s.id === sessionId)) {
    await clearStep(customer.ownerUserId, customer.chatId);
    return sendMessage(customer.chatId, "ဆောရီးပါ — ဤအလှည့် ပိတ်သွားပါပြီ။ ငွေ မပေးရသေးပါ။");
  }

  const methods = await shopPaymentMethods(customer.businessId);
  if (methods.length === 0) {
    await clearStep(customer.ownerUserId, customer.chatId);
    return sendMessage(customer.chatId, "ငွေပေးချေရန် နည်းလမ်း မသတ်မှတ်ရသေးပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။");
  }

  const order = await prisma.$transaction(async (tx) => {
    const orderNo = await nextNumber(tx, customer.businessId, "LOTTERY_ORDER");
    return tx.lotteryOrder.create({
      data: {
        orderNo,
        businessId: customer.businessId,
        ownerUserId: customer.ownerUserId,
        customerId: customer.id,
        sessionId,
        rows: JSON.stringify(rows),
        totalAmount: total,
        status: "AWAITING_SLIP",
      },
    });
  });

  await setStep(customer.ownerUserId, customer.chatId, "c.slip", { orderId: order.id });
  await sendMessage(
    customer.chatId,
    `🧾 အော်ဒါ ${order.orderNo}\nစုစုပေါင်း — ${fmtMoneyMy(total)} ကျပ်\n\n` +
      `အောက်ပါ နည်းလမ်းဖြင့် ငွေလွှဲပါ —\n\n${paymentInstructionsMy(methods)}\n\n` +
      `လွှဲပြီးပါက ငွေလွှဲပြေစာ (screenshot) ကို ဤနေရာတွင် ပို့ပေးပါ။`,
    { replyMarkup: keyboard(CANCEL) }
  );
}

/** The slip arrives as a photo (or a file). It is handed to staff for checking. */
export async function customerSlip(
  customer: CustomerRow,
  data: Record<string, unknown>,
  message: TgMessage
) {
  const orderId = String(data.orderId ?? "");
  const fileId =
    message.photo?.[message.photo.length - 1]?.file_id ?? message.document?.file_id ?? null;
  if (!fileId) {
    return sendMessage(customer.chatId, "ငွေလွှဲပြေစာ ဓာတ်ပုံကို ပို့ပေးပါ။", { replyMarkup: keyboard(CANCEL) });
  }

  const order = await prisma.lotteryOrder.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== customer.id || order.status !== "AWAITING_SLIP") {
    await clearStep(customer.ownerUserId, customer.chatId);
    return sendMessage(customer.chatId, "အော်ဒါ မတွေ့ပါ။ /start နှိပ်၍ ပြန်စပါ။");
  }

  await prisma.lotteryOrder.update({
    where: { id: order.id },
    data: { status: "REVIEW", slipFileId: fileId },
  });
  await clearStep(customer.ownerUserId, customer.chatId);

  await sendMessage(
    customer.chatId,
    `✅ ရရှိပါပြီ — အော်ဒါ ${order.orderNo}\n\nဆိုင်မှ စစ်ဆေးပြီးပါက အကြောင်းပြန်ပါမည်။`
  );

  await notifyStaffOfOrder(order.id, fileId);
}

/** Staff see the slip and the numbers together, with the two buttons that decide it. */
async function notifyStaffOfOrder(orderId: string, fileId: string) {
  const order = await prisma.lotteryOrder.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return;

  const owner = await prisma.user.findUnique({
    where: { id: order.ownerUserId },
    select: { telegramChatId: true },
  });
  if (!owner?.telegramChatId) return;

  const session = await prisma.threeDSession.findUnique({ where: { id: order.sessionId } });
  const rows = JSON.parse(order.rows) as { number: string; amount: string }[];
  const list = rows.map((r) => `${r.number} — ${r.amount}`).join("\n");
  const who = customerLabel(order.customer);

  const caption =
    `🧾 ${order.orderNo}\n` +
    `ဖောက်သည် — ${who}\n` +
    (session ? `${gameRules(session.gameType).label} · ${session.name} · ${session.drawDate}\n` : "") +
    `\n${list}\n\nစုစုပေါင်း — ${fmtMoneyMy(order.totalAmount)} ကျပ်`;

  await sendPhoto(owner.telegramChatId, fileId, {
    caption,
    replyMarkup: keyboard([
      [btn("✅ လက်ခံမည်", `o:ok:${order.id}`), btn("✕ ငြင်းမည်", `o:no:${order.id}`)],
    ]),
  });
}

/** Approval is the point where the bets become real. */
export async function approveOrder(orderId: string, staffUserId: string, branchId: string) {
  const order = await prisma.lotteryOrder.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return { ok: false as const, message: "အော်ဒါ မတွေ့ပါ။" };
  if (order.status !== "REVIEW") {
    return { ok: false as const, message: `ဤအော်ဒါကို ကိုင်တွယ်ပြီးဖြစ်သည် (${order.status})။` };
  }

  const rows = JSON.parse(order.rows) as { number: string; amount: string }[];
  const staff = await prisma.user.findUnique({
    where: { id: staffUserId },
    select: { commissionRate: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await createThreeDBets(tx, {
        businessId: order.businessId,
        branchId,
        userId: staffUserId,
        sessionId: order.sessionId,
        rows,
        commissionRate: staff?.commissionRate ?? "0",
        customerName: order.customer.name ?? undefined,
        customerPhone: order.customer.phone ?? undefined,
        notes: `Telegram order ${order.orderNo}`,
        telegramOrderId: order.id,
      });
      await tx.lotteryOrder.update({
        where: { id: order.id },
        data: { status: "APPROVED", reviewedById: staffUserId, reviewedAt: new Date() },
      });
      // Who approved whose money, and for which numbers. Records the customer by handle
      // and chat id, since a display name is not something they can be held to.
      await audit(tx, {
        businessId: order.businessId,
        userId: staffUserId,
        branchId,
        action: "APPROVE",
        module: "telegram_order",
        resourceType: "LotteryOrder",
        resourceId: order.id,
        after: {
          orderNo: order.orderNo,
          customer: customerLabel(order.customer),
          chatId: order.customer.chatId,
          username: order.customer.username,
          sessionId: order.sessionId,
          numbers: rows,
          totalAmount: order.totalAmount.toString(),
        },
      });
    });
  } catch (error) {
    // The usual cause is the session closing between the slip arriving and the approval.
    // The order is left in REVIEW so it is not silently lost, and staff are told plainly.
    const reason = error instanceof Error ? error.message : "မအောင်မြင်ပါ";
    return { ok: false as const, message: `စာရင်းသွင်း၍ မရပါ — ${reason}` };
  }

  const session = await prisma.threeDSession.findUnique({ where: { id: order.sessionId } });
  const list = rows.map((r) => `${r.number} — ${r.amount}`).join("\n");
  await sendMessage(
    order.customer.chatId,
    `✅ အတည်ပြုပြီးပါပြီ\n\n🧾 ပြေစာ ${order.orderNo}\n` +
      (session ? `${gameRules(session.gameType).label} · ${session.name} · ${session.drawDate}\n` : "") +
      `\n${list}\n\nစုစုပေါင်း — ${fmtMoneyMy(order.totalAmount)} ကျပ်\n\nကံကောင်းပါစေ 🍀`
  );

  return { ok: true as const, message: `${order.orderNo} လက်ခံပြီးပါပြီ။` };
}

export async function rejectOrder(orderId: string, staffUserId: string, reason: string) {
  const order = await prisma.lotteryOrder.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return { ok: false as const, message: "အော်ဒါ မတွေ့ပါ။" };
  if (order.status !== "REVIEW") {
    return { ok: false as const, message: `ဤအော်ဒါကို ကိုင်တွယ်ပြီးဖြစ်သည် (${order.status})။` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.lotteryOrder.update({
      where: { id: order.id },
      data: {
        status: "REJECTED",
        reviewedById: staffUserId,
        reviewedAt: new Date(),
        rejectReason: reason || null,
      },
    });
    await audit(tx, {
      businessId: order.businessId,
      userId: staffUserId,
      action: "REJECT",
      module: "telegram_order",
      resourceType: "LotteryOrder",
      resourceId: order.id,
      reason: reason || undefined,
      after: {
        orderNo: order.orderNo,
        customer: customerLabel(order.customer),
        chatId: order.customer.chatId,
        totalAmount: order.totalAmount.toString(),
      },
    });
  });

  await sendMessage(
    order.customer.chatId,
    `❌ အော်ဒါ ${order.orderNo} ကို လက်မခံနိုင်ပါ။` +
      (reason ? `\n\nအကြောင်းရင်း — ${reason}` : "") +
      `\n\nမေးမြန်းလိုပါက ဆိုင်သို့ ဆက်သွယ်ပါ။`
  );

  return { ok: true as const, message: `${order.orderNo} ငြင်းပယ်ပြီးပါပြီ။` };
}

const ORDER_STATUS_MY: Record<string, string> = {
  AWAITING_SLIP: "ပြေစာ စောင့်ဆိုင်းဆဲ",
  REVIEW: "စစ်ဆေးဆဲ",
  APPROVED: "အတည်ပြုပြီး",
  REJECTED: "လက်မခံပါ",
  EXPIRED: "သက်တမ်းကုန်",
};

/** Everything this customer has bet, 2D and 3D together: the numbers they backed, what
 *  came out, and what won. Being able to read it back is the point — a customer who
 *  cannot check their own record has to take the shop's word for it. */
export async function customerOrders(customer: CustomerRow) {
  const orders = await prisma.lotteryOrder.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  if (orders.length === 0) {
    return sendMessage(customer.chatId, "မှတ်တမ်း မရှိသေးပါ။");
  }

  const sessions = await prisma.threeDSession.findMany({
    where: { id: { in: [...new Set(orders.map((o) => o.sessionId))] } },
    select: { id: true, name: true, drawDate: true, gameType: true, resultNumber: true },
  });
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const bets = await prisma.threeDTransaction.findMany({
    where: { telegramOrderId: { in: orders.map((o) => o.id) }, deletedAt: null },
    select: { telegramOrderId: true, number: true, betAmount: true, isWinner: true, winAmount: true },
  });
  const betsByOrder = new Map<string, typeof bets>();
  for (const bet of bets) {
    const key = bet.telegramOrderId!;
    betsByOrder.set(key, [...(betsByOrder.get(key) ?? []), bet]);
  }

  let totalWon = 0n;
  const blocks: string[] = [];

  for (const order of orders) {
    const session = sessionById.get(order.sessionId);
    const head =
      `🧾 ${order.orderNo} — ${ORDER_STATUS_MY[order.status] ?? order.status}` +
      (session ? `\n${gameRules(session.gameType).label} · ${session.name} · ${session.drawDate}` : "");

    const placed = betsByOrder.get(order.id) ?? [];
    let body: string;
    if (placed.length > 0) {
      body = placed
        .map((bet) => {
          const line = `${bet.number} — ${fmtMoneyMy(bet.betAmount)}`;
          if (bet.isWinner) {
            totalWon += bet.winAmount;
            return `✅ ${line}  →  ပေါက်  ${fmtMoneyMy(bet.winAmount)} ကျပ်`;
          }
          // Only shown as a loss once the number is actually out.
          return session?.resultNumber ? `▫️ ${line}` : `⏳ ${line}`;
        })
        .join("\n");
    } else {
      // Not approved yet, so there are no records — show what was asked for.
      const rows = JSON.parse(order.rows) as { number: string; amount: string }[];
      body = rows.map((r) => `⏳ ${r.number} — ${r.amount}`).join("\n");
    }

    const result = session?.resultNumber ? `\nထွက်ဂဏန်း — ${session.resultNumber}` : "";
    blocks.push(`${head}${result}\n${body}\nစုစုပေါင်း — ${fmtMoneyMy(order.totalAmount)} ကျပ်`);
  }

  const footer = totalWon > 0n ? `\n\n🏆 စုစုပေါင်း ပေါက်ငွေ — ${fmtMoneyMy(totalWon)} ကျပ်` : "";
  await sendMessage(customer.chatId, `📜 ကျွန်ုပ်၏ မှတ်တမ်း\n\n${blocks.join("\n\n")}${footer}`);
}

export async function customerCancel(customer: CustomerRow) {
  await clearStep(customer.ownerUserId, customer.chatId);
  await sendMessage(customer.chatId, "ပယ်ဖျက်လိုက်ပါပြီ။ /start နှိပ်၍ ပြန်စနိုင်ပါသည်။");
}

export { getStep as customerGetStep, setStep as customerSetStep, clearStep as customerClearStep };
