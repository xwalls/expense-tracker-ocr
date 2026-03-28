import { prisma } from "@/lib/prisma";
import type { IncomeSource } from "@prisma/client";

export interface CreateIncomeInput {
  amount: number;
  bankDeposit: number;
  despensa?: number;
  description: string;
  source?: IncomeSource;
  date?: string;
  periodStart?: string;
  periodEnd?: string;
  cfdiUuid?: string;
  cfdiXml?: string;
  employer?: string;
  userId: string;
}

export interface ListIncomeFilter {
  userId: string;
  month?: number;
  year?: number;
  source?: IncomeSource;
}

export interface IncomeSummary {
  totalAmount: number;
  totalBankDeposit: number;
  totalDespensa: number;
  count: number;
  bySource: { source: string; total: number; count: number }[];
  monthly: { month: number; totalAmount: number; totalBankDeposit: number; count: number }[];
}

export async function createIncome(input: CreateIncomeInput) {
  const {
    amount,
    bankDeposit,
    despensa = 0,
    description,
    source,
    date,
    periodStart,
    periodEnd,
    cfdiUuid,
    cfdiXml,
    employer,
    userId,
  } = input;

  if (amount == null || !description) {
    throw new Error("Campos requeridos: amount, description");
  }

  // Enforce bankDeposit invariant: bankDeposit must equal amount - despensa
  const expectedBankDeposit = amount - despensa;
  if (Math.abs(bankDeposit - expectedBankDeposit) > 0.01) {
    throw new Error(
      `bankDeposit (${bankDeposit}) debe ser amount (${amount}) - despensa (${despensa}) = ${expectedBankDeposit}`
    );
  }

  const income = await prisma.income.create({
    data: {
      amount: Number(amount),
      bankDeposit: Number(bankDeposit),
      despensa: Number(despensa),
      description,
      source: source || "OTRO",
      date: date ? new Date(date) : new Date(),
      periodStart: periodStart ? new Date(periodStart) : null,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      cfdiUuid: cfdiUuid || null,
      cfdiXml: cfdiXml || null,
      employer: employer || null,
      userId,
    },
  });

  return income;
}

export async function listIncome(filter: ListIncomeFilter) {
  const { userId, month, year, source } = filter;

  const where: Record<string, unknown> = { userId };

  if (month && year) {
    const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const endDate = new Date(Date.UTC(Number(year), Number(month), 1));
    where.date = { gte: startDate, lt: endDate };
  }

  if (source) {
    where.source = source;
  }

  const incomes = await prisma.income.findMany({
    where,
    orderBy: { date: "desc" },
  });

  const totalAmount = incomes.reduce((sum, i) => sum + i.amount, 0);
  const totalBankDeposit = incomes.reduce((sum, i) => sum + i.bankDeposit, 0);

  return { incomes, totalAmount, totalBankDeposit };
}

export async function getIncomeById(id: string, userId: string) {
  return prisma.income.findFirst({ where: { id, userId } });
}

export async function deleteIncome(id: string, userId: string) {
  const income = await prisma.income.findFirst({ where: { id, userId } });
  if (!income) return null;
  await prisma.income.delete({ where: { id } });
  return income;
}

export async function checkDuplicateUuid(cfdiUuid: string) {
  return prisma.income.findUnique({ where: { cfdiUuid } });
}

export async function getIncomeSummary(filter: {
  userId: string;
  year: number;
}): Promise<IncomeSummary> {
  const { userId, year } = filter;

  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year + 1, 0, 1));

  const incomes = await prisma.income.findMany({
    where: { userId, date: { gte: startDate, lt: endDate } },
  });

  const totalAmount = incomes.reduce((sum, i) => sum + i.amount, 0);
  const totalBankDeposit = incomes.reduce((sum, i) => sum + i.bankDeposit, 0);
  const totalDespensa = incomes.reduce((sum, i) => sum + i.despensa, 0);
  const count = incomes.length;

  // Group by source
  const sourceMap = new Map<string, { total: number; count: number }>();
  for (const income of incomes) {
    const key = income.source;
    const existing = sourceMap.get(key) || { total: 0, count: 0 };
    sourceMap.set(key, { total: existing.total + income.amount, count: existing.count + 1 });
  }

  const bySource = Array.from(sourceMap.entries()).map(([source, data]) => ({
    source,
    total: data.total,
    count: data.count,
  }));

  // Monthly breakdown — only months with records
  const monthlyMap = new Map<number, { totalAmount: number; totalBankDeposit: number; count: number }>();
  for (const income of incomes) {
    const month = income.date.getMonth() + 1;
    const existing = monthlyMap.get(month) || { totalAmount: 0, totalBankDeposit: 0, count: 0 };
    monthlyMap.set(month, {
      totalAmount: existing.totalAmount + income.amount,
      totalBankDeposit: existing.totalBankDeposit + income.bankDeposit,
      count: existing.count + 1,
    });
  }

  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([month, data]) => ({ month, ...data }));

  return { totalAmount, totalBankDeposit, totalDespensa, count, bySource, monthly };
}
