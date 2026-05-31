CREATE TYPE "TelegramConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TYPE "ReceiptDraftSource" AS ENUM ('WEB', 'TELEGRAM');

CREATE TYPE "ReceiptDraftStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'ERROR', 'SAVED');

CREATE TABLE "TelegramConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "status" "TelegramConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramPairingCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPairingCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptDraft" (
    "id" TEXT NOT NULL,
    "source" "ReceiptDraftSource" NOT NULL DEFAULT 'WEB',
    "status" "ReceiptDraftStatus" NOT NULL DEFAULT 'QUEUED',
    "amount" DOUBLE PRECISION,
    "description" TEXT,
    "date" TIMESTAMP(3),
    "ocrText" TEXT,
    "receiptData" JSONB,
    "error" TEXT,
    "telegramChatId" TEXT,
    "telegramMessageId" INTEGER,
    "telegramFileUniqueId" TEXT,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramConnection_userId_key" ON "TelegramConnection"("userId");
CREATE UNIQUE INDEX "TelegramConnection_chatId_key" ON "TelegramConnection"("chatId");
CREATE INDEX "TelegramConnection_status_idx" ON "TelegramConnection"("status");
CREATE UNIQUE INDEX "TelegramPairingCode_code_key" ON "TelegramPairingCode"("code");
CREATE INDEX "TelegramPairingCode_userId_idx" ON "TelegramPairingCode"("userId");
CREATE INDEX "TelegramPairingCode_expiresAt_idx" ON "TelegramPairingCode"("expiresAt");
CREATE UNIQUE INDEX "ReceiptDraft_expenseId_key" ON "ReceiptDraft"("expenseId");
CREATE UNIQUE INDEX "ReceiptDraft_userId_telegramFileUniqueId_key" ON "ReceiptDraft"("userId", "telegramFileUniqueId");
CREATE INDEX "ReceiptDraft_userId_status_idx" ON "ReceiptDraft"("userId", "status");
CREATE INDEX "ReceiptDraft_source_idx" ON "ReceiptDraft"("source");
CREATE INDEX "ReceiptDraft_categoryId_idx" ON "ReceiptDraft"("categoryId");
CREATE INDEX "ReceiptDraft_expenseId_idx" ON "ReceiptDraft"("expenseId");

ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramPairingCode" ADD CONSTRAINT "TelegramPairingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceiptDraft" ADD CONSTRAINT "ReceiptDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceiptDraft" ADD CONSTRAINT "ReceiptDraft_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReceiptDraft" ADD CONSTRAINT "ReceiptDraft_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
