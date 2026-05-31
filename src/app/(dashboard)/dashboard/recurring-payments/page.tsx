"use client";

import { useEffect, useState } from "react";

type RecurringPaymentType = "RENT" | "SERVICE" | "MAINTENANCE" | "SUBSCRIPTION" | "OTHER";
type RecurringPaymentStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
type OccurrenceStatus = "PENDING" | "PAID" | "SKIPPED" | "OVERDUE";

interface CategoryOption {
  id: string;
  name: string;
}

interface RecurringPayment {
  id: string;
  description: string;
  amount: number;
  type: RecurringPaymentType;
  dueDay: number;
  startMonth: number;
  startYear: number;
  endMonth: number | null;
  endYear: number | null;
  status: RecurringPaymentStatus;
  notes: string | null;
  category: { id: string; name: string; color: string };
}

interface RecurringPaymentOccurrence {
  id: string;
  amount: number;
  dueDate: string;
  month: number;
  year: number;
  status: OccurrenceStatus;
  paidAt: string | null;
  recurringPayment: RecurringPayment;
}

const emptyForm = {
  description: "",
  amount: "",
  type: "SERVICE" as RecurringPaymentType,
  dueDay: "1",
  startMonth: String(new Date().getMonth() + 1),
  startYear: String(new Date().getFullYear()),
  endMonth: "",
  endYear: "",
  categoryId: "",
  status: "ACTIVE" as RecurringPaymentStatus,
  notes: "",
};

const inputClass = "w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500";
const monthShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function RecurringPaymentsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [occurrences, setOccurrences] = useState<RecurringPaymentOccurrence[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/recurring-payments").then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/recurring-payments/occurrences?month=${month}&year=${year}`).then((res) => (res.ok ? res.json() : [])),
      fetch("/api/categories").then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([paymentsData, occurrencesData, categoriesData]) => {
        if (cancelled) return;
        setPayments(paymentsData);
        setOccurrences(occurrencesData);
        setCategories(categoriesData);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, year]);

  async function loadData() {
    const [paymentsRes, occurrencesRes] = await Promise.all([
      fetch("/api/recurring-payments"),
      fetch(`/api/recurring-payments/occurrences?month=${month}&year=${year}`),
    ]);
    if (paymentsRes.ok) setPayments(await paymentsRes.json());
    if (occurrencesRes.ok) setOccurrences(await occurrencesRes.json());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      description: form.description,
      amount: Number(form.amount),
      type: form.type,
      dueDay: Number(form.dueDay),
      startMonth: Number(form.startMonth),
      startYear: Number(form.startYear),
      endMonth: form.endMonth ? Number(form.endMonth) : null,
      endYear: form.endYear ? Number(form.endYear) : null,
      categoryId: form.categoryId,
      status: form.status,
      notes: form.notes || null,
    };

    const res = await fetch(editingId ? `/api/recurring-payments/${editingId}` : "/api/recurring-payments", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "No se pudo guardar el pago recurrente");
      setSaving(false);
      return;
    }

    setForm(emptyForm);
    setEditingId(null);
    await loadData();
    setSaving(false);
  }

  async function deletePayment(id: string) {
    if (!confirm("Eliminar este pago recurrente?")) return;
    await fetch(`/api/recurring-payments/${id}`, { method: "DELETE" });
    await loadData();
  }

  async function markPaid(occurrence: RecurringPaymentOccurrence) {
    if (!confirm(`Marcar como pagado ${occurrence.recurringPayment.description}?`)) return;
    setError("");
    const res = await fetch(`/api/recurring-payments/occurrences/${occurrence.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "No se pudo marcar como pagado");
      return;
    }

    await loadData();
  }

  function editPayment(payment: RecurringPayment) {
    setEditingId(payment.id);
    setForm({
      description: payment.description,
      amount: String(payment.amount),
      type: payment.type,
      dueDay: String(payment.dueDay),
      startMonth: String(payment.startMonth),
      startYear: String(payment.startYear),
      endMonth: payment.endMonth ? String(payment.endMonth) : "",
      endYear: payment.endYear ? String(payment.endYear) : "",
      categoryId: payment.category.id,
      status: payment.status,
      notes: payment.notes || "",
    });
  }

  function prevMonth() {
    setLoading(true);
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    setLoading(true);
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  const activePayments = payments.filter((payment) => payment.status === "ACTIVE");
  const expectedThisMonth = occurrences.filter((occurrence) => occurrence.status !== "SKIPPED").reduce((sum, occurrence) => sum + occurrence.amount, 0);
  const pendingThisMonth = occurrences.filter((occurrence) => occurrence.status === "PENDING" || occurrence.status === "OVERDUE").reduce((sum, occurrence) => sum + occurrence.amount, 0);
  const paidThisMonth = occurrences.filter((occurrence) => occurrence.status === "PAID").reduce((sum, occurrence) => sum + occurrence.amount, 0);
  const overdueCount = occurrences.filter((occurrence) => occurrence.status === "OVERDUE").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pagos recurrentes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Renta, servicios y mantenimientos esperados antes de convertirse en gastos reales.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Metric label="Esperado" value={formatMoney(expectedThisMonth)} tone="indigo" />
          <Metric label="Pendiente" value={formatMoney(pendingThisMonth)} tone="amber" />
          <Metric label="Pagado" value={formatMoney(paidThisMonth)} tone="emerald" />
          <Metric label="Vencidos" value={String(overdueCount)} tone="red" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={prevMonth} className="px-3 py-2 rounded-lg border dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-white/5">Anterior</button>
        <span className="px-3 py-2 rounded-full border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          {monthShort[month - 1]} {year}
        </span>
        <button onClick={nextMonth} className="px-3 py-2 rounded-lg border dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-white/5">Siguiente</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-4 h-fit">
          <h2 className="font-semibold">{editingId ? "Editar pago recurrente" : "Nuevo pago recurrente"}</h2>
          {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{error}</div>}
          {categories.length === 0 && <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3">Primero agrega una categoria.</div>}

          <div>
            <label className="text-sm font-medium">Descripcion</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Renta, internet, mantenimiento..." className={inputClass} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Monto</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="text-sm font-medium">Dia pago</label>
              <input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} className={inputClass} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RecurringPaymentType })} className={inputClass}>
                <option value="RENT">Renta</option>
                <option value="SERVICE">Servicio</option>
                <option value="MAINTENANCE">Mantenimiento</option>
                <option value="SUBSCRIPTION">Suscripcion</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Estado</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RecurringPaymentStatus })} className={inputClass}>
                <option value="ACTIVE">Activo</option>
                <option value="PAUSED">Pausado</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Categoria</label>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={inputClass} required>
              <option value="">Seleccionar categoria</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Mes inicio</label>
              <input type="number" min="1" max="12" value={form.startMonth} onChange={(e) => setForm({ ...form, startMonth: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="text-sm font-medium">Ano inicio</label>
              <input type="number" min="2000" max="2100" value={form.startYear} onChange={(e) => setForm({ ...form, startYear: e.target.value })} className={inputClass} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Mes final</label>
              <input type="number" min="1" max="12" value={form.endMonth} onChange={(e) => setForm({ ...form, endMonth: e.target.value })} placeholder="Opcional" className={inputClass} />
            </div>
            <div>
              <label className="text-sm font-medium">Ano final</label>
              <input type="number" min="2000" max="2100" value={form.endYear} onChange={(e) => setForm({ ...form, endYear: e.target.value })} placeholder="Opcional" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Notas</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} rows={3} />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving || categories.length === 0} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="px-3 py-2 border dark:border-gray-600 rounded-lg">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="space-y-4">
          <section className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Pagos esperados del mes</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Se generan desde tus reglas activas y se vuelven gasto real al pagarse.</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">{occurrences.length} pagos</span>
            </div>

            {loading ? (
              <div className="text-sm text-gray-500">Cargando pagos esperados...</div>
            ) : occurrences.length === 0 ? (
              <div className="text-sm text-gray-500">No hay pagos recurrentes para este mes.</div>
            ) : (
              <div className="space-y-2">
                {occurrences.map((occurrence) => (
                  <div key={occurrence.id} className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{occurrence.recurringPayment.description}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${occurrenceStatusClass(occurrence.status)}`}>{occurrenceStatusLabel(occurrence.status)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {typeLabel(occurrence.recurringPayment.type)} · {occurrence.recurringPayment.category.name} · vence {new Date(occurrence.dueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatMoney(occurrence.amount)}</p>
                      {(occurrence.status === "PENDING" || occurrence.status === "OVERDUE") && (
                        <button onClick={() => markPaid(occurrence)} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
                          Pagar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            {payments.length === 0 ? (
              <div className="p-6 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">Agrega renta, servicios o mantenimientos para planificar el mes.</div>
            ) : payments.map((payment) => (
              <div key={payment.id} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{payment.description}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${paymentStatusClass(payment.status)}`}>{paymentStatusLabel(payment.status)}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {typeLabel(payment.type)} · {payment.category.name} · dia {payment.dueDay}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Desde {String(payment.startMonth).padStart(2, "0")}/{payment.startYear}{payment.endMonth && payment.endYear ? ` hasta ${String(payment.endMonth).padStart(2, "0")}/${payment.endYear}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => editPayment(payment)} className="text-indigo-600 dark:text-indigo-400">Editar</button>
                    <button onClick={() => deletePayment(payment.id)} className="text-red-500">Eliminar</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <DataPoint label="Monto" value={formatMoney(payment.amount)} />
                  <DataPoint label="Dia" value={String(payment.dueDay)} />
                  <DataPoint label="Tipo" value={typeLabel(payment.type)} />
                  <DataPoint label="Estado" value={paymentStatusLabel(payment.status)} />
                </div>

                {payment.notes && <p className="text-sm text-gray-500 dark:text-gray-400">{payment.notes}</p>}
              </div>
            ))}
          </section>
        </div>
      </div>

      {activePayments.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-600">{activePayments.length} reglas activas generan compromisos mensuales automaticamente.</p>
      )}
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums truncate">{value}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "red" | "indigo" }) {
  const classes = {
    emerald: "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    red: "border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300",
    indigo: "border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${classes}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

function typeLabel(type: RecurringPaymentType) {
  return { RENT: "Renta", SERVICE: "Servicio", MAINTENANCE: "Mantenimiento", SUBSCRIPTION: "Suscripcion", OTHER: "Otro" }[type];
}

function paymentStatusLabel(status: RecurringPaymentStatus) {
  return { ACTIVE: "Activo", PAUSED: "Pausado", CANCELLED: "Cancelado" }[status];
}

function occurrenceStatusLabel(status: OccurrenceStatus) {
  return { PENDING: "Pendiente", PAID: "Pagado", SKIPPED: "Omitido", OVERDUE: "Vencido" }[status];
}

function paymentStatusClass(status: RecurringPaymentStatus) {
  return {
    ACTIVE: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    PAUSED: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300",
    CANCELLED: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300",
  }[status];
}

function occurrenceStatusClass(status: OccurrenceStatus) {
  return {
    PENDING: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300",
    PAID: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    SKIPPED: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300",
    OVERDUE: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300",
  }[status];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}
