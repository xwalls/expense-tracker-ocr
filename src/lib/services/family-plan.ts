import { prisma } from "@/lib/prisma";
import { listRecurringPaymentOccurrences } from "./recurring-payments";
import type { MonthlyPlanEnvelopeType, Prisma } from "@prisma/client";

const GROCERY_CATEGORY_NAME = "Despensa / súper";
const DEFAULT_WEEK_COUNT = 4;
const MAX_NOTE_LENGTH = 1000;
const MAX_LABEL_LENGTH = 80;

type EnvelopePatch = {
	categoryId?: unknown;
	plannedAmount?: unknown;
	weeklyAmount?: unknown;
	weekCount?: unknown;
	sortOrder?: unknown;
	notes?: unknown;
	label?: unknown;
};

export interface FamilyPlanUpdateInput {
	month: number;
	year: number;
	plannedLiquidIncome?: unknown;
	plannedVoucherIncome?: unknown;
	notes?: unknown;
	envelopes?: EnvelopePatch[];
}

export interface FamilyPlanPeriod {
	month: number;
	year: number;
}

export function validateFamilyPlanPeriod(
	month: unknown,
	year: unknown,
): FamilyPlanPeriod {
	const normalizedMonth = Number(month);
	const normalizedYear = Number(year);

	if (
		!Number.isInteger(normalizedMonth) ||
		normalizedMonth < 1 ||
		normalizedMonth > 12
	) {
		throw new Error("El mes debe estar entre 1 y 12");
	}
	if (
		!Number.isInteger(normalizedYear) ||
		normalizedYear < 2000 ||
		normalizedYear > 2100
	) {
		throw new Error("El año no es valido");
	}

	return { month: normalizedMonth, year: normalizedYear };
}

export function validateFamilyPlanMoney(value: unknown, fieldName: string) {
	if (typeof value !== "number" && typeof value !== "string") {
		throw new Error(`${fieldName} debe ser un monto mayor o igual a 0`);
	}

	if (typeof value === "string" && value.trim() === "") {
		throw new Error(`${fieldName} debe ser un monto mayor o igual a 0`);
	}

	const amount = Number(value);
	if (!Number.isFinite(amount) || amount < 0) {
		throw new Error(`${fieldName} debe ser un monto mayor o igual a 0`);
	}
	return amount;
}

export function validateFamilyPlanNotes(
	value: unknown,
	fieldName = "Las notas",
) {
	if (value == null) return null;
	if (typeof value !== "string")
		throw new Error(`${fieldName} deben ser texto`);

	const notes = value.trim();
	if (notes.length > MAX_NOTE_LENGTH)
		throw new Error(
			`${fieldName} no pueden exceder ${MAX_NOTE_LENGTH} caracteres`,
		);
	return notes || null;
}

export async function getFamilyPlanSummary(
	userId: string,
	period: FamilyPlanPeriod,
) {
	const { month, year } = validateFamilyPlanPeriod(period.month, period.year);
	const groceryCategory = await ensureGroceryCategory();
	const { plan } = await getOrCreatePlan(
		userId,
		month,
		year,
		groceryCategory.id,
	);
	await ensureGroceryEnvelope(plan.id, userId, month, year, groceryCategory.id);

	const [planWithEnvelopes, incomes, recurringOccurrences, installmentPlans] =
		await Promise.all([
			getPlanWithEnvelopes(plan.id),
			prisma.income.findMany({
				where: { userId, date: monthDateRange(month, year) },
			}),
			listRecurringPaymentOccurrences(userId, month, year),
			prisma.installmentPlan.findMany({
				where: { userId, status: "ACTIVE" },
				include: { category: true, creditCard: true },
			}),
		]);

	if (!planWithEnvelopes) throw new Error("No se pudo cargar el plan familiar");

	const actualLiquidIncome = sum(incomes.map((income) => income.bankDeposit));
	const actualVoucherIncome = sum(incomes.map((income) => income.despensa));
	const billableRecurring = recurringOccurrences.filter(
		(occurrence) => occurrence.status !== "SKIPPED",
	);
	const linkedRecurringExpenseIds = recurringOccurrences
		.map((occurrence) => occurrence.expenseId)
		.filter((id): id is string => Boolean(id));
	const housingMonthly = sum(
		billableRecurring
			.filter(
				(occurrence) =>
					occurrence.recurringPayment.type === "RENT" ||
					occurrence.recurringPayment.type === "MAINTENANCE",
			)
			.map((occurrence) => occurrence.amount),
	);
	const otherRecurring = sum(
		billableRecurring
			.filter(
				(occurrence) =>
					occurrence.recurringPayment.type !== "RENT" &&
					occurrence.recurringPayment.type !== "MAINTENANCE",
			)
			.map((occurrence) => occurrence.amount),
	);
	const activeInstallments = installmentPlans.filter((plan) =>
		isInstallmentActiveInMonth(plan, month, year),
	);
	const installmentCommitments = sum(
		activeInstallments.map((plan) => plan.installmentAmount),
	);
	const fixedCommitments =
		housingMonthly + otherRecurring + installmentCommitments;
	const envelopeActuals = await getEnvelopeActuals(
		userId,
		month,
		year,
		planWithEnvelopes.envelopes.map((envelope) => envelope.categoryId),
		linkedRecurringExpenseIds,
	);
	const groceryEnvelope = planWithEnvelopes.envelopes.find(
		(envelope) => envelope.type === "GROCERIES",
	);
	const groceryActual = groceryEnvelope
		? envelopeActuals.get(groceryEnvelope.categoryId) || 0
		: 0;
	const groceryPlanned = groceryEnvelope?.plannedAmount || 0;
	const plannedVoucherCoverage = Math.min(
		planWithEnvelopes.plannedVoucherIncome,
		groceryPlanned,
	);
	const actualVoucherCoverage = Math.min(actualVoucherIncome, groceryActual);
	const plannedLiquidEnvelopeUse = sum(
		planWithEnvelopes.envelopes.map((envelope) =>
			envelope.type === "GROCERIES"
				? Math.max(envelope.plannedAmount - plannedVoucherCoverage, 0)
				: envelope.plannedAmount,
		),
	);
	const actualLiquidEnvelopeUse = sum(
		planWithEnvelopes.envelopes.map((envelope) => {
			const actualAmount = envelopeActuals.get(envelope.categoryId) || 0;
			return envelope.type === "GROCERIES"
				? Math.max(actualAmount - actualVoucherCoverage, 0)
				: actualAmount;
		}),
	);

	return {
		id: planWithEnvelopes.id,
		month,
		year,
		plannedLiquidIncome: roundCurrency(planWithEnvelopes.plannedLiquidIncome),
		plannedVoucherIncome: roundCurrency(planWithEnvelopes.plannedVoucherIncome),
		notes: planWithEnvelopes.notes,
		createdAt: planWithEnvelopes.createdAt.toISOString(),
		updatedAt: planWithEnvelopes.updatedAt.toISOString(),
		incomes: {
			plannedLiquid: roundCurrency(planWithEnvelopes.plannedLiquidIncome),
			actualLiquid: roundCurrency(actualLiquidIncome),
			liquidDelta: roundCurrency(
				actualLiquidIncome - planWithEnvelopes.plannedLiquidIncome,
			),
			plannedVoucher: roundCurrency(planWithEnvelopes.plannedVoucherIncome),
			actualVoucher: roundCurrency(actualVoucherIncome),
			voucherDelta: roundCurrency(
				actualVoucherIncome - planWithEnvelopes.plannedVoucherIncome,
			),
		},
		commitments: {
			housingMonthly: roundCurrency(housingMonthly),
			housingAnnual: roundCurrency(housingMonthly * 12),
			otherRecurring: roundCurrency(otherRecurring),
			installments: roundCurrency(installmentCommitments),
			fixedTotal: roundCurrency(fixedCommitments),
			recurring: billableRecurring.map((occurrence) => ({
				id: occurrence.id,
				description: occurrence.recurringPayment.description,
				amount: roundCurrency(occurrence.amount),
				status: occurrence.status,
				type: occurrence.recurringPayment.type,
				categoryId: occurrence.recurringPayment.categoryId,
				categoryName: occurrence.recurringPayment.category.name,
				expenseId: occurrence.expenseId,
			})),
			installmentPlans: activeInstallments.map((plan) => ({
				id: plan.id,
				description: plan.description,
				amount: roundCurrency(plan.installmentAmount),
				categoryId: plan.categoryId,
				categoryName: plan.category?.name || null,
				creditCardId: plan.creditCardId,
				creditCardName: plan.creditCard.name,
			})),
		},
		voucher: {
			groceryCategoryId: groceryCategory.id,
			groceryCategoryName: groceryCategory.name,
			plannedCoverageForGroceries: roundCurrency(plannedVoucherCoverage),
			actualCoverageForGroceries: roundCurrency(actualVoucherCoverage),
			plannedGroceryLiquidRemainder: roundCurrency(
				Math.max(groceryPlanned - plannedVoucherCoverage, 0),
			),
			actualGroceryLiquidRemainder: roundCurrency(
				Math.max(groceryActual - actualVoucherCoverage, 0),
			),
		},
		envelopes: planWithEnvelopes.envelopes.map((envelope) => {
			const actualAmount = envelopeActuals.get(envelope.categoryId) || 0;
			const voucherCoverage =
				envelope.type === "GROCERIES" ? actualVoucherCoverage : 0;
			return {
				id: envelope.id,
				categoryId: envelope.categoryId,
				categoryName: envelope.category.name,
				type: envelope.type,
				label: envelope.label,
				plannedAmount: roundCurrency(envelope.plannedAmount),
				weeklyAmount: roundCurrency(envelope.weeklyAmount),
				weekCount: envelope.weekCount,
				sortOrder: envelope.sortOrder,
				notes: envelope.notes,
				actualAmount: roundCurrency(actualAmount),
				voucherCoverage: roundCurrency(voucherCoverage),
				actualLiquidAmount: roundCurrency(
					Math.max(actualAmount - voucherCoverage, 0),
				),
				remainingAmount: roundCurrency(envelope.plannedAmount - actualAmount),
			};
		}),
		projected: {
			plannedLiquidEnvelopeUse: roundCurrency(plannedLiquidEnvelopeUse),
			actualLiquidEnvelopeUse: roundCurrency(actualLiquidEnvelopeUse),
			projectedLiquidFreeCash: roundCurrency(
				planWithEnvelopes.plannedLiquidIncome -
					fixedCommitments -
					plannedLiquidEnvelopeUse,
			),
			actualLiquidFreeCash: roundCurrency(
				actualLiquidIncome - fixedCommitments - actualLiquidEnvelopeUse,
			),
		},
	};
}

export async function updateFamilyPlan(
	userId: string,
	input: FamilyPlanUpdateInput,
) {
	const { month, year } = validateFamilyPlanPeriod(input.month, input.year);
	const updateData: Prisma.MonthlyFamilyPlanUpdateInput = {};

	if (input.plannedLiquidIncome !== undefined) {
		updateData.plannedLiquidIncome = validateFamilyPlanMoney(
			input.plannedLiquidIncome,
			"El ingreso líquido planeado",
		);
	}
	if (input.plannedVoucherIncome !== undefined) {
		updateData.plannedVoucherIncome = validateFamilyPlanMoney(
			input.plannedVoucherIncome,
			"El ingreso planeado de vales",
		);
	}
	if (input.notes !== undefined)
		updateData.notes = validateFamilyPlanNotes(input.notes);

	const groceryCategory = await ensureGroceryCategory();
	const normalizedEnvelopes = input.envelopes
		? await normalizeEnvelopePatches(input.envelopes, groceryCategory.id)
		: null;
	const { plan } = await getOrCreatePlan(
		userId,
		month,
		year,
		groceryCategory.id,
	);
	await ensureGroceryEnvelope(plan.id, userId, month, year, groceryCategory.id);
	const operations: Prisma.PrismaPromise<unknown>[] = [];

	if (Object.keys(updateData).length > 0) {
		operations.push(
			prisma.monthlyFamilyPlan.update({
				where: { id: plan.id },
				data: updateData,
			}),
		);
	}

	if (normalizedEnvelopes) {
		const providedCategoryIds = normalizedEnvelopes.map(
			(envelope) => envelope.categoryId,
		);
		operations.push(
			prisma.monthlyPlanEnvelope.deleteMany({
				where: {
					planId: plan.id,
					type: "VARIABLE",
					categoryId: { notIn: providedCategoryIds },
				},
			}),
		);
		for (const envelope of normalizedEnvelopes) {
			operations.push(
				prisma.monthlyPlanEnvelope.upsert({
					where: {
						planId_categoryId: {
							planId: plan.id,
							categoryId: envelope.categoryId,
						},
					},
					update: envelope,
					create: { ...envelope, planId: plan.id },
				}),
			);
		}
	}

	if (operations.length > 0) await prisma.$transaction(operations);
	return getFamilyPlanSummary(userId, { month, year });
}

async function normalizeEnvelopePatches(
	envelopes: EnvelopePatch[],
	groceryCategoryId: string,
) {
	if (!Array.isArray(envelopes))
		throw new Error("Los sobres deben enviarse como lista");
	const categoryIds = envelopes.map((envelope) =>
		String(envelope.categoryId || ""),
	);
	if (categoryIds.some((categoryId) => !categoryId))
		throw new Error("La categoria del sobre es requerida");
	if (new Set(categoryIds).size !== categoryIds.length)
		throw new Error("No se permiten categorias duplicadas en los sobres");
	if (!categoryIds.includes(groceryCategoryId))
		throw new Error("El sobre de despensa no se puede eliminar");

	const categories = await prisma.category.findMany({
		where: { id: { in: categoryIds } },
	});
	const categoriesById = new Map(
		categories.map((category) => [category.id, category]),
	);
	const missingCategory = categoryIds.find(
		(categoryId) => !categoriesById.has(categoryId),
	);
	if (missingCategory) throw new Error("Categoria no encontrada");

	return envelopes.map((envelope, index) => {
		const categoryId = String(envelope.categoryId);
		const category = categoriesById.get(categoryId);
		if (!category) throw new Error("Categoria no encontrada");
		const plannedAmount = validateFamilyPlanMoney(
			envelope.plannedAmount,
			"El monto planeado del sobre",
		);
		const weekCount =
			envelope.weekCount === undefined
				? DEFAULT_WEEK_COUNT
				: Number(envelope.weekCount);
		if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 6) {
			throw new Error("Las semanas del sobre deben estar entre 1 y 6");
		}
		const weeklyAmount =
			envelope.weeklyAmount === undefined
				? plannedAmount / weekCount
				: validateFamilyPlanMoney(
						envelope.weeklyAmount,
						"El monto semanal del sobre",
					);
		const sortOrder =
			envelope.sortOrder === undefined ? index : Number(envelope.sortOrder);
		if (!Number.isInteger(sortOrder) || sortOrder < 0)
			throw new Error("El orden del sobre no es valido");
		const label = validateEnvelopeLabel(
			envelope.label,
			category.name,
			categoryId === groceryCategoryId,
		);

		return {
			categoryId,
			type: (categoryId === groceryCategoryId
				? "GROCERIES"
				: "VARIABLE") as MonthlyPlanEnvelopeType,
			label,
			plannedAmount,
			weeklyAmount,
			weekCount,
			sortOrder,
			notes: validateFamilyPlanNotes(envelope.notes, "Las notas del sobre"),
		};
	});
}

function validateEnvelopeLabel(
	value: unknown,
	fallback: string,
	isGrocery: boolean,
) {
	if (isGrocery) return GROCERY_CATEGORY_NAME;
	if (value == null) return fallback;
	if (typeof value !== "string")
		throw new Error("La etiqueta del sobre debe ser texto");
	const label = value.trim();
	if (!label) return fallback;
	if (label.length > MAX_LABEL_LENGTH)
		throw new Error(
			`La etiqueta del sobre no puede exceder ${MAX_LABEL_LENGTH} caracteres`,
		);
	return label;
}

async function ensureGroceryCategory() {
	return prisma.category.upsert({
		where: { name: GROCERY_CATEGORY_NAME },
		update: {},
		create: {
			name: GROCERY_CATEGORY_NAME,
			icon: "shopping-cart",
			color: "#16a34a",
		},
	});
}

async function getOrCreatePlan(
	userId: string,
	month: number,
	year: number,
	groceryCategoryId: string,
) {
	const existing = await prisma.monthlyFamilyPlan.findUnique({
		where: { userId_month_year: { userId, month, year } },
	});
	if (existing) return { plan: existing, created: false };

	const previousPeriod = previousMonth(month, year);
	const previousPlan = await prisma.monthlyFamilyPlan.findUnique({
		where: {
			userId_month_year: {
				userId,
				month: previousPeriod.month,
				year: previousPeriod.year,
			},
		},
		include: {
			envelopes: {
				include: { category: true },
				orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
			},
		},
	});

	try {
		const plan = await prisma.monthlyFamilyPlan.create({
			data: {
				userId,
				month,
				year,
				plannedLiquidIncome: previousPlan?.plannedLiquidIncome || 0,
				plannedVoucherIncome: previousPlan?.plannedVoucherIncome || 0,
				notes: previousPlan?.notes || null,
			},
		});
		await seedInitialEnvelopes(
			plan.id,
			userId,
			month,
			year,
			groceryCategoryId,
			previousPlan?.envelopes || [],
		);
		return { plan, created: true };
	} catch (error) {
		if (!hasPrismaCode(error, "P2002")) throw error;
		const plan = await prisma.monthlyFamilyPlan.findUniqueOrThrow({
			where: { userId_month_year: { userId, month, year } },
		});
		return { plan, created: false };
	}
}

async function seedInitialEnvelopes(
	planId: string,
	userId: string,
	month: number,
	year: number,
	groceryCategoryId: string,
	previousEnvelopes: PreviousEnvelope[],
) {
	const budgets = await prisma.budget.findMany({
		where: { userId, month, year },
		include: { category: true },
		orderBy: { createdAt: "asc" },
	});
	const budgetRows = budgets.map((budget, index) => ({
		categoryId: budget.categoryId,
		label: budget.category.name,
		plannedAmount: budget.amount,
		weeklyAmount: budget.amount / DEFAULT_WEEK_COUNT,
		weekCount: DEFAULT_WEEK_COUNT,
		sortOrder: index,
		notes: null,
	}));
	const previousRows = previousEnvelopes.map((envelope) => ({
		categoryId: envelope.categoryId,
		label: envelope.label || envelope.category.name,
		plannedAmount: envelope.plannedAmount,
		weeklyAmount: envelope.weeklyAmount,
		weekCount: envelope.weekCount,
		sortOrder: envelope.sortOrder,
		notes: envelope.notes,
	}));
	const seedRows = budgetRows.length > 0 ? budgetRows : previousRows;
	const grocerySeed =
		budgetRows.find((row) => row.categoryId === groceryCategoryId) ||
		previousRows.find((row) => row.categoryId === groceryCategoryId);

	await prisma.monthlyPlanEnvelope.createMany({
		data: [
			{
				planId,
				categoryId: groceryCategoryId,
				type: "GROCERIES",
				label: GROCERY_CATEGORY_NAME,
				plannedAmount: grocerySeed?.plannedAmount || 0,
				weeklyAmount: grocerySeed?.weeklyAmount || 0,
				weekCount: grocerySeed?.weekCount || DEFAULT_WEEK_COUNT,
				sortOrder: 0,
				notes: grocerySeed?.notes || null,
			},
			...seedRows
				.filter((row) => row.categoryId !== groceryCategoryId)
				.map((row, index) => ({
					planId,
					categoryId: row.categoryId,
					type: "VARIABLE" as MonthlyPlanEnvelopeType,
					label: row.label,
					plannedAmount: row.plannedAmount,
					weeklyAmount: row.weeklyAmount,
					weekCount: row.weekCount,
					sortOrder: index + 1,
					notes: row.notes,
				})),
		],
		skipDuplicates: true,
	});
}

async function ensureGroceryEnvelope(
	planId: string,
	userId: string,
	month: number,
	year: number,
	groceryCategoryId: string,
) {
	const budget = await prisma.budget.findUnique({
		where: {
			userId_categoryId_month_year: {
				userId,
				categoryId: groceryCategoryId,
				month,
				year,
			},
		},
	});
	return prisma.monthlyPlanEnvelope.upsert({
		where: { planId_categoryId: { planId, categoryId: groceryCategoryId } },
		update: { type: "GROCERIES", label: GROCERY_CATEGORY_NAME },
		create: {
			planId,
			categoryId: groceryCategoryId,
			type: "GROCERIES",
			label: GROCERY_CATEGORY_NAME,
			plannedAmount: budget?.amount || 0,
			weeklyAmount: budget ? budget.amount / DEFAULT_WEEK_COUNT : 0,
			weekCount: DEFAULT_WEEK_COUNT,
			sortOrder: 0,
		},
	});
}

async function getPlanWithEnvelopes(planId: string) {
	return prisma.monthlyFamilyPlan.findUnique({
		where: { id: planId },
		include: {
			envelopes: {
				include: { category: true },
				orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
			},
		},
	});
}

async function getEnvelopeActuals(
	userId: string,
	month: number,
	year: number,
	categoryIds: string[],
	linkedRecurringExpenseIds: string[],
) {
	if (categoryIds.length === 0) return new Map<string, number>();
	const expenses = await prisma.expense.findMany({
		where: {
			userId,
			categoryId: { in: categoryIds },
			date: monthDateRange(month, year),
			...(linkedRecurringExpenseIds.length > 0
				? { id: { notIn: linkedRecurringExpenseIds } }
				: {}),
		},
		select: { categoryId: true, amount: true },
	});

	const totals = new Map<string, number>();
	for (const expense of expenses) {
		totals.set(
			expense.categoryId,
			(totals.get(expense.categoryId) || 0) + expense.amount,
		);
	}
	return totals;
}

function monthDateRange(month: number, year: number) {
	return {
		gte: new Date(Date.UTC(year, month - 1, 1)),
		lt: new Date(Date.UTC(year, month, 1)),
	};
}

function isInstallmentActiveInMonth(
	plan: InstallmentWindow,
	month: number,
	year: number,
) {
	const targetIndex = monthIndex(month, year);
	const startIndex = monthIndex(plan.startMonth, plan.startYear);
	return (
		targetIndex >= startIndex &&
		targetIndex <= startIndex + plan.installmentCount - 1
	);
}

function previousMonth(month: number, year: number) {
	if (month === 1) return { month: 12, year: year - 1 };
	return { month: month - 1, year };
}

function monthIndex(month: number, year: number) {
	return year * 12 + (month - 1);
}

function sum(values: number[]) {
	return values.reduce((total, value) => total + value, 0);
}

function roundCurrency(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hasPrismaCode(error: unknown, code: string) {
	if (typeof error !== "object" || error === null) return false;
	return "code" in error && error.code === code;
}

type InstallmentWindow = {
	startMonth: number;
	startYear: number;
	installmentCount: number;
};

type PreviousEnvelope = {
	categoryId: string;
	label: string;
	plannedAmount: number;
	weeklyAmount: number;
	weekCount: number;
	sortOrder: number;
	notes: string | null;
	category: { name: string };
};
