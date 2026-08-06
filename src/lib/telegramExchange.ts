/** Currency exchange for a shop's Telegram customers.
 *
 *  Shows the shop's own rate, works out both sides of the deal before anyone commits, and
 *  then holds the request until a staff member has seen the payment slip. Nothing moves
 *  between wallets until that happens — the same rule the bet orders follow.
 */

import { prisma } from "./prisma";
import { btn, keyboard, sendMessage, sendPhoto, withBotToken, type TgMessage } from "./telegram";
import { activePaymentMethods, PAYMENT_TYPE_LABEL_MY, type PaymentMethod } from "./payments";
import { fmtMoneyMy } from "./telegramCustomerText";
import { nextNumber } from "./sequence";
import { toMinor } from "./money";
import { audit } from "./audit";
import { createExchange } from "@/services/exchangeService";

const CANCEL = [[btn("✕ ပယ်ဖျက်", "c:cancel")]];

export interface ExchangeCustomer {
  id: string;
  businessId: string;
  ownerUserId: string;
  chatId: string;
  name: string | null;
  username: string | null;
}

export interface Quote {
  type: "BUY_THB" | "SELL_THB";
  fromCurrency: "THB" | "MMK";
  toCurrency: "THB" | "MMK";
  fromAmount: bigint;
  toAmount: bigint;
  rate: string;
}

/** The shop's live rate for THB against MMK. */
export async function currentRate(businessId: string) {
  return prisma.exchangeRate.findFirst({
    where: { businessId, pair: "THB/MMK", active: true },
    orderBy: { effectiveAt: "desc" },
    select: { buyRate: true, sellRate: true, effectiveAt: true },
  });
}

/** Work out both sides of the deal.
 *
 *  `buyRate` is what the shop pays for a customer's THB; `sellRate` is what it charges to
 *  hand THB over. Using the wrong one loses the shop the spread on every deal, so the
 *  direction picks the rate rather than a single "rate" being applied both ways.
 */
export function quote(
  direction: "BUY_THB" | "SELL_THB",
  amount: bigint,
  buyRate: string,
  sellRate: string
): Quote {
  if (direction === "BUY_THB") {
    // Customer hands over THB and receives MMK.
    return {
      type: "BUY_THB",
      fromCurrency: "THB",
      toCurrency: "MMK",
      fromAmount: amount,
      toAmount: (amount * toMinor(buyRate)) / 100n,
      rate: buyRate,
    };
  }
  // Customer hands over MMK and receives THB.
  return {
    type: "SELL_THB",
    fromCurrency: "MMK",
    toCurrency: "THB",
    fromAmount: amount,
    toAmount: (amount * 100n) / toMinor(sellRate),
    rate: sellRate,
  };
}

async function shopMethods(businessId: string): Promise<PaymentMethod[]> {
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

export async function showRates(customer: ExchangeCustomer) {
  const rate = await currentRate(customer.businessId);
  if (!rate) {
    return sendMessage(customer.chatId, "ငွေလဲနှုန်း မသတ်မှတ်ရသေးပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။");
  }
  await sendMessage(
    customer.chatId,
    `💱 ယနေ့ ငွေလဲနှုန်း\n\n` +
      `ဘတ်ရောင်းမည် (သင်ပေး THB → ကျပ်ရ) — ၁ ဘတ် = ${rate.buyRate} ကျပ်\n` +
      `ဘတ်ဝယ်မည် (သင်ပေး ကျပ် → THB ရ) — ၁ ဘတ် = ${rate.sellRate} ကျပ်\n\n` +
      `ဘယ်လို လဲမလဲ ရွေးပါ။`,
    {
      replyMarkup: keyboard([
        [btn("THB ပေး → ကျပ် ယူ", "x:d:BUY_THB")],
        [btn("ကျပ် ပေး → THB ယူ", "x:d:SELL_THB")],
        ...CANCEL,
      ]),
    }
  );
}

export function askAmount(customer: ExchangeCustomer, direction: "BUY_THB" | "SELL_THB") {
  const give = direction === "BUY_THB" ? "ဘတ် (THB)" : "ကျပ် (MMK)";
  return sendMessage(
    customer.chatId,
    `ပေးမည့် ပမာဏကို ရိုက်ထည့်ပါ — ${give}\n\nဥပမာ — 10000`,
    { replyMarkup: keyboard(CANCEL) }
  );
}

/** The quote a customer is asked to agree to, written out in full. */
export function quoteText(q: Quote): string {
  const give = q.fromCurrency === "THB" ? "ဘတ်" : "ကျပ်";
  const get = q.toCurrency === "THB" ? "ဘတ်" : "ကျပ်";
  return (
    `💱 အတည်ပြုပါ\n\n` +
    `နှုန်း — ၁ ဘတ် = ${q.rate} ကျပ်\n\n` +
    `သင်ပေးရမည် — ${fmtMoneyMy(q.fromAmount)} ${give}\n` +
    `သင်ရမည် — ${fmtMoneyMy(q.toAmount)} ${get}`
  );
}

export function methodButtons(methods: PaymentMethod[], prefix: string) {
  return methods.map((method) => [
    btn(
      `${PAYMENT_TYPE_LABEL_MY[method.type]}${method.accountNumber ? ` · ${method.accountNumber}` : ""}`,
      `${prefix}${method.id}`
    ),
  ]);
}

/** Only what the shop has said it accepts. A customer cannot name a method the shop does
 *  not use, which is the whole point of listing them in settings. */
export async function askPayMethod(customer: ExchangeCustomer) {
  const methods = await shopMethods(customer.businessId);
  if (methods.length === 0) {
    return sendMessage(customer.chatId, "ငွေပေးချေရန် နည်းလမ်း မသတ်မှတ်ရသေးပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။");
  }
  await sendMessage(customer.chatId, "ဘာနဲ့ ပေးမလဲ ရွေးပါ။", {
    replyMarkup: keyboard([...methodButtons(methods, "x:pay:"), ...CANCEL]),
  });
}

export async function askReceiveMethod(customer: ExchangeCustomer) {
  const methods = await shopMethods(customer.businessId);
  await sendMessage(customer.chatId, "ဘာနဲ့ ပြန်ယူမလဲ ရွေးပါ။", {
    replyMarkup: keyboard([...methodButtons(methods, "x:get:"), ...CANCEL]),
  });
}

export async function methodLabel(businessId: string, id: string): Promise<string | null> {
  const method = (await shopMethods(businessId)).find((entry) => entry.id === id);
  if (!method) return null;
  return `${PAYMENT_TYPE_LABEL_MY[method.type]}${method.accountNumber ? ` · ${method.accountNumber}` : ""}`;
}

/** Records the request and asks for the slip. Nothing is booked yet. */
export async function createExchangeOrder(
  customer: ExchangeCustomer,
  q: Quote,
  payMethod: string,
  receiveMethod: string,
  receiveAccount: string
) {
  const order = await prisma.$transaction(async (tx) => {
    const orderNo = await nextNumber(tx, customer.businessId, "EXCHANGE_ORDER");
    return tx.exchangeOrder.create({
      data: {
        orderNo,
        businessId: customer.businessId,
        ownerUserId: customer.ownerUserId,
        customerId: customer.id,
        type: q.type,
        fromCurrency: q.fromCurrency,
        toCurrency: q.toCurrency,
        fromAmount: q.fromAmount,
        toAmount: q.toAmount,
        rate: q.rate,
        payMethod,
        receiveMethod,
        receiveAccount,
        status: "AWAITING_SLIP",
      },
    });
  });

  const methods = await shopMethods(customer.businessId);
  const paying = methods.find((m) => m.id === payMethod);
  await sendMessage(
    customer.chatId,
    `🧾 အော်ဒါ ${order.orderNo}\n\n` +
      `${quoteText(q)}\n\n` +
      (paying
        ? `အောက်ပါသို့ လွှဲပါ —\n${PAYMENT_TYPE_LABEL_MY[paying.type]}\n` +
          (paying.accountNumber ? `နံပါတ် — ${paying.accountNumber}\n` : "") +
          (paying.accountName ? `အမည် — ${paying.accountName}\n` : "")
        : "") +
      `\nလွှဲပြီးပါက ငွေလွှဲပြေစာ (screenshot) ကို ပို့ပေးပါ။`,
    { replyMarkup: keyboard(CANCEL) }
  );
  return order;
}

/** Staff see the slip, the rate agreed and both sides of the deal in one message. */
export async function notifyStaffOfExchange(orderId: string, fileId: string) {
  const order = await prisma.exchangeOrder.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return;

  const owner = await prisma.user.findUnique({
    where: { id: order.ownerUserId },
    select: { telegramChatId: true },
  });
  if (!owner?.telegramChatId) return;

  const who = [order.customer.name, order.customer.username ? `@${order.customer.username}` : null]
    .filter(Boolean)
    .join(" · ");

  const caption =
    `💱 ${order.orderNo}\n` +
    `ဖောက်သည် — ${who || order.customer.chatId}\n\n` +
    `နှုန်း — ${order.rate}\n` +
    `ရမည် — ${fmtMoneyMy(order.fromAmount)} ${order.fromCurrency}\n` +
    `ပေးရမည် — ${fmtMoneyMy(order.toAmount)} ${order.toCurrency}\n` +
    (order.receiveAccount ? `\nပြန်ပို့ရန် — ${order.receiveMethod}\n${order.receiveAccount}` : "");

  await sendPhoto(owner.telegramChatId, fileId, {
    caption,
    replyMarkup: keyboard([
      [btn("✅ လက်ခံမည်", `x:ok:${order.id}`), btn("✕ ငြင်းမည်", `x:no:${order.id}`)],
    ]),
  });
}

/** Approval books the exchange and moves the money. */
export async function approveExchangeOrder(
  orderId: string,
  staffUserId: string,
  branchId: string,
  sourceWalletId: string,
  destWalletId: string
) {
  const order = await prisma.exchangeOrder.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return { ok: false as const, message: "အော်ဒါ မတွေ့ပါ။" };
  if (order.status !== "REVIEW") {
    return { ok: false as const, message: `ဤအော်ဒါကို ကိုင်တွယ်ပြီးဖြစ်သည် (${order.status})။` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const exchange = await createExchange(tx, {
        businessId: order.businessId,
        branchId,
        userId: staffUserId,
        type: order.type,
        fromCurrency: order.fromCurrency,
        toCurrency: order.toCurrency,
        fromAmount: order.fromAmount,
        // The rate the customer agreed to, not today's — it may have moved since.
        rate: order.rate,
        serviceFee: 0n,
        additionalCost: 0n,
        sourceWalletId,
        destWalletId,
        paymentMethod: order.payMethod ?? undefined,
        notes: `Telegram exchange ${order.orderNo}`,
      });
      await tx.exchangeOrder.update({
        where: { id: order.id },
        data: {
          status: "APPROVED",
          reviewedById: staffUserId,
          reviewedAt: new Date(),
          exchangeId: (exchange as { id: string }).id,
        },
      });
      await audit(tx, {
        businessId: order.businessId,
        userId: staffUserId,
        branchId,
        action: "APPROVE",
        module: "exchange_order",
        resourceType: "ExchangeOrder",
        resourceId: order.id,
        after: {
          orderNo: order.orderNo,
          chatId: order.customer.chatId,
          rate: order.rate,
          from: `${order.fromAmount} ${order.fromCurrency}`,
          to: `${order.toAmount} ${order.toCurrency}`,
        },
      });
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "မအောင်မြင်ပါ";
    return { ok: false as const, message: `စာရင်းသွင်း၍ မရပါ — ${reason}` };
  }

  await sendMessage(
    order.customer.chatId,
    `✅ ငွေလဲလှယ်မှု ပြီးပါပြီ\n\n🧾 ${order.orderNo}\n` +
      `နှုန်း — ${order.rate}\n` +
      `သင်ပေးခဲ့သည် — ${fmtMoneyMy(order.fromAmount)} ${order.fromCurrency}\n` +
      `သင်ရမည် — ${fmtMoneyMy(order.toAmount)} ${order.toCurrency}\n\n` +
      `ကျေးဇူးတင်ပါသည် 🙏`
  );
  return { ok: true as const, message: `${order.orderNo} လက်ခံပြီးပါပြီ။` };
}

export async function rejectExchangeOrder(orderId: string, staffUserId: string, reason: string) {
  const order = await prisma.exchangeOrder.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return { ok: false as const, message: "အော်ဒါ မတွေ့ပါ။" };
  if (order.status !== "REVIEW") {
    return { ok: false as const, message: `ဤအော်ဒါကို ကိုင်တွယ်ပြီးဖြစ်သည် (${order.status})။` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.exchangeOrder.update({
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
      module: "exchange_order",
      resourceType: "ExchangeOrder",
      resourceId: order.id,
      reason: reason || undefined,
      after: { orderNo: order.orderNo, chatId: order.customer.chatId },
    });
  });

  await sendMessage(
    order.customer.chatId,
    `❌ ငွေလဲလှယ်မှု ${order.orderNo} ကို လက်မခံနိုင်ပါ။` +
      (reason ? `\n\nအကြောင်းရင်း — ${reason}` : "") +
      `\n\nမေးမြန်းလိုပါက ဆိုင်သို့ ဆက်သွယ်ပါ။`
  );
  return { ok: true as const, message: `${order.orderNo} ငြင်းပယ်ပြီးပါပြီ။` };
}

export { withBotToken, type TgMessage };
