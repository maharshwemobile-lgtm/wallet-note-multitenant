"use client";

import { fmtMoney } from "@/lib/format";
import { buildExposureBars, totalOverLimit, type ExposureRow } from "@/lib/exposureChart";

/** Which numbers are carrying the money, and which have gone past what the shop will hold.
 *
 *  Sorted biggest first, because that is the order the question gets asked in. A number
 *  past its limit is drawn in two parts — what the shop is willing to owe, and what it is
 *  not — so the amount that has to be laid off elsewhere can be read off the bar itself
 *  rather than worked out from a total.
 */
export function ExposureChart({
  rows,
  limit,
  take = 30,
}: {
  rows: ExposureRow[];
  /** Minor units, or null when the shop has not set one. */
  limit: bigint | null;
  take?: number;
}) {
  const bars = buildExposureBars(rows, limit, take);
  if (bars.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">No records on this draw yet.</p>;
  }

  const over = totalOverLimit(bars);

  return (
    <div className="space-y-2">
      {over > 0n && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-900/30">
          <span className="text-amber-800 dark:text-amber-200">Over the limit, in total</span>
          <b className="tabular-nums text-amber-900 dark:text-amber-100">{fmtMoney(over.toString())}</b>
        </div>
      )}

      <div className="space-y-1.5">
        {bars.map((bar) => (
          <div key={bar.number} className="flex items-center gap-2">
            <span className="w-12 shrink-0 rounded-full bg-gray-100 py-1 text-center font-mono text-sm font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {bar.number}
            </span>

            {/* The track is the full width; the bar inside it is measured against the
                biggest number on the draw, so the shape of the risk is visible at a glance. */}
            <div className="relative h-7 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="flex h-full">
                <div
                  className={`flex items-center justify-center overflow-hidden text-xs font-semibold text-white transition-all ${
                    bar.tone === "normal" ? "bg-blue-700" : "bg-red-500"
                  } ${bar.overPercent > 0 ? "rounded-l-full" : "rounded-full"}`}
                  style={{ width: `${bar.withinPercent}%` }}
                >
                  {bar.withinPercent > 14 && fmtMoney(bar.withinLimit.toString())}
                </div>
                {bar.overPercent > 0 && (
                  <div
                    className="flex items-center justify-center overflow-hidden rounded-r-full bg-amber-400 text-xs font-semibold text-amber-950"
                    style={{ width: `${bar.overPercent}%` }}
                    title={`${fmtMoney(bar.overLimit.toString())} over the limit`}
                  >
                    {bar.overPercent > 8 && fmtMoney(bar.overLimit.toString())}
                  </div>
                )}
              </div>
            </div>

            <span
              className={`w-24 shrink-0 text-right text-sm font-bold tabular-nums ${
                bar.tone === "normal" ? "text-gray-700 dark:text-gray-200" : "text-red-600 dark:text-red-400"
              }`}
            >
              {fmtMoney(bar.total.toString())}
            </span>
          </div>
        ))}
      </div>

      {limit !== null && (
        <p className="pt-1 text-xs text-gray-500">
          Limit per number {fmtMoney(limit.toString())}. Red is at or near it; amber is the part past it.
        </p>
      )}
    </div>
  );
}
