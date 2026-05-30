import { prisma } from "@/lib/prisma";
import type { AccountType } from "@prisma/client";

export interface AccountInput {
  name: string;
  type?: AccountType;
  currentBalance: number;
  notes?: string | null;
}

export async function listAccounts(userId: string) {
  return prisma.account.findMany({
    where: { userId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

export async function createAccount(userId: string, input: AccountInput) {
  const data = normalizeAccountInput(input);
  return prisma.account.create({ data: { ...data, userId } });
}

export async function updateAccount(id: string, userId: string, input: AccountInput) {
  const existing = await prisma.account.findFirst({ where: { id, userId } });
  if (!existing) return null;

  return prisma.account.update({
    where: { id },
    data: normalizeAccountInput(input),
  });
}

export async function deleteAccount(id: string, userId: string) {
  const existing = await prisma.account.findFirst({ where: { id, userId } });
  if (!existing) return null;

  await prisma.account.delete({ where: { id } });
  return existing;
}

function normalizeAccountInput(input: AccountInput) {
  const name = input.name?.trim();
  const currentBalance = Number(input.currentBalance);

  if (!name) throw new Error("El nombre de la cuenta es requerido");
  if (!Number.isFinite(currentBalance)) throw new Error("El saldo debe ser un numero valido");

  return {
    name,
    type: input.type || "BANK",
    currentBalance,
    notes: input.notes?.trim() || null,
  };
}
