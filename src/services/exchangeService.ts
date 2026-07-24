import Decimal from "decimal.js";
import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { mulMinor } from "@/lib/money";
import { postLedger, reverseLedgerEntries } from "./walletService";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";

// Exchange calculations. Rate convention: MMK per 1 THB (e.g. "130" means 1 THB = 130 MMK).

export function convertAmount(fromAmount: bigint, fromCurrency: string, toCurrency: string, rate: string): bigint {
  if (fromCurrency === toCurrency) throw new ApiError(422, "Currencies must be different");
  const r = new Decimal(rate);
  if (r.lte(0)) throw new ApiError(422, "Rate must be greater than zero");
  if (fromCurrency === "THB" && toCurrency === "MMK") return mulMinor(fromAmount, rate);
  if (fromCurrency === "MMK" && toCurrency === "THB") {
    const d = new Decimal(fromAmount.toString()).div(r);
    return BigInt(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
  }
  // generic: rate = target per 1 source
  return mulMinor(fromAmount, rate);
}

/** Profit vs the base (board) rate, in MMK minor units.
 *  When buying THB: profit = (baseRate - dealRate) * thbAmount — paying less MMK than board.
 *  When selling THB: profit = (dealRate - baseRate) * thbAmount — receiving more MMK than board. */
export function exchangeProfit(opts: {
  type: "BUY_THB" | "SELL_THB";
  thbAmount: bigint;
  dealRate: string;
  baseRate: string;
  serviceFee: bigint;
  additionalCost: bigint;
}): bigint {
  const diff =
    opts.type === "BUY_THB"
      ? new Decimal(opts.baseRate).minus(opts.dealRate)
      : new Decimal(opts.dealRate).minus(opts.baseRate);
  const gain = new Decimal(opts.thbAmount.toString()).times(diff);
  const gainMinor = BigInt(gain.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
  return gainMinor + opts.serviceFee - opts.additionalCost;
}

export async function createExchange(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    type: string; // BUY_THB SELL_THB CONVERT
    fromCurrency: string;
    toCurrency: string;
    fromAmount: bigint;
    rate: string;
    serviceFee: bigint;
    additionalCost: bigint;
    sourceWalletId: string;
    destWalletId: string;
    customerId?: string;
    agentId?: string;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
  }
) {
  const source = await tx.wallet.findUnique({ where: { id: opts.sourceWalletId } });
  const dest = await tx.wallet.findUnique({ where: { id: opts.destWalletId } });
  if (!source || !dest || source.businessId !== opts.businessId || dest.businessId !== opts.businessId)
    throw new ApiError(404, "Wallet not found");
  if (source.id === dest.id) throw new ApiError(422, "Source and destination wallets must differ");
  if (source.currency !== opts.fromCurrency)
    throw new ApiError(422, `Source wallet is ${source.currency}, expected ${opts.fromCurrency}`);
  if (dest.currency !== opts.toCurrency)
    throw new ApiError(422, `Destination wallet is ${dest.currency}, expected ${opts.toCurrency}`);
  if (opts.customerId) {
    const customer = await tx.contact.findFirst({
      where: { id: opts.customerId, businessId: opts.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new ApiError(404, "Customer not found");
  }
  if (opts.agentId) {
    const agent = await tx.contact.findFirst({
      where: { id: opts.agentId, businessId: opts.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!agent) throw new ApiError(404, "Agent not found");
  }

  const toAmount = convertAmount(opts.fromAmount, opts.fromCurrency, opts.toCurrency, opts.rate);

  // Profit vs the active board rate when THB/MMK
  let profit = 0n;
  const isThbMmk =
    (opts.fromCurrency === "THB" && opts.toCurrency === "MMK") ||
    (opts.fromCurrency === "MMK" && opts.toCurrency === "THB");
  if (isThbMmk && (opts.type === "BUY_THB" || opts.type === "SELL_THB")) {
    const board = await tx.exchangeRate.findFirst({
      where: { businessId: opts.businessId, pair: "THB/MMK", active: true },
      orderBy: { effectiveAt: "desc" },
    });
    if (board) {
      const thbAmount = opts.fromCurrency === "THB" ? opts.fromAmount : toAmount;
      const baseRate = opts.type === "BUY_THB" ? board.buyRate : board.sellRate;
      profit = exchangeProfit({
        type: opts.type,
        thbAmount,
        dealRate: opts.rate,
        baseRate,
        serviceFee: opts.serviceFee,
        additionalCost: opts.additionalCost,
      });
    } else {
      profit = opts.serviceFee - opts.additionalCost;
    }
  } else {
    profit = opts.serviceFee - opts.additionalCost;
  }

  const txnNo = await nextNumber(tx, opts.businessId, "EXCHANGE");
  const exchange = await tx.exchangeTransaction.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: opts.branchId,
      type: opts.type,
      fromCurrency: opts.fromCurrency,
      toCurrency: opts.toCurrency,
      fromAmount: opts.fromAmount,
      toAmount,
      rate: opts.rate,
      serviceFee: opts.serviceFee,
      additionalCost: opts.additionalCost,
      profit,
      sourceWalletId: opts.sourceWalletId,
      destWalletId: opts.destWalletId,
      customerId: opts.customerId,
      agentId: opts.agentId,
      paymentMethod: opts.paymentMethod,
      reference: opts.reference,
      notes: opts.notes,
      status: "COMPLETED",
      createdById: opts.userId,
    },
  });

  // Atomic dual wallet movement: money out of source, into destination.
  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: source.id,
    direction: "CREDIT",
    amount: opts.fromAmount,
    refType: "EXCHANGE_OUT",
    refId: exchange.id,
    description: `${txnNo} ${opts.type} @ ${opts.rate}`,
    createdById: opts.userId,
  });
  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: dest.id,
    direction: "DEBIT",
    amount: toAmount,
    refType: "EXCHANGE_IN",
    refId: exchange.id,
    description: `${txnNo} ${opts.type} @ ${opts.rate}`,
    createdById: opts.userId,
  });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: opts.branchId,
    action: "CREATE",
    module: "exchange",
    resourceType: "ExchangeTransaction",
    resourceId: exchange.id,
    after: { txnNo, type: opts.type, fromAmount: opts.fromAmount, toAmount, rate: opts.rate, profit },
  });

  return exchange;
}

export async function reverseExchange(
  tx: Tx,
  opts: { exchangeId: string; reason: string; userId: string; businessId: string }
) {
  const ex = await tx.exchangeTransaction.findUnique({ where: { id: opts.exchangeId } });
  if (!ex || ex.businessId !== opts.businessId) throw new ApiError(404, "Exchange transaction not found");
  if (ex.status === "REVERSED") throw new ApiError(422, "Transaction has already been reversed");
  if (!opts.reason.trim()) throw new ApiError(422, "A reason is required to reverse a transaction");

  await reverseLedgerEntries(tx, opts.businessId, "EXCHANGE_OUT", ex.id, opts.userId, opts.reason);
  await reverseLedgerEntries(tx, opts.businessId, "EXCHANGE_IN", ex.id, opts.userId, opts.reason);

  await tx.exchangeTransaction.update({
    where: { id: ex.id },
    data: { status: "REVERSED", reversedById: opts.userId, reversedAt: new Date(), reverseReason: opts.reason },
  });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    action: "REVERSE",
    module: "exchange",
    resourceType: "ExchangeTransaction",
    resourceId: ex.id,
    reason: opts.reason,
    before: { status: ex.status },
  });
}
