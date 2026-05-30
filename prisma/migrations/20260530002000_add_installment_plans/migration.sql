CREATE TYPE "InstallmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "installmentAmount" DOUBLE PRECISION NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InstallmentPlan_userId_idx" ON "InstallmentPlan"("userId");
CREATE INDEX "InstallmentPlan_creditCardId_idx" ON "InstallmentPlan"("creditCardId");
CREATE INDEX "InstallmentPlan_categoryId_idx" ON "InstallmentPlan"("categoryId");

ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
