import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type ReceiptItemLike = {
  quantity?: number | null;
  unit?: string | null;
  sku?: string | null;
  description?: string | null;
  unitPrice?: number | null;
  total?: number | null;
};

type ReceiptDataLike = {
  merchant?: string | null;
  total?: number | null;
  ticketNumber?: string | null;
  items?: ReceiptItemLike[];
};

export interface ReceiptFingerprintInput {
  amount?: number | null;
  date?: string | Date | null;
  description?: string | null;
  receiptData?: Prisma.JsonValue | Prisma.InputJsonValue | null;
}

export interface ReceiptDuplicateCandidate {
  confidence: "EXACT";
  reason: string;
  expenseId: string | null;
  draftId: string | null;
}

export function buildReceiptFingerprint(input: ReceiptFingerprintInput) {
  const receiptData = asReceiptData(input.receiptData);
  const items = (receiptData?.items || []).map(normalizeItem).filter(Boolean).sort();
  const amount = cents(input.amount ?? receiptData?.total ?? null);

  if (items.length === 0 || amount == null) return null;

  const payload = [
    normalizeText(receiptData?.merchant || input.description || ""),
    normalizeDate(input.date),
    amount,
    normalizeText(receiptData?.ticketNumber || ""),
    items.length,
    ...items,
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

export async function findReceiptDuplicateCandidate(
  userId: string,
  receiptFingerprint: string | null,
  excludeDraftId?: string,
) {
  if (!receiptFingerprint) return null;

  const expense = await prisma.expense.findFirst({
    where: { userId, receiptFingerprint },
    orderBy: { createdAt: "desc" },
  });
  if (expense) return duplicateCandidate("expense", expense.id);

  const draft = await prisma.receiptDraft.findFirst({
    where: {
      userId,
      receiptFingerprint,
      status: { not: "SAVED" },
      ...(excludeDraftId ? { id: { not: excludeDraftId } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (draft) return duplicateCandidate("draft", draft.id);

  return null;
}

export function duplicateReviewPatch(candidate: ReceiptDuplicateCandidate | null) {
  if (!candidate) {
    return {
      duplicateOfExpenseId: null,
      duplicateOfDraftId: null,
      duplicateConfidence: null,
      duplicateReason: null,
      needsReview: false,
    };
  }

  return {
    duplicateOfExpenseId: candidate.expenseId,
    duplicateOfDraftId: candidate.draftId,
    duplicateConfidence: candidate.confidence,
    duplicateReason: candidate.reason,
    needsReview: true,
  };
}

function duplicateCandidate(type: "expense" | "draft", id: string): ReceiptDuplicateCandidate {
  return {
    confidence: "EXACT",
    reason: type === "expense"
      ? "Mismo total y misma lista normalizada de productos que un gasto existente."
      : "Mismo total y misma lista normalizada de productos que otro draft pendiente.",
    expenseId: type === "expense" ? id : null,
    draftId: type === "draft" ? id : null,
  };
}

function normalizeItem(item: ReceiptItemLike) {
  const description = normalizeText(item.description || "");
  const sku = normalizeText(item.sku || "");
  const quantity = quantityKey(item.quantity ?? null);
  const unit = normalizeUnit(item.unit || "");
  const unitPrice = cents(item.unitPrice ?? null);
  const total = cents(item.total ?? null);

  if (!description && !sku && total == null) return null;
  return [description, sku, quantity, unit, unitPrice ?? "", total ?? ""].join("~");
}

function asReceiptData(value: unknown): ReceiptDataLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ReceiptDataLike;
}

function cents(value: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100);
}

function quantityKey(value: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeUnit(value: string) {
  const unit = normalizeText(value);
  if (["pieza", "pza", "pz", "unidad", "un"].includes(unit)) return "pza";
  if (["kilogramo", "kilogramos", "kgs"].includes(unit)) return "kg";
  if (["gramo", "gramos", "gr"].includes(unit)) return "g";
  if (["litro", "litros", "lts"].includes(unit)) return "l";
  return unit;
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
