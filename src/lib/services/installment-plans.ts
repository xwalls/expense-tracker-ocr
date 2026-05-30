import { prisma } from "@/lib/prisma";
import type { InstallmentStatus } from "@prisma/client";

export interface InstallmentPlanInput {
  description: string;
  totalAmount: number;
  installmentCount: number;
  installmentAmount?: number | null;
  startMonth: number;
  startYear: number;
  creditCardId: string;
  categoryId?: string | null;
  status?: InstallmentStatus;
  notes?: string | null;
}

export async function listInstallmentPlans(userId: string) {
  return prisma.installmentPlan.findMany({
    where: { userId },
    include: { creditCard: true, category: true },
    orderBy: [{ status: "asc" }, { startYear: "desc" }, { startMonth: "desc" }],
  });
}

export async function createInstallmentPlan(userId: string, input: InstallmentPlanInput) {
  const data = await normalizeInstallmentPlanInput(userId, input);
  return prisma.installmentPlan.create({
    data: { ...data, userId },
    include: { creditCard: true, category: true },
  });
}

export async function updateInstallmentPlan(id: string, userId: string, input: InstallmentPlanInput) {
  const existing = await prisma.installmentPlan.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const data = await normalizeInstallmentPlanInput(userId, input);
  return prisma.installmentPlan.update({
    where: { id },
    data,
    include: { creditCard: true, category: true },
  });
}

export async function deleteInstallmentPlan(id: string, userId: string) {
  const existing = await prisma.installmentPlan.findFirst({ where: { id, userId } });
  if (!existing) return null;

  await prisma.installmentPlan.delete({ where: { id } });
  return existing;
}

export async function getInstallmentCommitmentSummary(userId: string, month: number, year: number) {
  const plans = await prisma.installmentPlan.findMany({
    where: { userId, status: "ACTIVE" },
    include: { creditCard: true, category: true },
  });

  const thisMonth = commitmentForMonth(plans, month, year);
  const next3Months = sumFutureMonths(plans, month, year, 3);
  const next12Months = sumFutureMonths(plans, month, year, 12);
  const activePlans = plans.filter((plan) => hasRemainingInstallments(plan, month, year));

  return {
    thisMonth,
    next3Months,
    next12Months,
    activeCount: activePlans.length,
    upcoming: activePlans
      .map((plan) => ({
        id: plan.id,
        description: plan.description,
        installmentAmount: plan.installmentAmount,
        creditCardName: plan.creditCard.name,
        remainingInstallments: remainingInstallments(plan, month, year),
      }))
      .sort((a, b) => b.installmentAmount - a.installmentAmount)
      .slice(0, 5),
  };
}

async function normalizeInstallmentPlanInput(userId: string, input: InstallmentPlanInput) {
  const description = input.description?.trim();
  const totalAmount = Number(input.totalAmount);
  const installmentCount = Number(input.installmentCount);
  const startMonth = Number(input.startMonth);
  const startYear = Number(input.startYear);
  const installmentAmount = input.installmentAmount == null || Number(input.installmentAmount) === 0
    ? totalAmount / installmentCount
    : Number(input.installmentAmount);

  if (!description) throw new Error("La descripcion es requerida");
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error("El total debe ser mayor a cero");
  if (!Number.isInteger(installmentCount) || installmentCount < 1) throw new Error("El numero de mensualidades debe ser al menos 1");
  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) throw new Error("La mensualidad debe ser mayor a cero");
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) throw new Error("El mes inicial debe estar entre 1 y 12");
  if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) throw new Error("El año inicial no es valido");

  const card = await prisma.creditCard.findFirst({ where: { id: input.creditCardId, userId } });
  if (!card) throw new Error("Tarjeta no encontrada");

  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new Error("Categoria no encontrada");
  }

  return {
    description,
    totalAmount,
    installmentCount,
    installmentAmount,
    startMonth,
    startYear,
    creditCardId: input.creditCardId,
    categoryId: input.categoryId || null,
    status: input.status || "ACTIVE",
    notes: input.notes?.trim() || null,
  };
}

function commitmentForMonth(plans: PlanLike[], month: number, year: number) {
  return plans.reduce((sum, plan) => sum + (isPlanActiveInMonth(plan, month, year) ? plan.installmentAmount : 0), 0);
}

function sumFutureMonths(plans: PlanLike[], month: number, year: number, months: number) {
  let total = 0;
  for (let offset = 0; offset < months; offset++) {
    const date = monthYearFromOffset(month, year, offset);
    total += commitmentForMonth(plans, date.month, date.year);
  }
  return total;
}

function isPlanActiveInMonth(plan: PlanLike, month: number, year: number) {
  const targetIndex = monthIndex(month, year);
  const startIndex = monthIndex(plan.startMonth, plan.startYear);
  const endIndex = startIndex + plan.installmentCount - 1;
  return targetIndex >= startIndex && targetIndex <= endIndex;
}

function hasRemainingInstallments(plan: PlanLike, month: number, year: number) {
  return remainingInstallments(plan, month, year) > 0;
}

function remainingInstallments(plan: PlanLike, month: number, year: number) {
  const targetIndex = monthIndex(month, year);
  const startIndex = monthIndex(plan.startMonth, plan.startYear);
  const endIndex = startIndex + plan.installmentCount - 1;
  if (targetIndex > endIndex) return 0;
  return endIndex - Math.max(targetIndex, startIndex) + 1;
}

function monthYearFromOffset(month: number, year: number, offset: number) {
  const index = monthIndex(month, year) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthIndex(month: number, year: number) {
  return year * 12 + (month - 1);
}

type PlanLike = {
  startMonth: number;
  startYear: number;
  installmentCount: number;
  installmentAmount: number;
};
