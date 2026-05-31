import { prisma } from "@/lib/prisma";
import type { Prisma, ReceiptDraftSource, ReceiptDraftStatus } from "@prisma/client";
import {
  buildReceiptFingerprint,
  duplicateReviewPatch,
  findReceiptDuplicateCandidate,
} from "./receipt-duplicates";

export interface ReceiptDraftInput {
  source?: ReceiptDraftSource;
  status?: ReceiptDraftStatus;
  amount?: number | null;
  description?: string | null;
  categoryId?: string | null;
  date?: string | null;
  ocrText?: string | null;
  receiptData?: Prisma.InputJsonValue | null;
  error?: string | null;
  telegramChatId?: string | null;
  telegramMessageId?: number | null;
  telegramFileUniqueId?: string | null;
}

export interface ListReceiptDraftsFilter {
  userId: string;
  status?: ReceiptDraftStatus;
}

export async function listReceiptDrafts(filter: ListReceiptDraftsFilter) {
  return prisma.receiptDraft.findMany({
    where: {
      userId: filter.userId,
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: { category: true, expense: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createReceiptDraft(userId: string, input: ReceiptDraftInput) {
  const data = normalizeReceiptDraftInput(input, true) as Prisma.ReceiptDraftUncheckedCreateInput;
  const receiptFingerprint = buildReceiptFingerprint(input);
  const duplicate = await findReceiptDuplicateCandidate(userId, receiptFingerprint);
  return prisma.receiptDraft.create({
    data: { ...data, userId, receiptFingerprint, ...duplicateReviewPatch(duplicate) },
    include: { category: true, expense: true },
  });
}

export async function updateReceiptDraft(id: string, userId: string, input: ReceiptDraftInput) {
  const existing = await prisma.receiptDraft.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const data = normalizeReceiptDraftInput(input, false);
  const receiptFingerprint = buildReceiptFingerprint({
    amount: input.amount !== undefined ? input.amount : existing.amount,
    date: input.date !== undefined ? input.date : existing.date,
    description: input.description !== undefined ? input.description : existing.description,
    receiptData: input.receiptData !== undefined ? input.receiptData : existing.receiptData,
  });
  const duplicate = await findReceiptDuplicateCandidate(userId, receiptFingerprint, id);

  return prisma.receiptDraft.update({
    where: { id },
    data: { ...data, receiptFingerprint, ...duplicateReviewPatch(duplicate) },
    include: { category: true, expense: true },
  });
}

export async function deleteReceiptDraft(id: string, userId: string) {
  const existing = await prisma.receiptDraft.findFirst({ where: { id, userId } });
  if (!existing) return null;

  await prisma.receiptDraft.delete({ where: { id } });
  return existing;
}

export async function saveReceiptDraft(id: string, userId: string) {
  const draft = await prisma.receiptDraft.findFirst({ where: { id, userId } });
  if (!draft) return null;
  if (draft.status === "SAVED") throw new Error("Este draft ya fue guardado");
  if (draft.amount == null || !draft.description || !draft.categoryId) {
    throw new Error("Completa monto, descripcion y categoria antes de guardar");
  }
  const amount = draft.amount;
  const receiptFingerprint = buildReceiptFingerprint({
    amount,
    date: draft.date,
    description: draft.description,
    receiptData: draft.receiptData,
  });
  const duplicate = await findReceiptDuplicateCandidate(userId, receiptFingerprint, id);

  if (duplicate && !draft.needsReview) {
    await prisma.receiptDraft.update({
      where: { id },
      data: { receiptFingerprint, ...duplicateReviewPatch(duplicate) },
    });
    throw new Error("Posible duplicado detectado. Revisalo antes de guardar o confirma guardar igual.");
  }

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        amount,
        description: draft.description || "Recibo escaneado",
        date: draft.date || new Date(),
        categoryId: draft.categoryId!,
        ocrText: draft.ocrText || null,
        receiptData: draft.receiptData === null ? undefined : draft.receiptData,
        receiptFingerprint,
        userId,
      },
      include: { category: true },
    });

    return tx.receiptDraft.update({
      where: { id },
      data: { status: "SAVED", expenseId: expense.id },
      include: { category: true, expense: true },
    });
  });
}

export async function findTelegramReceiptDraft(userId: string, telegramFileUniqueId: string) {
  return prisma.receiptDraft.findUnique({
    where: { userId_telegramFileUniqueId: { userId, telegramFileUniqueId } },
    include: { category: true, expense: true },
  });
}

export async function findCategoryIdByName(categoryName: string | null | undefined) {
  if (!categoryName) return null;
  const category = await prisma.category.findUnique({ where: { name: categoryName } });
  return category?.id ?? null;
}

function normalizeReceiptDraftInput(input: ReceiptDraftInput, forCreate: boolean) {
  const data: Prisma.ReceiptDraftUncheckedCreateInput | Prisma.ReceiptDraftUncheckedUpdateInput = {};

  if (forCreate || input.source !== undefined) data.source = input.source || "WEB";
  if (forCreate || input.status !== undefined) data.status = input.status || "QUEUED";

  if (forCreate || input.amount !== undefined) {
    const amount = input.amount == null || Number(input.amount) === 0 ? null : Number(input.amount);
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) throw new Error("El monto debe ser mayor a cero");
    data.amount = amount;
  }

  if (forCreate || input.date !== undefined) {
    const date = input.date ? new Date(input.date) : null;
    if (date && Number.isNaN(date.getTime())) throw new Error("La fecha no es valida");
    data.date = date;
  }

  if (forCreate || input.description !== undefined) data.description = input.description?.trim() || null;
  if (forCreate || input.categoryId !== undefined) data.categoryId = input.categoryId || null;
  if (forCreate || input.ocrText !== undefined) data.ocrText = input.ocrText || null;
  if (forCreate || input.receiptData !== undefined) data.receiptData = input.receiptData ?? undefined;
  if (forCreate || input.error !== undefined) data.error = input.error?.trim() || null;
  if (forCreate || input.telegramChatId !== undefined) data.telegramChatId = input.telegramChatId || null;
  if (forCreate || input.telegramMessageId !== undefined) data.telegramMessageId = input.telegramMessageId == null ? null : Number(input.telegramMessageId);
  if (forCreate || input.telegramFileUniqueId !== undefined) data.telegramFileUniqueId = input.telegramFileUniqueId || null;

  return data;
}
