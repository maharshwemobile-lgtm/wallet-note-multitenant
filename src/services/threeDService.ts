import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { mulMinor, percentOf, toMinor } from "@/lib/money";
import { gameRules, isValidNumber, numberRangeLabel } from "@/lib/lotteryGame";
import { postLedger, reverseLedgerEntries } from "./walletService";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { assertDateOpen } from "./closeGuard";
import { isSessionCutoffPassed } from "./thaiLottoService";

// 3D record calculations and settlement. All money in BigInt minor units.

export function computeThreeD(betAmount: bigint, odds: string, commissionRate: string) {
  const potentialPayout = mulMinor(betAmount, odds);
  const commissionAmount = percentOf(betAmount, commissionRate);
  const netAmount = betAmount - commissionAmount;
  return { potentialPayout, commissionAmount, netAmount };
}

/** Parse bulk entry lines like "123=5000". Returns rows or per-line errors.
 *  The digit count follows the game: a 2D session's "07=5000" is not a malformed 3D line. */
export function parseBulkLines(text: string, gameType: string = "THREE_D"): {
  rows: { number: string; amount: string }[];
  errors: { line: number; text: string; message: string }[];
} {
  const { digits, label } = gameRules(gameType);
  const lineFormat = new RegExp(`^(\\d{${digits}})\\s*[=\\-:\\s]\\s*([\\d,]+(?:\\.\\d+)?)$`);
  const example = digits === 2 ? "07=5000" : "123=5000";
  const rows: { number: string; amount: string }[] = [];
  const errors: { line: number; text: string; message: string }[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(lineFormat);
    if (!m) {
      errors.push({ line: i + 1, text: line, message: `Expected format: ${example}` });
      return;
    }
    if (!isValidNumber(m[1], gameType)) {
      errors.push({ line: i + 1, text: line, message: `${label} number must be ${numberRangeLabel(gameType)}` });
      return;
    }
    rows.push({ number: m[1], amount: m[2].replace(/,/g, "") });
  });
  return { rows, errors };
}

export async function createThreeDBets(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    sessionId: string;
    rows: { number: string; amount: string }[];
    commissionRate: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    odds?: string;
    notes?: string;
    /** Present when the bets came from an approved Telegram order. */
    telegramOrderId?: string;
  }
) {
  if (opts.rows.length === 0) throw new ApiError(422, "No records to save");
  // Validate against the session's own game, so a 3D number cannot be booked into a 2D
  // session (or the reverse) and then never match a result.
  const betSession = await tx.threeDSession.findUnique({
    where: { id: opts.sessionId },
    select: { gameType: true },
  });
  const betGame = betSession?.gameType ?? "THREE_D";
  for (const row of opts.rows) {
    if (!isValidNumber(row.number, betGame)) {
      throw new ApiError(
        422,
        `Invalid ${gameRules(betGame).label} number: "${row.number}" (must be ${numberRangeLabel(betGame)})`
      );
    }
  }

  const session = await tx.threeDSession.findFirst({
    where: { id: opts.sessionId, businessId: opts.businessId },
  });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.status !== "OPEN")
    throw new ApiError(422, `Session is ${session.status.toLowerCase()} - records can only be added to open sessions`);

  // The status alone was not enough. It is set to CLOSED by a job that runs once a minute,
  // so between the cut-off and the next run the morning draw was still OPEN and a bet on a
  // number that may already be known could be booked into it. The clock is checked here,
  // in the shop's own timezone, because this is the last point before the money is
  // recorded and no screen can talk its way past it.
  const business = await tx.business.findUnique({
    where: { id: opts.businessId },
    select: { timezone: true },
  });
  if (isSessionCutoffPassed(session, new Date(), business?.timezone || "Asia/Yangon")) {
    throw new ApiError(
      422,
      `Entry for ${session.name} closed at ${session.cutoffTime ?? session.drawTime}. Use the next draw.`
    );
  }
  if (session.branchId && session.branchId !== opts.branchId)
    throw new ApiError(422, "Session belongs to a different branch");

  if (opts.customerId) {
    const customer = await tx.contact.findFirst({
      where: { id: opts.customerId, businessId: opts.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new ApiError(404, "Customer not found");
  }

  await assertDateOpen(tx, opts.branchId, session.drawDate);
  const odds = opts.odds ?? session.defaultOdds;
  const created = [];
  for (const row of opts.rows) {
    const betAmount = toMinor(row.amount);
    if (betAmount <= 0n) throw new ApiError(422, "Bet amount must be greater than zero");
    const calculation = computeThreeD(betAmount, odds, opts.commissionRate);
    const txnNo = await nextNumber(tx, opts.businessId, betGame);
    created.push(await tx.threeDTransaction.create({
      data: {
        txnNo,
        businessId: opts.businessId,
        branchId: opts.branchId,
        sessionId: session.id,
        agentId: opts.userId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        customerPhone: opts.customerPhone,
        number: row.number,
        betAmount,
        odds,
        potentialPayout: calculation.potentialPayout,
        commissionRate: opts.commissionRate,
        commissionAmount: calculation.commissionAmount,
        netAmount: calculation.netAmount,
        notes: opts.notes,
        telegramOrderId: opts.telegramOrderId,
        createdById: opts.userId,
      },
    }));
  }
  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: opts.branchId,
    action: "CREATE",
    module: "three_d",
    resourceType: "ThreeDTransaction",
    after: { count: created.length, sessionId: session.id },
  });
  return created;
}

export interface SettlementPreview {
  resultNumber: string;
  totalRecords: number;
  grossCollected: bigint;
  totalCommission: bigint;
  winningRecords: number;
  totalPayout: bigint;
  netProfit: bigint;
}

export async function previewSettlement(
  tx: Tx,
  sessionId: string,
  resultNumber: string
): Promise<SettlementPreview> {
  // The session decides how many digits a result has — 2D and 3D share this table.
  const owning = await tx.threeDSession.findUnique({
    where: { id: sessionId },
    select: { gameType: true },
  });
  const gameType = owning?.gameType ?? "THREE_D";
  if (!isValidNumber(resultNumber, gameType)) {
    throw new ApiError(422, `Result must be a ${gameRules(gameType).digits}-digit number (${numberRangeLabel(gameType)})`);
  }
  const txns = await tx.threeDTransaction.findMany({
    where: { sessionId, deletedAt: null, settlementStatus: { not: "CANCELLED" } },
  });
  let gross = 0n, commission = 0n, payout = 0n, winners = 0;
  for (const t of txns) {
    gross += t.betAmount;
    commission += t.commissionAmount;
    if (t.number === resultNumber) {
      payout += t.potentialPayout;
      winners++;
    }
  }
  return {
    resultNumber,
    totalRecords: txns.length,
    grossCollected: gross,
    totalCommission: commission,
    winningRecords: winners,
    totalPayout: payout,
    netProfit: gross - commission - payout,
  };
}

export async function settleSession(
  tx: Tx,
  opts: {
    sessionId: string;
    resultNumber: string;
    walletId?: string;
    userId: string;
    businessId: string;
  }
) {
  const session = await tx.threeDSession.findUnique({ where: { id: opts.sessionId } });
  if (!session || session.businessId !== opts.businessId) throw new ApiError(404, "Session not found");
  if (session.status === "SETTLED") throw new ApiError(422, "Session has already been settled");
  if (session.status === "CANCELLED") throw new ApiError(422, "Session is cancelled");

  const preview = await previewSettlement(tx, opts.sessionId, opts.resultNumber);

  // Mark winners and settle every record
  await tx.threeDTransaction.updateMany({
    where: { sessionId: opts.sessionId, deletedAt: null, settlementStatus: "PENDING" },
    data: { settlementStatus: "SETTLED" },
  });
  await tx.threeDTransaction.updateMany({
    where: { sessionId: opts.sessionId, deletedAt: null, number: opts.resultNumber, settlementStatus: "SETTLED" },
    data: { isWinner: true },
  });
  // winAmount = potentialPayout for winners
  const winners = await tx.threeDTransaction.findMany({
    where: { sessionId: opts.sessionId, deletedAt: null, isWinner: true },
  });
  for (const w of winners) {
    await tx.threeDTransaction.update({ where: { id: w.id }, data: { winAmount: w.potentialPayout } });
  }

  const settlement = await tx.threeDSettlement.create({
    data: {
      sessionId: opts.sessionId,
      resultNumber: preview.resultNumber,
      grossCollected: preview.grossCollected,
      totalCommission: preview.totalCommission,
      totalPayout: preview.totalPayout,
      netProfit: preview.netProfit,
      walletId: opts.walletId,
      settledById: opts.userId,
    },
  });

  // Wallet movement: net effect of the session on the chosen wallet.
  if (opts.walletId && preview.netProfit !== 0n) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: opts.walletId,
      direction: preview.netProfit > 0n ? "DEBIT" : "CREDIT",
      amount: preview.netProfit > 0n ? preview.netProfit : -preview.netProfit,
      refType: "THREE_D_SETTLE",
      refId: settlement.id,
      description: `${gameRules(session.gameType).label} settlement ${session.name} ${session.drawDate} result ${preview.resultNumber}`,
      createdById: opts.userId,
      allowNegative: true,
    });
  }

  await tx.threeDSession.update({
    where: { id: opts.sessionId },
    data: { status: "SETTLED", resultNumber: preview.resultNumber },
  });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    action: "SETTLE",
    module: "three_d",
    resourceType: "ThreeDSession",
    resourceId: opts.sessionId,
    after: preview,
  });

  return { settlement, preview };
}

export async function reopenSettlement(
  tx: Tx,
  opts: { sessionId: string; reason: string; userId: string; businessId: string }
) {
  const settlement = await tx.threeDSettlement.findUnique({
    where: { sessionId: opts.sessionId },
    include: { session: { select: { businessId: true } } },
  });
  if (!settlement || settlement.session.businessId !== opts.businessId)
    throw new ApiError(404, "No settlement found for this session");
  if (settlement.reopenedAt) throw new ApiError(422, "Settlement was already reopened");
  if (!opts.reason.trim()) throw new ApiError(422, "A reason is required to reopen a settlement");

  await reverseLedgerEntries(tx, opts.businessId, "THREE_D_SETTLE", settlement.id, opts.userId, opts.reason);

  await tx.threeDTransaction.updateMany({
    where: { sessionId: opts.sessionId, settlementStatus: "SETTLED" },
    data: { settlementStatus: "PENDING", isWinner: false, winAmount: 0n },
  });
  await tx.threeDSettlement.update({
    where: { id: settlement.id },
    data: { reopenedById: opts.userId, reopenedAt: new Date(), reopenReason: opts.reason },
  });
  await tx.threeDSession.update({
    where: { id: opts.sessionId },
    data: { status: "CLOSED", resultNumber: null },
  });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    action: "REOPEN",
    module: "three_d",
    resourceType: "ThreeDSession",
    resourceId: opts.sessionId,
    reason: opts.reason,
    before: settlement,
  });
}

/** Exposure summary per number for a session. */
export async function sessionExposure(tx: Tx, sessionId: string) {
  const txns = await tx.threeDTransaction.findMany({
    where: { sessionId, deletedAt: null, settlementStatus: { not: "CANCELLED" } },
    select: { number: true, betAmount: true, potentialPayout: true },
  });
  const map = new Map<string, { number: string; totalStake: bigint; potentialPayout: bigint; count: number }>();
  for (const t of txns) {
    const cur = map.get(t.number) ?? { number: t.number, totalStake: 0n, potentialPayout: 0n, count: 0 };
    cur.totalStake += t.betAmount;
    cur.potentialPayout += t.potentialPayout;
    cur.count++;
    map.set(t.number, cur);
  }
  return [...map.values()].sort((a, b) => (b.potentialPayout > a.potentialPayout ? 1 : -1));
}
