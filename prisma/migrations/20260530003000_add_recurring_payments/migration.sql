CREATE TYPE "RecurringPaymentType" AS ENUM ('RENT', 'SERVICE', 'MAINTENANCE', 'SUBSCRIPTION', 'OTHER');

CREATE TYPE "RecurringPaymentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

CREATE TYPE "RecurringPaymentOccurrenceStatus" AS ENUM ('PENDING', 'PAID', 'SKIPPED', 'OVERDUE');

CREATE TABLE "RecurringPayment" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "RecurringPaymentType" NOT NULL DEFAULT 'OTHER',
    "dueDay" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endMonth" INTEGER,
    "endYear" INTEGER,
    "status" "RecurringPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringPaymentOccurrence" (
    "id" TEXT NOT NULL,
    "recurringPaymentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "RecurringPaymentOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPaymentOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecurringPayment_userId_idx" ON "RecurringPayment"("userId");
CREATE INDEX "RecurringPayment_categoryId_idx" ON "RecurringPayment"("categoryId");
CREATE UNIQUE INDEX "RecurringPaymentOccurrence_expenseId_key" ON "RecurringPaymentOccurrence"("expenseId");
CREATE UNIQUE INDEX "RecurringPaymentOccurrence_recurringPaymentId_month_year_key" ON "RecurringPaymentOccurrence"("recurringPaymentId", "month", "year");
CREATE INDEX "RecurringPaymentOccurrence_userId_year_month_idx" ON "RecurringPaymentOccurrence"("userId", "year", "month");
CREATE INDEX "RecurringPaymentOccurrence_recurringPaymentId_idx" ON "RecurringPaymentOccurrence"("recurringPaymentId");
CREATE INDEX "RecurringPaymentOccurrence_expenseId_idx" ON "RecurringPaymentOccurrence"("expenseId");

ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringPaymentOccurrence" ADD CONSTRAINT "RecurringPaymentOccurrence_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES "RecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringPaymentOccurrence" ADD CONSTRAINT "RecurringPaymentOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringPaymentOccurrence" ADD CONSTRAINT "RecurringPaymentOccurrence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
