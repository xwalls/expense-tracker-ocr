CREATE TYPE "ReceiptDuplicateConfidence" AS ENUM ('EXACT', 'HIGH', 'MEDIUM');

ALTER TABLE "Expense" ADD COLUMN "receiptFingerprint" TEXT;

ALTER TABLE "ReceiptDraft" ADD COLUMN "receiptFingerprint" TEXT;
ALTER TABLE "ReceiptDraft" ADD COLUMN "duplicateOfExpenseId" TEXT;
ALTER TABLE "ReceiptDraft" ADD COLUMN "duplicateOfDraftId" TEXT;
ALTER TABLE "ReceiptDraft" ADD COLUMN "duplicateConfidence" "ReceiptDuplicateConfidence";
ALTER TABLE "ReceiptDraft" ADD COLUMN "duplicateReason" TEXT;
ALTER TABLE "ReceiptDraft" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Expense_userId_receiptFingerprint_idx" ON "Expense"("userId", "receiptFingerprint");
CREATE INDEX "ReceiptDraft_userId_receiptFingerprint_idx" ON "ReceiptDraft"("userId", "receiptFingerprint");
CREATE INDEX "ReceiptDraft_duplicateOfExpenseId_idx" ON "ReceiptDraft"("duplicateOfExpenseId");
CREATE INDEX "ReceiptDraft_duplicateOfDraftId_idx" ON "ReceiptDraft"("duplicateOfDraftId");
