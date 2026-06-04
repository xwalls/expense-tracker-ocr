-- CreateEnum
CREATE TYPE "MonthlyPlanEnvelopeType" AS ENUM ('GROCERIES', 'VARIABLE');

-- CreateTable
CREATE TABLE "MonthlyFamilyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "plannedLiquidIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedVoucherIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyFamilyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPlanEnvelope" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "MonthlyPlanEnvelopeType" NOT NULL DEFAULT 'VARIABLE',
    "label" TEXT NOT NULL,
    "plannedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weeklyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekCount" INTEGER NOT NULL DEFAULT 4,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlanEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyFamilyPlan_userId_month_year_key" ON "MonthlyFamilyPlan"("userId", "month", "year");

-- CreateIndex
CREATE INDEX "MonthlyFamilyPlan_userId_year_month_idx" ON "MonthlyFamilyPlan"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPlanEnvelope_planId_categoryId_key" ON "MonthlyPlanEnvelope"("planId", "categoryId");

-- CreateIndex
CREATE INDEX "MonthlyPlanEnvelope_planId_sortOrder_idx" ON "MonthlyPlanEnvelope"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "MonthlyPlanEnvelope_categoryId_idx" ON "MonthlyPlanEnvelope"("categoryId");

-- AddForeignKey
ALTER TABLE "MonthlyFamilyPlan" ADD CONSTRAINT "MonthlyFamilyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlanEnvelope" ADD CONSTRAINT "MonthlyPlanEnvelope_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MonthlyFamilyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlanEnvelope" ADD CONSTRAINT "MonthlyPlanEnvelope_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
