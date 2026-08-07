import { withAuth, json } from "@/lib/api";
import { isFresh } from "@/lib/marketRate";
import { latestMarketRate, resolveRate } from "@/services/marketRateService";

export const dynamic = "force-dynamic";

/** The published market rate and what this shop would quote from it.
 *
 *  Reports staleness rather than hiding it: a settings screen that shows a rate without
 *  saying how old it is invites someone to trust a figure the feed stopped updating.
 */
export const GET = withAuth("exchange.view", async ({ user }) => {
  const market = await latestMarketRate("THB");
  const effective = await resolveRate(user.businessId);

  return json({
    market: market
      ? {
          buy: market.buy,
          sell: market.sell,
          postedAt: market.postedAt,
          fresh: isFresh(market.postedAt, new Date()),
        }
      : null,
    effective,
  });
});
