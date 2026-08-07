import { prisma } from "@/lib/prisma";
import { applySpread, isFresh, parseMarketPost, postText } from "@/lib/marketRate";

/** Fetching and applying the published market rate.
 *
 *  The source is a public Telegram channel's web preview, which needs no token and no
 *  membership. It is scraped rather than called because Myanmar's market rate has no
 *  maintained API — the ones on GitHub stopped publishing in 2022 and 2024, and every live
 *  API reports the central bank's rate, which is roughly half the market.
 */

const SOURCE = "MMKTODAY";
const CHANNEL = "https://t.me/s/mmktoday";

interface Post {
  postedAt: Date;
  text: string;
}

/** Every post on the preview page, newest last, with the time it was published. */
export function extractPosts(html: string): Post[] {
  const bodies = [...html.matchAll(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g)];
  const times = [...html.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);

  // The page carries more <time> elements than posts, and the post times are the last of
  // them — pairing from the end keeps each post with its own timestamp.
  const offset = Math.max(0, times.length - bodies.length);
  return bodies.map((match, index) => ({
    postedAt: new Date(times[offset + index] ?? ""),
    text: postText(match[1]),
  }));
}

/** Read the channel and store whatever it published most recently.
 *
 *  Keyed on the post time, so re-running only ever updates — the channel is read several
 *  times a day and must not accumulate a row per read.
 */
export async function syncMarketRates() {
  const warnings: string[] = [];
  let response: Response;
  try {
    response = await fetch(CHANNEL, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; WalletNote/1.0)" },
    });
  } catch (error) {
    return { stored: 0, warnings: [error instanceof Error ? error.message : "fetch failed"] };
  }
  if (!response.ok) {
    return { stored: 0, warnings: [`channel HTTP ${response.status}`] };
  }

  const posts = extractPosts(await response.text());
  // The newest post that actually carries rates: the channel also posts notes and images.
  const withRates = posts
    .map((post) => ({ ...post, quotes: parseMarketPost(post.text) }))
    .filter((post) => post.quotes.length > 0 && !Number.isNaN(post.postedAt.getTime()));

  const latest = withRates[withRates.length - 1];
  if (!latest) {
    return { stored: 0, warnings: ["no post with rates found — the format may have changed"] };
  }

  let stored = 0;
  for (const quote of latest.quotes) {
    await prisma.marketRate.upsert({
      where: {
        source_currency_postedAt: {
          source: SOURCE,
          currency: quote.currency,
          postedAt: latest.postedAt,
        },
      },
      create: {
        source: SOURCE,
        currency: quote.currency,
        buy: String(quote.buy),
        sell: String(quote.sell),
        postedAt: latest.postedAt,
      },
      update: { buy: String(quote.buy), sell: String(quote.sell), fetchedAt: new Date() },
    });
    stored += 1;
  }

  return { stored, postedAt: latest.postedAt.toISOString(), warnings };
}

export async function latestMarketRate(currency: string) {
  return prisma.marketRate.findFirst({
    where: { source: SOURCE, currency },
    orderBy: { postedAt: "desc" },
  });
}

export interface ExchangeSettings {
  autoRate: boolean;
  buyAdjust: number;
  sellAdjust: number;
}

export function parseExchangeSettings(value: unknown): ExchangeSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const number = (input: unknown) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    autoRate: raw.autoRate === true,
    buyAdjust: number(raw.buyAdjust),
    sellAdjust: number(raw.sellAdjust),
  };
}

export interface ResolvedRate {
  buyRate: string;
  sellRate: string;
  /** Where the figure came from, so a screen can say so rather than implying it is live. */
  source: "market" | "manual";
  marketBuy?: string;
  marketSell?: string;
  postedAt?: Date;
  /** Set when auto is on but the feed could not be used, so this is worth surfacing. */
  staleWarning?: string;
}

/** The rate a shop actually quotes.
 *
 *  Falls back to the shop's own figure when the feed is stale rather than to any other
 *  source. Every live API reports the official rate, which is about half the market — using
 *  one as a backup would silently pay a customer half of what they are owed.
 */
export async function resolveRate(businessId: string): Promise<ResolvedRate | null> {
  const manual = await prisma.exchangeRate.findFirst({
    where: { businessId, pair: "THB/MMK", active: true },
    orderBy: { effectiveAt: "desc" },
    select: { buyRate: true, sellRate: true },
  });

  const setting = await prisma.systemSetting.findUnique({
    where: { businessId_key: { businessId, key: "exchange" } },
    select: { value: true },
  });
  let config: ExchangeSettings = { autoRate: false, buyAdjust: 0, sellAdjust: 0 };
  if (setting) {
    try {
      config = parseExchangeSettings(JSON.parse(setting.value));
    } catch {
      // A malformed document simply means the shop's own rate is used.
    }
  }

  if (!config.autoRate) {
    return manual ? { ...manual, source: "manual" } : null;
  }

  const market = await latestMarketRate("THB");
  if (!market || !isFresh(market.postedAt, new Date())) {
    return manual
      ? {
          ...manual,
          source: "manual",
          staleWarning: market
            ? "Market rate is out of date; using your own rate."
            : "No market rate has been fetched yet; using your own rate.",
        }
      : null;
  }

  const adjusted = applySpread(
    { buy: Number(market.buy), sell: Number(market.sell) },
    config.buyAdjust,
    config.sellAdjust
  );
  return {
    buyRate: String(adjusted.buy),
    sellRate: String(adjusted.sell),
    source: "market",
    marketBuy: market.buy,
    marketSell: market.sell,
    postedAt: market.postedAt,
  };
}
