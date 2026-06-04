"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EnvelopeType = "GROCERIES" | "VARIABLE";

type Category = {
	id: string;
	name: string;
	color?: string;
	icon?: string;
};

type FamilyPlanEnvelope = {
	id: string;
	categoryId: string;
	categoryName: string;
	type: EnvelopeType;
	label: string;
	plannedAmount: number;
	weeklyAmount: number;
	weekCount: number;
	sortOrder: number;
	notes: string | null;
	actualAmount: number;
	voucherCoverage: number;
	actualLiquidAmount: number;
	remainingAmount: number;
};

type FamilyPlanSummary = {
	id: string;
	month: number;
	year: number;
	plannedLiquidIncome: number;
	plannedVoucherIncome: number;
	notes: string | null;
	incomes: {
		plannedLiquid: number;
		actualLiquid: number;
		liquidDelta: number;
		plannedVoucher: number;
		actualVoucher: number;
		voucherDelta: number;
	};
	commitments: {
		housingMonthly: number;
		housingAnnual: number;
		otherRecurring: number;
		installments: number;
		fixedTotal: number;
		recurring: Array<{
			id: string;
			description: string;
			amount: number;
			status: string;
			type: string;
			categoryName: string;
		}>;
		installmentPlans: Array<{
			id: string;
			description: string;
			amount: number;
			categoryName: string | null;
			creditCardName: string;
		}>;
	};
	voucher: {
		groceryCategoryId: string;
		groceryCategoryName: string;
		plannedCoverageForGroceries: number;
		actualCoverageForGroceries: number;
		plannedGroceryLiquidRemainder: number;
		actualGroceryLiquidRemainder: number;
	};
	envelopes: FamilyPlanEnvelope[];
	projected: {
		plannedLiquidEnvelopeUse: number;
		actualLiquidEnvelopeUse: number;
		projectedLiquidFreeCash: number;
		actualLiquidFreeCash: number;
	};
};

type EnvelopeDraft = {
	categoryId: string;
	categoryName: string;
	type: EnvelopeType;
	label: string;
	plannedAmount: string;
	weeklyAmount: string;
	weekCount: string;
	sortOrder: number;
	notes: string;
	actualAmount: number;
	voucherCoverage: number;
	actualLiquidAmount: number;
	remainingAmount: number;
};

type PlanDraft = {
	plannedLiquidIncome: string;
	plannedVoucherIncome: string;
	notes: string;
	envelopes: EnvelopeDraft[];
};

const monthNames = [
	"Enero",
	"Febrero",
	"Marzo",
	"Abril",
	"Mayo",
	"Junio",
	"Julio",
	"Agosto",
	"Septiembre",
	"Octubre",
	"Noviembre",
	"Diciembre",
];

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 9 }, (_, index) => currentYear - 4 + index);

export default function FamilyPlanPage() {
	const now = new Date();
	const [month, setMonth] = useState(now.getMonth() + 1);
	const [year, setYear] = useState(now.getFullYear());
	const [plan, setPlan] = useState<FamilyPlanSummary | null>(null);
	const [draft, setDraft] = useState<PlanDraft | null>(null);
	const [categories, setCategories] = useState<Category[]>([]);
	const [newCategoryId, setNewCategoryId] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	const loadPlan = useCallback(async () => {
		setLoading(true);
		setError("");
		setSuccess("");
		try {
			const [planRes, categoriesRes] = await Promise.all([
				fetch(`/api/family-plan?month=${month}&year=${year}`),
				fetch("/api/categories"),
			]);
			const planData = await planRes.json();
			const categoriesData = await categoriesRes.json();

			if (!planRes.ok) {
				setError(planData.error || "No se pudo cargar el plan familiar");
				return;
			}
			if (!categoriesRes.ok) {
				setError(categoriesData.error || "No se pudieron cargar las categorias");
				return;
			}

			setPlan(planData);
			setDraft(summaryToDraft(planData));
			setCategories(Array.isArray(categoriesData) ? categoriesData : []);
		} catch {
			setError("No se pudo conectar con el servidor");
		} finally {
			setLoading(false);
		}
	}, [month, year]);

	useEffect(() => {
		loadPlan();
	}, [loadPlan]);

	const envelopeTotals = useMemo(() => {
		const rows = draft?.envelopes ?? [];
		return rows.reduce(
			(total, envelope) => {
				const planned = toNumber(envelope.plannedAmount);
				return {
					planned: total.planned + planned,
					actual: total.actual + envelope.actualAmount,
					remaining: total.remaining + (planned - envelope.actualAmount),
				};
			},
			{ planned: 0, actual: 0, remaining: 0 },
		);
	}, [draft?.envelopes]);

	const usedCategoryIds = new Set(draft?.envelopes.map((e) => e.categoryId) ?? []);
	const availableCategories = categories.filter((category) => !usedCategoryIds.has(category.id));
	const overEnvelopeCount = draft?.envelopes.filter((e) => e.actualAmount > toNumber(e.plannedAmount)).length ?? 0;
	const hasMissingPlannedIncome = draft ? toNumber(draft.plannedLiquidIncome) <= 0 : false;
	const projectedFreeCash = plan?.projected.projectedLiquidFreeCash ?? 0;

	function prevMonth() {
		if (month === 1) {
			setMonth(12);
			setYear(year - 1);
		} else {
			setMonth(month - 1);
		}
	}

	function nextMonth() {
		if (month === 12) {
			setMonth(1);
			setYear(year + 1);
		} else {
			setMonth(month + 1);
		}
	}

	function updateDraft(field: keyof Omit<PlanDraft, "envelopes">, value: string) {
		setDraft((current) => (current ? { ...current, [field]: value } : current));
	}

	function updateEnvelope(index: number, field: keyof EnvelopeDraft, value: string) {
		setDraft((current) => {
			if (!current) return current;
			const envelopes = current.envelopes.map((envelope, envelopeIndex) =>
				envelopeIndex === index ? { ...envelope, [field]: value } : envelope,
			);
			return { ...current, envelopes };
		});
	}

	function addEnvelope() {
		if (!newCategoryId || !draft) return;
		const category = categories.find((item) => item.id === newCategoryId);
		if (!category) return;
		setDraft({
			...draft,
			envelopes: [
				...draft.envelopes,
				{
					categoryId: category.id,
					categoryName: category.name,
					type: "VARIABLE",
					label: category.name,
					plannedAmount: "0",
					weeklyAmount: "0",
					weekCount: "4",
					sortOrder: draft.envelopes.length,
					notes: "",
					actualAmount: 0,
					voucherCoverage: 0,
					actualLiquidAmount: 0,
					remainingAmount: 0,
				},
			],
		});
		setNewCategoryId("");
	}

	function removeEnvelope(categoryId: string) {
		if (!draft || categoryId === plan?.voucher.groceryCategoryId) return;
		setDraft({
			...draft,
			envelopes: draft.envelopes.filter((envelope) => envelope.categoryId !== categoryId),
		});
	}

	async function handleSave(event: React.FormEvent) {
		event.preventDefault();
		if (!draft) return;

		const plannedLiquidIncome = parseRequiredAmount(draft.plannedLiquidIncome);
		const plannedVoucherIncome = parseRequiredAmount(draft.plannedVoucherIncome);
		if (plannedLiquidIncome === null || plannedVoucherIncome === null) {
			setError("Captura montos válidos para ingreso líquido y vales de despensa");
			return;
		}

		const envelopes = [];
		for (const [index, envelope] of draft.envelopes.entries()) {
			const plannedAmount = parseRequiredAmount(envelope.plannedAmount);
			const weeklyAmount = parseRequiredAmount(envelope.weeklyAmount);
			const weekCount = Number(envelope.weekCount);
			if (
				plannedAmount === null ||
				weeklyAmount === null ||
				!Number.isInteger(weekCount) ||
				weekCount < 1 ||
				weekCount > 6
			) {
				setError("Captura montos y semanas válidas en todos los sobres");
				return;
			}

			envelopes.push({
				categoryId: envelope.categoryId,
				plannedAmount,
				weeklyAmount,
				weekCount,
				sortOrder: index,
				notes: envelope.notes,
				label: envelope.label,
			});
		}

		setSaving(true);
		setError("");
		setSuccess("");
		try {
			const res = await fetch(`/api/family-plan?month=${month}&year=${year}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					plannedLiquidIncome,
					plannedVoucherIncome,
					notes: draft.notes,
					envelopes,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				setError(data.error || "No se pudo guardar el plan familiar");
				return;
			}
			setPlan(data);
			setDraft(summaryToDraft(data));
			setSuccess("Plan familiar guardado");
		} catch {
			setError("No se pudo conectar con el servidor");
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="space-y-4 animate-pulse">
				<div className="h-8 w-56 rounded-lg bg-gray-200 dark:bg-white/5" />
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{[1, 2, 3].map((item) => (
						<div key={item} className="h-32 rounded-xl bg-gray-200 dark:bg-white/5" />
					))}
				</div>
				<div className="h-96 rounded-xl bg-gray-200 dark:bg-white/5" />
			</div>
		);
	}

	if (!draft || !plan) {
		return (
			<div className="space-y-4">
				<div>
					<h1 className="text-xl font-bold text-gray-900 dark:text-white">Plan familiar</h1>
					<p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
						Un solo pool familiar de ingresos, vales y sobres flexibles.
					</p>
				</div>
				<Alert tone="red" message={error || "No se pudo cargar el plan familiar"} />
				<button
					type="button"
					onClick={loadPlan}
					className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
				>
					Reintentar
				</button>
			</div>
		);
	}

	return (
		<form onSubmit={handleSave} className="space-y-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<div>
					<h1 className="text-xl font-bold text-gray-900 dark:text-white">Plan familiar</h1>
					<p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
						Un solo pool familiar de ingresos, vales y sobres flexibles.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2 sm:ml-auto">
					<button type="button" onClick={prevMonth} className="rounded-lg border border-gray-200 px-3 py-2 text-lg leading-none text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/8 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Mes anterior">
						‹
					</button>
					<select
						value={month}
						onChange={(event) => setMonth(Number(event.target.value))}
						className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 dark:border-white/8 dark:bg-[#0f1523] dark:text-gray-100"
					>
						{monthNames.map((name, index) => (
							<option key={name} value={index + 1}>
								{name}
							</option>
						))}
					</select>
					<select
						value={year}
						onChange={(event) => setYear(Number(event.target.value))}
						className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 dark:border-white/8 dark:bg-[#0f1523] dark:text-gray-100"
					>
						{yearOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
					<button type="button" onClick={nextMonth} className="rounded-lg border border-gray-200 px-3 py-2 text-lg leading-none text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/8 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Mes siguiente">
						›
					</button>
					<button
						type="submit"
						disabled={saving}
						className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{saving ? "Guardando..." : "Guardar plan"}
					</button>
				</div>
			</div>

			{error ? <Alert tone="red" message={error} /> : null}
			{success ? <Alert tone="emerald" message={success} /> : null}
			{hasMissingPlannedIncome ? (
				<Alert tone="amber" message="Falta capturar el ingreso líquido planeado para este mes." />
			) : null}
			{projectedFreeCash < 0 ? (
				<Alert tone="red" message="El efectivo libre líquido proyectado está en negativo." />
			) : null}
			{overEnvelopeCount > 0 ? (
				<Alert tone="amber" message={`${overEnvelopeCount} sobre${overEnvelopeCount > 1 ? "s" : ""} exceden el monto planeado.`} />
			) : null}

			<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
				<SummaryCard
					label="Ingreso líquido"
					value={formatMoney(plan.incomes.actualLiquid)}
					hint={`Planeado ${formatMoney(plan.incomes.plannedLiquid)}`}
					tone={plan.incomes.liquidDelta >= 0 ? "emerald" : "red"}
				/>
				<SummaryCard
					label="Vales de despensa"
					value={formatMoney(plan.incomes.actualVoucher)}
					hint={`Planeado ${formatMoney(plan.incomes.plannedVoucher)}`}
					tone={plan.incomes.voucherDelta >= 0 ? "emerald" : "amber"}
				/>
				<SummaryCard
					label="Vivienda"
					value={formatMoney(plan.commitments.housingMonthly)}
					hint={`Anual ${formatMoney(plan.commitments.housingAnnual)}`}
					tone="blue"
				/>
				<SummaryCard
					label="Libre líquido proy."
					value={formatMoney(plan.projected.projectedLiquidFreeCash)}
					hint={`Real ${formatMoney(plan.projected.actualLiquidFreeCash)}`}
					tone={plan.projected.projectedLiquidFreeCash >= 0 ? "emerald" : "red"}
				/>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
				<section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#141e2e] xl:col-span-2">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Entradas planeadas</p>
							<h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">Ingreso familiar compartido</h2>
						</div>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Field
							label="Ingreso líquido planeado"
							value={draft.plannedLiquidIncome}
							onChange={(value) => updateDraft("plannedLiquidIncome", value)}
						/>
						<Field
							label="Vales de despensa planeados"
							value={draft.plannedVoucherIncome}
							onChange={(value) => updateDraft("plannedVoucherIncome", value)}
						/>
					</div>
					<label className="mt-4 block">
						<span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Notas del mes</span>
						<textarea
							value={draft.notes}
							onChange={(event) => updateDraft("notes", event.target.value)}
							rows={3}
							className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 dark:border-white/8 dark:bg-[#0f1523] dark:text-gray-100 min-h-24"
							placeholder="Prioridades, acuerdos o recordatorios del plan"
						/>
					</label>
				</section>

				<section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#141e2e]">
					<p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Cobertura de vales</p>
					<h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">Despensa / súper</h2>
					<div className="mt-4 space-y-3">
						<MetricRow label="Vales aplicados a despensa (planeado)" value={formatMoney(plan.voucher.plannedCoverageForGroceries)} />
						<MetricRow label="Vales aplicados a despensa (real)" value={formatMoney(plan.voucher.actualCoverageForGroceries)} />
						<MetricRow label="Necesidad líquida planeada" value={formatMoney(plan.voucher.plannedGroceryLiquidRemainder)} />
						<MetricRow label="Remanente líquido real" value={formatMoney(plan.voucher.actualGroceryLiquidRemainder)} />
					</div>
				</section>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#141e2e]">
					<p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Compromisos fijos</p>
					<h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">Recurrentes y mensualidades</h2>
					<div className="mt-4 space-y-3">
						<MetricRow label="Otros recurrentes" value={formatMoney(plan.commitments.otherRecurring)} />
						<MetricRow label="Mensualidades" value={formatMoney(plan.commitments.installments)} />
						<MetricRow label="Total fijo" value={formatMoney(plan.commitments.fixedTotal)} strong />
					</div>
				</section>

				<section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#141e2e] lg:col-span-2">
					<p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Proyección líquida</p>
					<h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">Uso de efectivo libre</h2>
					<div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
						<InlineStat label="Sobres planeados" value={formatMoney(plan.projected.plannedLiquidEnvelopeUse)} />
						<InlineStat label="Sobres reales" value={formatMoney(plan.projected.actualLiquidEnvelopeUse)} />
						<InlineStat label="Libre proyectado" value={formatMoney(plan.projected.projectedLiquidFreeCash)} negative={plan.projected.projectedLiquidFreeCash < 0} />
					</div>
				</section>
			</div>

			<section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#141e2e]">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Sobres flexibles</p>
						<h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">Planeado, real y restante</h2>
					</div>
					<div className="grid grid-cols-3 gap-2 text-right text-xs">
						<InlineStat label="Planeado" value={formatMoney(envelopeTotals.planned)} />
						<InlineStat label="Real" value={formatMoney(envelopeTotals.actual)} />
						<InlineStat label="Restante" value={formatMoney(envelopeTotals.remaining)} negative={envelopeTotals.remaining < 0} />
					</div>
				</div>

				<div className="mt-4 flex flex-col sm:flex-row gap-2">
					<select value={newCategoryId} onChange={(event) => setNewCategoryId(event.target.value)} className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 dark:border-white/8 dark:bg-[#0f1523] dark:text-gray-100">
						<option value="">Agregar sobre por categoría</option>
						{availableCategories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
					<button type="button" onClick={addEnvelope} disabled={!newCategoryId} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/8 dark:text-gray-200 dark:hover:bg-white/5">
						Agregar sobre
					</button>
				</div>

				<div className="mt-4 space-y-3">
					{draft.envelopes.length === 0 ? (
						<div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
							No hay sobres configurados para este mes.
						</div>
					) : (
						draft.envelopes.map((envelope, index) => {
							const plannedAmount = toNumber(envelope.plannedAmount);
							const remaining = plannedAmount - envelope.actualAmount;
							const isGrocery = envelope.categoryId === plan.voucher.groceryCategoryId || envelope.type === "GROCERIES";
							return (
								<div key={envelope.categoryId} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/5 dark:bg-white/[0.03]">
									<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
										<div>
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="font-semibold text-gray-900 dark:text-white">
													{isGrocery ? "Despensa / súper" : envelope.label}
												</h3>
												{isGrocery ? <Badge>Requerido</Badge> : null}
											</div>
											<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Categoría: {envelope.categoryName}</p>
										</div>
										{!isGrocery ? (
											<button type="button" onClick={() => removeEnvelope(envelope.categoryId)} className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400">
												Quitar
											</button>
										) : null}
									</div>

									<div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
										<Field label="Planeado" value={envelope.plannedAmount} onChange={(value) => updateEnvelope(index, "plannedAmount", value)} />
										<Field label="Monto semanal" value={envelope.weeklyAmount} onChange={(value) => updateEnvelope(index, "weeklyAmount", value)} />
										<Field label="Semanas" value={envelope.weekCount} onChange={(value) => updateEnvelope(index, "weekCount", value)} min="1" max="6" step="1" />
										<div className="rounded-lg bg-white px-3 py-2 dark:bg-[#0f1523]">
											<p className="text-xs text-gray-500 dark:text-gray-400">Real / restante</p>
											<p className={`text-sm font-semibold tabular-nums ${remaining < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
												{formatMoney(envelope.actualAmount)} / {formatMoney(remaining)}
											</p>
										</div>
									</div>
									<label className="mt-3 block">
										<span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Notas del sobre</span>
										<input value={envelope.notes} onChange={(event) => updateEnvelope(index, "notes", event.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 dark:border-white/8 dark:bg-[#0f1523] dark:text-gray-100" placeholder="Opcional" />
									</label>
								</div>
							);
						})
					)}
				</div>
			</section>
		</form>
	);
}

function summaryToDraft(summary: FamilyPlanSummary): PlanDraft {
	return {
		plannedLiquidIncome: String(summary.plannedLiquidIncome ?? 0),
		plannedVoucherIncome: String(summary.plannedVoucherIncome ?? 0),
		notes: summary.notes ?? "",
		envelopes: summary.envelopes.map((envelope) => ({
			categoryId: envelope.categoryId,
			categoryName: envelope.categoryName,
			type: envelope.type,
			label: envelope.label || envelope.categoryName,
			plannedAmount: String(envelope.plannedAmount ?? 0),
			weeklyAmount: String(envelope.weeklyAmount ?? 0),
			weekCount: String(envelope.weekCount ?? 4),
			sortOrder: envelope.sortOrder,
			notes: envelope.notes ?? "",
			actualAmount: envelope.actualAmount,
			voucherCoverage: envelope.voucherCoverage,
			actualLiquidAmount: envelope.actualLiquidAmount,
			remainingAmount: envelope.remainingAmount,
		})),
	};
}

function Field({ label, value, onChange, min = "0", max, step = "0.01" }: { label: string; value: string; onChange: (value: string) => void; min?: string; max?: string; step?: string }) {
	return (
		<label className="block">
			<span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
			<input
				type="number"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 dark:border-white/8 dark:bg-[#0f1523] dark:text-gray-100"
			/>
		</label>
	);
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "emerald" | "red" | "amber" | "blue" }) {
	const toneClass = {
		emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
		red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
		amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
		blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
	}[tone];

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#141e2e]">
			<p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
			<p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
			<span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${toneClass}`}>{hint}</span>
		</div>
	);
}

function MetricRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5">
			<span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
			<span className={`${strong ? "text-base" : "text-sm"} font-semibold tabular-nums text-gray-900 dark:text-white`}>{value}</span>
		</div>
	);
}

function InlineStat({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
	return (
		<div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5">
			<p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
			<p className={`text-sm font-semibold tabular-nums ${negative ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{value}</p>
		</div>
	);
}

function Alert({ tone, message }: { tone: "red" | "amber" | "emerald"; message: string }) {
	const className = {
		red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
		amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
		emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
	}[tone];
	return <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${className}`}>{message}</div>;
}

function Badge({ children }: { children: React.ReactNode }) {
	return <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">{children}</span>;
}

function formatMoney(value: number) {
	return new Intl.NumberFormat("es-MX", {
		style: "currency",
		currency: "MXN",
		maximumFractionDigits: 2,
	}).format(value || 0);
}

function toNumber(value: string) {
	const amount = Number(value);
	return Number.isFinite(amount) ? amount : 0;
}

function parseRequiredAmount(value: string) {
	if (value.trim() === "") return null;
	const amount = Number(value);
	return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
