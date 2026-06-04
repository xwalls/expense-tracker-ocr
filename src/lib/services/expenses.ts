import { prisma } from "@/lib/prisma";
import { logError, logInfo, newTraceId } from "@/lib/structured-logger";
import type { Prisma } from "@prisma/client";
import { buildReceiptFingerprint } from "./receipt-duplicates";

export interface CreateExpenseInput {
	amount: number;
	description: string;
	categoryId: string;
	userId: string;
	date?: string;
	receipt?: string | null;
	ocrText?: string | null;
	receiptData?: Prisma.InputJsonValue | null;
	source?: "manual" | "ocr" | "receipt-draft" | "recurring-payment" | "mcp";
	traceId?: string;
}

export interface ListExpensesFilter {
	userId: string;
	month?: number;
	year?: number;
	categoryId?: string;
}

export async function createExpense(input: CreateExpenseInput) {
	const {
		amount,
		description,
		categoryId,
		userId,
		date,
		receipt,
		ocrText,
		receiptData,
		source = "manual",
		traceId = newTraceId("expense"),
	} = input;
	const startedAt = Date.now();

	logInfo("expense", "create_started", {
		traceId,
		source,
		amount: Number(amount),
		categoryId,
		hasReceiptData: Boolean(receiptData),
		hasOcrText: Boolean(ocrText),
	});

	const normalizedAmount = Number(amount);
	const normalizedDescription =
		typeof description === "string" ? description.trim() : "";

	if (!normalizedDescription || !categoryId) {
		logInfo("expense", "create_rejected", {
			traceId,
			source,
			reason: "missing_required_fields",
			ms: Date.now() - startedAt,
		});
		throw new Error("Campos requeridos: amount, description, categoryId");
	}

	if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
		logInfo("expense", "create_rejected", {
			traceId,
			source,
			reason: "invalid_amount",
			ms: Date.now() - startedAt,
		});
		throw new Error("El monto debe ser mayor a 0");
	}

	try {
		const receiptFingerprint = buildReceiptFingerprint({
			amount: normalizedAmount,
			date,
			description: normalizedDescription,
			receiptData,
		});
		const expense = await prisma.expense.create({
			data: {
				amount: normalizedAmount,
				description: normalizedDescription,
				date: date ? new Date(date) : new Date(),
				categoryId,
				receipt: receipt || null,
				ocrText: ocrText || null,
				receiptData: receiptData ?? undefined,
				receiptFingerprint,
				userId,
			},
			include: { category: true },
		});

		logInfo("expense", "created", {
			traceId,
			source,
			expenseId: expense.id,
			amount: expense.amount,
			categoryId: expense.categoryId,
			hasReceiptData: Boolean(expense.receiptData),
			hasFingerprint: Boolean(receiptFingerprint),
			ms: Date.now() - startedAt,
		});

		return expense;
	} catch (error) {
		logError("expense", "create_failed", error, {
			traceId,
			source,
			amount: Number(amount),
			categoryId,
			ms: Date.now() - startedAt,
		});
		throw error;
	}
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
