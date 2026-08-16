import { prisma } from "@/lib/prisma";
import { sendMessage, withBotToken } from "@/lib/telegram";
import { resultMessage } from "@/lib/resultMessage";
import { resolveRate } from "@/services/marketRateService";

/** Telling every customer the number, as soon as it is known.
 *
 *  Sent to all of a shop's Telegram customers, not only the ones who bet: a customer who
 *  sat this draw out still wants the number, and they asked the shop's bot for it by being
 *  there. Whether they won is a separate message and only goes to those with a stake.
 *
 *  Announced once per shop per draw. The result tables are shared by every shop while each
 *  announces on its own bot, so "already sent" has to be recorded per shop — otherwise the
 *  minute-by-minute sync would repeat the same number all evening.
 */

/** How far back a result is still worth announcing.
 *
 *  A shop that connects its bot today should not have its customers woken by last month's
 *  numbers, and a sync that back-fills history should stay silent.
 */
const FRESH_HOURS = 12;

/** Telegram accepts around 30 messages a second across a bot. Well under it, because
 *  nothing here is urgent to the millisecond and a flood risks the bot being limited. */
const GAP_MS = 60;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Announcement {
  gameType: string;
  drawDate: string;
  sessionName: string;
  resultNumber: string;
  setValue?: string | null;
  value?: string | null;
  fetchedAt: Date;
}

async function recentResults(now: Date): Promise<Announcement[]> {
  const since = new Date(now.getTime() - FRESH_HOURS * 3600_000);
  const [twoD, threeD] = await Promise.all([
    prisma.twoDOfficialResult.findMany({
      where: { fetchedAt: { gte: since } },
      orderBy: { fetchedAt: "desc" },
      take: 20,
    }),
    prisma.threeDOfficialResult.findMany({
      where: { fetchedAt: { gte: since } },
      orderBy: { fetchedAt: "desc" },
      take: 20,
    }),
  ]);

  return [
    ...twoD.map((r) => ({
      gameType: "TWO_D",
      drawDate: r.drawDate,
      sessionName: r.sessionName,
      resultNumber: r.resultNumber,
      setValue: r.setValue,
      value: r.value,
      fetchedAt: r.fetchedAt,
    })),
    ...threeD.map((r) => ({
      gameType: "THREE_D",
      drawDate: r.drawDate,
      sessionName: r.sessionName,
      resultNumber: r.resultNumber,
      fetchedAt: r.fetchedAt,
    })),
  ];
}

export async function broadcastResults(now = new Date()) {
  const results = await recentResults(now);
  if (results.length === 0) return { announced: 0, messages: 0, warnings: [] as string[] };

  // Only shops whose bot is actually connected. A customer row without a live token has
  // nothing to send through.
  const owners = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      telegramBotToken: { not: null },
    },
    select: { id: true, businessId: true, telegramBotToken: true, telegramChatId: true },
  });
  if (owners.length === 0) return { announced: 0, messages: 0, warnings: [] };

  const warnings: string[] = [];
  let announced = 0;
  let messages = 0;

  for (const result of results) {
    for (const owner of owners) {
      const customers = await prisma.telegramCustomer.findMany({
        where: { ownerUserId: owner.id, blocked: false },
        select: { id: true, chatId: true },
      });
      if (customers.length === 0) continue;

      // The row is written before anything is sent. Two sync runs overlapping would
      // otherwise both find nothing recorded and both send; losing the race here means
      // sending nothing, which is the better way to lose it.
      try {
        await prisma.resultAnnouncement.create({
          data: {
            businessId: owner.businessId,
            gameType: result.gameType,
            drawDate: result.drawDate,
            sessionName: result.sessionName,
          },
        });
      } catch {
        continue; // already announced by this shop
      }

      const text = resultMessage(result);
      let sent = 0;
      await withBotToken(owner.telegramBotToken!, async () => {
        for (const customer of customers) {
          try {
            await sendMessage(customer.chatId, text);
            sent += 1;
          } catch (error) {
            // A customer who blocked the bot must not stop the rest of the list.
            warnings.push(
              `${owner.businessId}/${customer.chatId}: ${
                error instanceof Error ? error.message : "send failed"
              }`
            );
          }
          await wait(GAP_MS);
        }
      });

      // The person who owns the bot gets it too, on the same guard: the shop wants the
      // number as much as its customers do, and it is the one screen nobody is watching
      // at 12:01. Sent to their own chat rather than through the audit feed — that only
      // reaches roles holding audit.view, and an owner who never granted themselves that
      // permission was hearing nothing at all.
      const staffLines = [
        `🔔 ${result.gameType === "TWO_D" ? "2D" : "3D"} result — ${result.sessionName} ${result.drawDate}`,
        `Number: ${result.resultNumber}`,
      ];
      if (result.setValue) staffLines.push(`SET ${result.setValue}`);
      if (result.value) staffLines.push(`VALUE ${result.value}`);
      staffLines.push(`Sent to ${sent} customer(s).`);
      if (owner.telegramChatId) {
        await withBotToken(owner.telegramBotToken!, () =>
          sendMessage(owner.telegramChatId!, staffLines.join("\n"))
        ).catch(() => null);
      }

      await prisma.resultAnnouncement.updateMany({
        where: {
          businessId: owner.businessId,
          gameType: result.gameType,
          drawDate: result.drawDate,
          sessionName: result.sessionName,
        },
        data: { recipients: sent },
      });

      announced += 1;
      messages += sent;
    }
  }

  return { announced, messages, warnings: warnings.slice(0, 10) };
}

/** Today's rate, to the customers who actually change money.
 *
 *  Sent only to customers who have exchanged with this shop before. A customer who has
 *  only ever bet on numbers has no use for a THB rate every morning, and a bot that sends
 *  things nobody asked for is a bot people block — which would cost the shop the result
 *  messages too.
 *
 *  Once a day per shop, on the same announcement guard the results use: the sync runs
 *  several times a day and the rate must not arrive several times with it.
 */
export async function broadcastDailyRates(now = new Date()) {
  const owners = await prisma.user.findMany({
    where: { active: true, deletedAt: null, telegramBotToken: { not: null } },
    select: { id: true, businessId: true, telegramBotToken: true },
  });
  if (owners.length === 0) return { announced: 0, messages: 0, warnings: [] as string[] };

  const warnings: string[] = [];
  let announced = 0;
  let messages = 0;

  for (const owner of owners) {
    const rate = await resolveRate(owner.businessId);
    // Nothing to say without a rate, and saying "no rate today" helps nobody.
    if (!rate) continue;

    // Been through an exchange with this shop, whatever came of it: someone who asked for
    // a quote is someone who changes money.
    const orders = await prisma.exchangeOrder.findMany({
      where: { businessId: owner.businessId },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    if (orders.length === 0) continue;

    const customers = await prisma.telegramCustomer.findMany({
      where: {
        id: { in: orders.map((order) => order.customerId) },
        ownerUserId: owner.id,
        blocked: false,
      },
      select: { chatId: true },
    });
    if (customers.length === 0) continue;

    // Yangon's date, not the server's: a rate sent at 07:00 local is "today" to the shop
    // while the server in UTC still calls it yesterday.
    const business = await prisma.business.findUnique({
      where: { id: owner.businessId },
      select: { timezone: true },
    });
    const today = now.toLocaleDateString("en-CA", { timeZone: business?.timezone || "Asia/Yangon" });

    try {
      await prisma.resultAnnouncement.create({
        data: {
          businessId: owner.businessId,
          gameType: "EXCHANGE_RATE",
          drawDate: today,
          sessionName: "DAILY",
        },
      });
    } catch {
      continue; // already sent today
    }

    const text =
      `💱 ယနေ့ ငွေလဲနှုန်း\n\n` +
      `ဘတ်ရောင်းမည် (သင်ပေး THB → ကျပ်ရ) — ၁ ဘတ် = ${rate.buyRate} ကျပ်\n` +
      `ဘတ်ဝယ်မည် (သင်ပေး ကျပ် → THB ရ) — ၁ ဘတ် = ${rate.sellRate} ကျပ်\n\n` +
      `လဲလှယ်ရန် "ငွေလဲမည်" ကို နှိပ်ပါ။`;

    let sent = 0;
    await withBotToken(owner.telegramBotToken!, async () => {
      for (const customer of customers) {
        try {
          await sendMessage(customer.chatId, text);
          sent += 1;
        } catch (error) {
          warnings.push(
            `${owner.businessId}/${customer.chatId}: ${
              error instanceof Error ? error.message : "send failed"
            }`
          );
        }
        await wait(GAP_MS);
      }
    });

    await prisma.resultAnnouncement.updateMany({
      where: {
        businessId: owner.businessId,
        gameType: "EXCHANGE_RATE",
        drawDate: today,
        sessionName: "DAILY",
      },
      data: { recipients: sent },
    });

    announced += 1;
    messages += sent;
  }

  return { announced, messages, warnings: warnings.slice(0, 10) };
}
