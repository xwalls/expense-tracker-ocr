import { prisma } from "@/lib/prisma";
import type { RecurringPaymentOccurrenceStatus, RecurringPaymentStatus, RecurringPaymentType } from "@prisma/client";

export interface RecurringPaymentInput {
  description: string;
  amount: number;
  type?: RecurringPaymentType;
  dueDay: number;
  startMonth: number;
  startYear: number;
  endMonth?: number | null;
  endYear?: number | null;
  categoryId: string;
  status?: RecurringPaymentStatus;
  notes?: string | null;
}

export interface PayRecurringPaymentOccurrenceInput {
  amount?: number | null;
  paidAt?: string | null;
}

const paymentTypes: RecurringPaymentType[] = ["RENT", "SERVICE", "MAINTENANCE", "SUBSCRIPTION", "OTHER"];
const paymentStatuses: RecurringPaymentStatus[] = ["ACTIVE", "PAUSED", "CANCELLED"];

export async function listRecurringPayments(userId: string) {
  return prisma.recurringPayment.findMany({
    where: { userId },
    include: { category: true },
    orderBy: [{ status: "asc" }, { dueDay: "asc" }, { description: "asc" }],
  });
}

export async function createRecurringPayment(userId: string, input: RecurringPaymentInput) {
  const data = await normalizeRecurringPaymentInput(input);
  return prisma.recurringPayment.create({
    data: { ...data, userId },
    include: { category: true },
  });
}

export async function updateRecurringPayment(id: string, userId: string, input: RecurringPaymentInput) {
  const existing = await prisma.recurringPayment.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const data = await normalizeRecurringPaymentInput(input);
  return prisma.recurringPayment.update({
    where: { id },
    data,
    include: { category: true },
  });
}

export async function deleteRecurringPayment(id: string, userId: string) {
  const existing = await prisma.recurringPayment.findFirst({ where: { id, userId } });
  if (!existing) return null;

  await prisma.recurringPayment.delete({ where: { id } });
  return existing;
}

export async function listRecurringPaymentOccurrences(userId: string, month: number, year: number) {
  validateMonthYear(month, year);
  await generateRecurringPaymentOccurrences(userId, month, year);
  await refreshOverdueOccurrences(userId, month, year);

  return prisma.recurringPaymentOccurrence.findMany({
    where: { userId, month, year },
    include: { recurringPayment: { include: { category: true } }, expense: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function markRecurringPaymentOccurrencePaid(
  id: string,
  userId: string,
  input: PayRecurringPaymentOccurrenceInput = {},
) {
  const occurrence = await prisma.recurringPaymentOccurrence.findFirst({
    where: { id, userId },
    include: { recurringPayment: { include: { category: true } } },
  });
  if (!occurrence) return null;
  if (occurrence.status === "PAID") throw new Error("Este pago ya fue marcado como pagado");

  const amount = input.amount == null || Number(input.amount) === 0 ? occurrence.amount : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto pagado debe ser mayor a cero");

  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error("La fecha de pago no es valida");

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        amount,
        description: `Pago recurrente: ${occurrence.recurringPayment.description}`,
        date: paidAt,
        categoryId: occurrence.recurringPayment.categoryId,
        userId,
      },
      include: { category: true },
    });

    return tx.recurringPaymentOccurrence.update({
      where: { id },
      data: {
        amount,
        status: "PAID",
        paidAt,
        expenseId: expense.id,
      },
      include: { recurringPayment: { include: { category: true } }, expense: true },
    });
  });
}

export async function getRecurringPaymentCommitmentSummary(userId: string, month: number, year: number) {
  const [payments, occurrences] = await Promise.all([
    prisma.recurringPayment.findMany({ where: { userId, status: "ACTIVE" } }),
    listRecurringPaymentOccurrences(userId, month, year),
  ]);

  const billable = occurrences.filter((occurrence) => occurrence.status !== "SKIPPED");
  const pending = occurrences.filter((occurrence) => occurrence.status === "PENDING" || occurrence.status === "OVERDUE");
  const overdue = occurrences.filter((occurrence) => occurrence.status === "OVERDUE");
  const paid = occurrences.filter((occurrence) => occurrence.status === "PAID");

  return {
    expectedThisMonth: sumOccurrences(billable),
    paidThisMonth: sumOccurrences(paid),
    pendingThisMonth: sumOccurrences(pending),
    overdueTotal: sumOccurrences(overdue),
    overdueCount: overdue.length,
    activeCount: payments.filter((payment) => isPaymentActiveInMonth(payment, month, year)).length,
    upcoming: pending.slice(0, 5).map((occurrence) => ({
      id: occurrence.id,
      description: occurrence.recurringPayment.description,
      amount: occurrence.amount,
      dueDate: occurrence.dueDate.toISOString(),
      status: occurrence.status,
      type: occurrence.recurringPayment.type,
      categoryName: occurrence.recurringPayment.category.name,
    })),
  };
}

async function normalizeRecurringPaymentInput(input: RecurringPaymentInput) {
  const description = input.description?.trim();
  const amount = Number(input.amount);
  const dueDay = Number(input.dueDay);
  const startMonth = Number(input.startMonth);
  const startYear = Number(input.startYear);
  const endMonth = input.endMonth == null || Number(input.endMonth) === 0 ? null : Number(input.endMonth);
  const endYear = input.endYear == null || Number(input.endYear) === 0 ? null : Number(input.endYear);
  const type = input.type || "OTHER";
  const status = input.status || "ACTIVE";

  if (!description) throw new Error("La descripcion es requerida");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto debe ser mayor a cero");
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error("El dia de pago debe estar entre 1 y 31");
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) throw new Error("El mes inicial debe estar entre 1 y 12");
  if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) throw new Error("El año inicial no es valido");
  if (!paymentTypes.includes(type)) throw new Error("Tipo de pago recurrente no valido");
  if (!paymentStatuses.includes(status)) throw new Error("Estado de pago recurrente no valido");
  if (!input.categoryId) throw new Error("La categoria es requerida");
  if ((endMonth && !endYear) || (!endMonth && endYear)) throw new Error("Completa mes y año final");
  if (endMonth && (!Number.isInteger(endMonth) || endMonth < 1 || endMonth > 12)) throw new Error("El mes final debe estar entre 1 y 12");
  if (endYear && (!Number.isInteger(endYear) || endYear < 2000 || endYear > 2100)) throw new Error("El año final no es valido");
  if (endMonth && endYear && monthIndex(endMonth, endYear) < monthIndex(startMonth, startYear)) throw new Error("La fecha final no puede ser anterior a la inicial");

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new Error("Categoria no encontrada");

  return {
    description,
    amount,
    type,
    dueDay,
    startMonth,
    startYear,
    endMonth,
    endYear,
    categoryId: input.categoryId,
    status,
    notes: input.notes?.trim() || null,
  };
}

async function generateRecurringPaymentOccurrences(userId: string, month: number, year: number) {
  const payments = await prisma.recurringPayment.findMany({ where: { userId, status: "ACTIVE" } });
  const activePayments = payments.filter((payment) => isPaymentActiveInMonth(payment, month, year));

  for (const payment of activePayments) {
    const dueDate = safeDateUtc(year, month, payment.dueDay);
    const existing = await prisma.recurringPaymentOccurrence.findUnique({
      where: { recurringPaymentId_month_year: { recurringPaymentId: payment.id, month, year } },
    });

    if (!existing) {
      await prisma.recurringPaymentOccurrence.create({
        data: {
          recurringPaymentId: payment.id,
          userId,
          month,
          year,
          amount: payment.amount,
          dueDate,
        },
      });
      continue;
    }

    if (existing.status === "PENDING" || existing.status === "OVERDUE") {
      await prisma.recurringPaymentOccurrence.update({
        where: { id: existing.id },
        data: {
          amount: payment.amount,
          dueDate,
          status: dueDate >= startOfTodayUtc() ? "PENDING" : existing.status,
        },
      });
    }
  }
}

async function refreshOverdueOccurrences(userId: string, month: number, year: number) {
  await prisma.recurringPaymentOccurrence.updateMany({
    where: { userId, month, year, status: "PENDING", dueDate: { lt: startOfTodayUtc() } },
    data: { status: "OVERDUE" },
  });
}

function sumOccurrences(occurrences: { amount: number }[]) {
  return occurrences.reduce((sum, occurrence) => sum + occurrence.amount, 0);
}

function isPaymentActiveInMonth(payment: PaymentWindow, month: number, year: number) {
  const targetIndex = monthIndex(month, year);
  const startIndex = monthIndex(payment.startMonth, payment.startYear);
  if (targetIndex < startIndex) return false;
  if (payment.endMonth && payment.endYear) return targetIndex <= monthIndex(payment.endMonth, payment.endYear);
  return true;
}

function validateMonthYear(month: number, year: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("El mes debe estar entre 1 y 12");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("El año no es valido");
}

function safeDateUtc(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

function startOfTodayUtc() {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function monthIndex(month: number, year: number) {
  return year * 12 + (month - 1);
}

type PaymentWindow = {
  startMonth: number;
  startYear: number;
  endMonth: number | null;
  endYear: number | null;
};

export type RecurringPaymentUpcomingStatus = Extract<RecurringPaymentOccurrenceStatus, "PENDING" | "OVERDUE">;
