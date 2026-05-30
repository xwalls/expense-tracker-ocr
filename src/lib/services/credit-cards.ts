import { prisma } from "@/lib/prisma";

export interface CreditCardInput {
  name: string;
  currentBalance: number;
  creditLimit?: number | null;
  cutoffDay: number;
  dueDay: number;
  minimumPayment?: number | null;
  notes?: string | null;
}

export async function listCreditCards(userId: string) {
  return prisma.creditCard.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function createCreditCard(userId: string, input: CreditCardInput) {
  const data = normalizeCreditCardInput(input);
  return prisma.creditCard.create({ data: { ...data, userId } });
}

export async function updateCreditCard(id: string, userId: string, input: CreditCardInput) {
  const existing = await prisma.creditCard.findFirst({ where: { id, userId } });
  if (!existing) return null;

  return prisma.creditCard.update({
    where: { id },
    data: normalizeCreditCardInput(input),
  });
}

export async function deleteCreditCard(id: string, userId: string) {
  const existing = await prisma.creditCard.findFirst({ where: { id, userId } });
  if (!existing) return null;

  await prisma.creditCard.delete({ where: { id } });
  return existing;
}

function normalizeCreditCardInput(input: CreditCardInput) {
  const name = input.name?.trim();
  const currentBalance = Number(input.currentBalance);
  const creditLimit = input.creditLimit == null || input.creditLimit === 0 ? null : Number(input.creditLimit);
  const minimumPayment = input.minimumPayment == null || input.minimumPayment === 0 ? null : Number(input.minimumPayment);
  const cutoffDay = Number(input.cutoffDay);
  const dueDay = Number(input.dueDay);

  if (!name) throw new Error("El nombre de la tarjeta es requerido");
  if (!Number.isFinite(currentBalance) || currentBalance < 0) {
    throw new Error("La deuda actual debe ser un numero mayor o igual a cero");
  }
  if (creditLimit != null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
    throw new Error("El limite de credito debe ser un numero mayor o igual a cero");
  }
  if (minimumPayment != null && (!Number.isFinite(minimumPayment) || minimumPayment < 0)) {
    throw new Error("El pago minimo debe ser un numero mayor o igual a cero");
  }
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
    throw new Error("El dia de corte debe estar entre 1 y 31");
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error("El dia limite de pago debe estar entre 1 y 31");
  }

  return {
    name,
    currentBalance,
    creditLimit,
    cutoffDay,
    dueDay,
    minimumPayment,
    notes: input.notes?.trim() || null,
  };
}
