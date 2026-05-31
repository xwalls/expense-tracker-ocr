import { prisma } from "@/lib/prisma";
import { getInstallmentCommitmentSummary } from "./installment-plans";
import { getRecurringPaymentCommitmentSummary } from "./recurring-payments";

export interface HouseholdSummaryFilter {
  userId: string;
  month?: number;
  year?: number;
}

export async function getHouseholdSummary(filter: HouseholdSummaryFilter) {
  const month = filter.month || new Date().getMonth() + 1;
  const year = filter.year || new Date().getFullYear();
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  const [accounts, creditCards, incomes, expenses, installments, recurringPayments] = await Promise.all([
    prisma.account.findMany({ where: { userId: filter.userId }, orderBy: { name: "asc" } }),
    prisma.creditCard.findMany({ where: { userId: filter.userId }, orderBy: { name: "asc" } }),
    prisma.income.findMany({ where: { userId: filter.userId, date: { gte: startDate, lt: endDate } } }),
    prisma.expense.findMany({ where: { userId: filter.userId, date: { gte: startDate, lt: endDate } } }),
    getInstallmentCommitmentSummary(filter.userId, month, year),
    getRecurringPaymentCommitmentSummary(filter.userId, month, year),
  ]);

  const availableCash = accounts.reduce((sum, account) => sum + account.currentBalance, 0);
  const creditCardDebt = creditCards.reduce((sum, card) => sum + card.currentBalance, 0);
  const creditLimit = creditCards.reduce((sum, card) => sum + (card.creditLimit || 0), 0);
  const availableCredit = creditCards.reduce((sum, card) => {
    if (card.creditLimit == null) return sum;
    return sum + Math.max(card.creditLimit - card.currentBalance, 0);
  }, 0);
  const monthlyIncome = incomes.reduce((sum, income) => sum + income.bankDeposit, 0);
  const monthlyExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return {
    availableCash,
    creditCardDebt,
    creditLimit,
    availableCredit,
    monthlyIncome,
    monthlyExpenses,
    monthlyNet: monthlyIncome - monthlyExpenses,
    committedThisMonth: installments.thisMonth,
    committedNext3Months: installments.next3Months,
    committedNext12Months: installments.next12Months,
    activeInstallmentCount: installments.activeCount,
    upcomingInstallments: installments.upcoming,
    recurringExpectedThisMonth: recurringPayments.expectedThisMonth,
    recurringPaidThisMonth: recurringPayments.paidThisMonth,
    recurringPendingThisMonth: recurringPayments.pendingThisMonth,
    recurringOverdueTotal: recurringPayments.overdueTotal,
    recurringOverdueCount: recurringPayments.overdueCount,
    activeRecurringPaymentCount: recurringPayments.activeCount,
    upcomingRecurringPayments: recurringPayments.upcoming,
    projectedFreeCash: monthlyIncome - monthlyExpenses - installments.thisMonth - recurringPayments.pendingThisMonth,
    accountCount: accounts.length,
    creditCardCount: creditCards.length,
    upcomingCardDates: buildUpcomingCardDates(creditCards),
  };
}

function buildUpcomingCardDates(cards: { id: string; name: string; cutoffDay: number; dueDay: number }[]) {
  const today = new Date();
  const dates = cards.flatMap((card) => [
    {
      cardId: card.id,
      cardName: card.name,
      type: "cutoff" as const,
      day: card.cutoffDay,
      date: nextDateForDay(today, card.cutoffDay).toISOString(),
    },
    {
      cardId: card.id,
      cardName: card.name,
      type: "due" as const,
      day: card.dueDay,
      date: nextDateForDay(today, card.dueDay).toISOString(),
    },
  ]);

  return dates
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 6);
}

function nextDateForDay(today: Date, day: number) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const currentMonthDate = safeDate(year, month, day);
  if (currentMonthDate >= startOfToday(today)) return currentMonthDate;
  return safeDate(year, month + 1, day);
}

function safeDate(year: number, month: number, day: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function startOfToday(today: Date) {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}
