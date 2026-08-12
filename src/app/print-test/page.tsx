"use client";

import { ExposureChart } from "@/components/ExposureChart";
import { SaleReceipt, type ReceiptData } from "@/components/SaleReceipt";
import { printReceipt } from "@/lib/printReceipt";
import { buildTextReceipt, rawbtUrl } from "@/lib/thermalReceipt";

/** A slip on a page of its own, to find out where printing goes wrong.
 *
 *  The printed output has come out blank twice, and reasoning about which rule did it has
 *  been wrong twice. This takes the sale, the till and the login out of the question: the
 *  same component, with fixed data, on a page anyone can open. If this prints, the fault is
 *  in the sale flow. If it prints blank, the fault is in the print stylesheet — and either
 *  answer is one press away instead of a guess.
 */

const SAMPLE: ReceiptData = {
  txnNo: "SAL-000123",
  at: new Date("2026-08-12T07:20:00.000Z").toISOString(),
  shopName: "Mahar Shwe Mobile",
  shopPhone: "09-123456789",
  shopAddress: "No 12, Main Road",
  customerName: "Ko Aung",
  cashierName: "Cashier",
  lines: [
    { name: "Coca Cola 330ml", quantity: 2, unitPrice: 800 },
    { name: "Rice 5kg", quantity: 1, unitPrice: 14000 },
    { name: "Samsung A54 Tempered Glass", quantity: 3, unitPrice: 2500 },
  ],
  subtotal: 23100,
  discount: 100,
  total: 23000,
  paid: 25000,
  change: 2000,
  credit: 0,
};

export default function PrintTestPage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold">Slip print test</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Press a button below and tell us what comes out. Nothing here touches your records.
      </p>

      <button
        onClick={() => printReceipt()}
        className="min-h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"
      >
        1. Print with the browser
      </button>

      <a
        href={rawbtUrl(buildTextReceipt(SAMPLE))}
        className="block min-h-11 w-full rounded-lg bg-gray-800 px-4 py-3 text-center text-sm font-medium text-white"
      >
        2. Print with RawBT (roll printer)
      </a>

      {/* The same markup as the real slip, shown on screen so it is obvious whether the
          content exists at all — the printed copy has been arriving empty. */}
      <div>
        <h2 className="mb-1 text-sm font-semibold">What the slip should say</h2>
        <div className="w-[58mm] border border-dashed border-gray-400 bg-white px-1 font-mono text-[10px] leading-tight text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold">{SAMPLE.shopName}</div>
            <div>{SAMPLE.shopPhone}</div>
            <div>{SAMPLE.shopAddress}</div>
          </div>
          <div className="my-1 border-t border-dashed border-black" />
          <div className="flex justify-between"><span>{SAMPLE.txnNo}</span></div>
          <div className="my-1 border-t border-dashed border-black" />
          {SAMPLE.lines.map((line) => (
            <div key={line.name} className="mb-0.5">
              <div className="truncate">{line.name}</div>
              <div className="flex justify-between">
                <span>{line.quantity} x {line.unitPrice.toLocaleString()}</span>
                <span>{(line.quantity * line.unitPrice).toLocaleString()}</span>
              </div>
            </div>
          ))}
          <div className="my-1 border-t border-dashed border-black" />
          <div className="flex justify-between font-bold"><span>TOTAL</span><span>{SAMPLE.total.toLocaleString()}</span></div>
        </div>
      </div>

      <details className="text-xs text-gray-500">
        <summary>Plain text sent to RawBT</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre rounded bg-gray-100 p-2 dark:bg-gray-800">
          {buildTextReceipt(SAMPLE)}
        </pre>
      </details>

      {/* Shown here so the exposure chart can be checked without a real draw. */}
      <div className="pt-6">
        <h2 className="mb-2 text-sm font-semibold">Exposure chart preview</h2>
        <ExposureChart
          rows={[
            { number: "684", totalStake: 73_000_00n },
            { number: "081", totalStake: 69_500_00n },
            { number: "391", totalStake: 69_000_00n },
            { number: "415", totalStake: 55_000_00n },
            { number: "942", totalStake: 50_500_00n },
            { number: "920", totalStake: 38_500_00n },
            { number: "500", totalStake: 38_000_00n },
            { number: "202", totalStake: 33_000_00n },
            { number: "141", totalStake: 32_000_00n },
            { number: "538", totalStake: 30_000_00n },
          ]}
          limit={60_000_00n}
        />
      </div>

      {/* The real thing: hidden on screen, printed by the stylesheet. */}
      <SaleReceipt data={SAMPLE} />
    </main>
  );
}
