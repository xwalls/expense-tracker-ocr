import { prisma } from "@/lib/prisma";

export interface CreateExpenseInput {
  amount: number;
  description: string;
  categoryId: string;
  userId: string;
  date?: string;
  receipt?: string | null;
  ocrText?: string | null;
}

export interface ListExpensesFilter {
  userId: string;
  month?: number;
  year?: number;
  categoryId?: string;
}

export async function createExpense(input: CreateExpenseInput) {
  const { amount, description, categoryId, userId, date, receipt, ocrText } = input;

  if (!amount || !description || !categoryId) {
    throw new Error("Campos requeridos: amount, description, categoryId");
  }

  const expense = await prisma.expense.create({
    data: {
      amount: Number(amount),
      description,
      date: date ? new Date(date) : new Date(),
      categoryId,
      receipt: receipt || null,
      ocrText: ocrText || null,
      userId,
    },
    include: { category: true },
  });

  return expense;
}

export async function listExpenses(filter: ListExpensesFilter) {
  const { userId, month, year, categoryId } = filter;

  const where: Record<string, unknown> = { userId };

  if (month && year) {
    const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const endDate = new Date(Date.UTC(Number(year), Number(month), 1));
    where.date = { gte: startDate, lt: endDate };
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true },
    orderBy: { date: "desc" },
  });

  return expenses;
}
