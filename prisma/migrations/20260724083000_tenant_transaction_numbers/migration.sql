DROP INDEX IF EXISTS "ThreeDTransaction_txnNo_key";
DROP INDEX IF EXISTS "ExchangeTransaction_txnNo_key";
DROP INDEX IF EXISTS "WalletTransfer_txnNo_key";
DROP INDEX IF EXISTS "Receivable_txnNo_key";
DROP INDEX IF EXISTS "Payable_txnNo_key";
DROP INDEX IF EXISTS "IncomeExpense_txnNo_key";
DROP INDEX IF EXISTS "Purchase_txnNo_key";
DROP INDEX IF EXISTS "Sale_txnNo_key";

CREATE UNIQUE INDEX "ThreeDTransaction_businessId_txnNo_key"
  ON "ThreeDTransaction"("businessId", "txnNo");
CREATE UNIQUE INDEX "ExchangeTransaction_businessId_txnNo_key"
  ON "ExchangeTransaction"("businessId", "txnNo");
CREATE UNIQUE INDEX "WalletTransfer_businessId_txnNo_key"
  ON "WalletTransfer"("businessId", "txnNo");
CREATE UNIQUE INDEX "Receivable_businessId_txnNo_key"
  ON "Receivable"("businessId", "txnNo");
CREATE UNIQUE INDEX "Payable_businessId_txnNo_key"
  ON "Payable"("businessId", "txnNo");
CREATE UNIQUE INDEX "IncomeExpense_businessId_txnNo_key"
  ON "IncomeExpense"("businessId", "txnNo");
CREATE UNIQUE INDEX "Purchase_businessId_txnNo_key"
  ON "Purchase"("businessId", "txnNo");
CREATE UNIQUE INDEX "Sale_businessId_txnNo_key"
  ON "Sale"("businessId", "txnNo");
