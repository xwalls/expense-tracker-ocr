"use client";

import { useEffect, useState } from "react";

type InstallmentStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

interface CreditCardOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface InstallmentPlan {
  id: string;
  description: string;
  totalAmount: number;
  installmentCount: number;
  installmentAmount: number;
  startMonth: number;
  startYear: number;
  status: InstallmentStatus;
  notes: string | null;
  creditCard: { id: string; name: string };
  category: { id: string; name: string; color: string } | null;
}

const emptyForm = {
  description: "",
  totalAmount: "",
  installmentCount: "",
  installmentAmount: "",
  startMonth: String(new Date().getMonth() + 1),
  startYear: String(new Date().getFullYear()),
  creditCardId: "",
  categoryId: "",
  status: "ACTIVE" as InstallmentStatus,
  notes: "",
};

const inputClass = "w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500";

export default function InstallmentsPage() {
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [cards, setCards] = useState<CreditCardOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/installment-plans").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/credit-cards").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/categories").then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([plansData, cardsData, categoriesData]) => {
        setPlans(plansData);
        setCards(cardsData);
        setCategories(categoriesData);
      })
      .finally(() => setLoading(false));
  }, []);

  async function loadPlans() {
    const res = await fetch("/api/installment-plans");
    if (res.ok) setPlans(await res.json());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      description: form.description,
      totalAmount: Number(form.totalAmount),
      installmentCount: Number(form.installmentCount),
      installmentAmount: form.installmentAmount ? Number(form.installmentAmount) : null,
      startMonth: Number(form.startMonth),
      startYear: Number(form.startYear),
      creditCardId: form.creditCardId,
      categoryId: form.categoryId || null,
      status: form.status,
      notes: form.notes || null,
    };

    const res = await fetch(editingId ? `/api/installment-plans/${editingId}` : "/api/installment-plans", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "No se pudo guardar la mensualidad");
      setSaving(false);
      return;
    }

    setForm(emptyForm);
    setEditingId(null);
    await loadPlans();
    setSaving(false);
  }

  async function deletePlan(id: string) {
    if (!confirm("Eliminar este plan de mensualidades?")) return;
    await fetch(`/api/installment-plans/${id}`, { method: "DELETE" });
    await loadPlans();
  }

  function editPlan(plan: InstallmentPlan) {
    setEditingId(plan.id);
    setForm({
      description: plan.description,
      totalAmount: String(plan.totalAmount),
      installmentCount: String(plan.installmentCount),
      installmentAmount: String(plan.installmentAmount),
      startMonth: String(plan.startMonth),
      startYear: String(plan.startYear),
      creditCardId: plan.creditCard.id,
      categoryId: plan.category?.id || "",
      status: plan.status,
      notes: plan.notes || "",
    });
  }

  const activePlans = plans.filter((plan) => plan.status === "ACTIVE");
  const committedThisMonth = activePlans.reduce((sum, plan) => {
    return sum + (isActiveInCurrentMonth(plan) ? plan.installmentAmount : 0);
  }, 0);
  const activeDebt = activePlans.reduce((sum, plan) => sum + plan.installmentAmount * remainingInstallments(plan), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mensualidades</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Compras a meses como compromiso futuro, separadas de gastos ya ocurridos.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Metric label="Este mes" value={formatMoney(committedThisMonth)} tone="amber" />
          <Metric label="Pendiente activo" value={formatMoney(activeDebt)} tone="red" />
          <Metric label="Planes activos" value={String(activePlans.length)} tone="indigo" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-4 h-fit">
          <h2 className="font-semibold">{editingId ? "Editar mensualidad" : "Nueva mensualidad"}</h2>
          {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{error}</div>}
          {cards.length === 0 && <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3">Primero agrega una tarjeta de credito.</div>}

          <div>
            <label className="text-sm font-medium">Descripcion</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Refrigerador, llantas, laptop..." className={inputClass} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Total</label>
              <input type="number" step="0.01" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="text-sm font-medium">Meses</label>
              <input type="number" min="1" value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: e.target.value })} className={inputClass} required />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Mensualidad</label>
            <input type="number" step="0.01" value={form.installmentAmount} onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })} placeholder="Se calcula si lo dejas vacio" className={inputClass} />
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

          <div>
            <label className="text-sm font-medium">Tarjeta</label>
            <select value={form.creditCardId} onChange={(e) => setForm({ ...form, creditCardId: e.target.value })} className={inputClass} required>
              <option value="">Seleccionar tarjeta</option>
              {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Categoria</label>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={inputClass}>
              <option value="">Sin categoria</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Estado</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as InstallmentStatus })} className={inputClass}>
              <option value="ACTIVE">Activa</option>
              <option value="COMPLETED">Completada</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Notas</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} rows={3} />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving || cards.length === 0} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="px-3 py-2 border dark:border-gray-600 rounded-lg">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="space-y-3">
          {loading ? (
            <div className="p-6 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">Cargando mensualidades...</div>
          ) : plans.length === 0 ? (
            <div className="p-6 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">Agrega una compra a meses para ver su impacto futuro.</div>
          ) : plans.map((plan) => {
            const remaining = remainingInstallments(plan);
            const paid = plan.installmentCount - remaining;
            const progress = plan.installmentCount > 0 ? Math.min((paid / plan.installmentCount) * 100, 100) : 0;
            return (
              <div key={plan.id} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{plan.description}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(plan.status)}`}>{statusLabel(plan.status)}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{plan.creditCard.name} · inicia {String(plan.startMonth).padStart(2, "0")}/{plan.startYear}</p>
                    {plan.category && <p className="text-xs text-gray-400 mt-1">Categoria: {plan.category.name}</p>}
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => editPlan(plan)} className="text-indigo-600 dark:text-indigo-400">Editar</button>
                    <button onClick={() => deletePlan(plan.id)} className="text-red-500">Eliminar</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <DataPoint label="Total" value={formatMoney(plan.totalAmount)} />
                  <DataPoint label="Mensualidad" value={formatMoney(plan.installmentAmount)} />
                  <DataPoint label="Meses" value={`${plan.installmentCount}`} />
                  <DataPoint label="Restan" value={`${remaining}`} />
                </div>

                <div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{paid} de {plan.installmentCount} meses transcurridos</p>
                </div>

                {plan.notes && <p className="text-sm text-gray-500 dark:text-gray-400">{plan.notes}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "amber" | "red" | "indigo" }) {
  const classes = {
    amber: "border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    red: "border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300",
    indigo: "border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${classes}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function isActiveInCurrentMonth(plan: InstallmentPlan) {
  const today = new Date();
  return isActiveInMonth(plan, today.getMonth() + 1, today.getFullYear());
}

function remainingInstallments(plan: InstallmentPlan) {
  const today = new Date();
  const targetIndex = monthIndex(today.getMonth() + 1, today.getFullYear());
  const startIndex = monthIndex(plan.startMonth, plan.startYear);
  const endIndex = startIndex + plan.installmentCount - 1;
  if (targetIndex > endIndex) return 0;
  return endIndex - Math.max(targetIndex, startIndex) + 1;
}

function isActiveInMonth(plan: InstallmentPlan, month: number, year: number) {
  if (plan.status !== "ACTIVE") return false;
  const targetIndex = monthIndex(month, year);
  const startIndex = monthIndex(plan.startMonth, plan.startYear);
  const endIndex = startIndex + plan.installmentCount - 1;
  return targetIndex >= startIndex && targetIndex <= endIndex;
}

function monthIndex(month: number, year: number) {
  return year * 12 + (month - 1);
}

function statusLabel(status: InstallmentStatus) {
  return { ACTIVE: "Activa", COMPLETED: "Completada", CANCELLED: "Cancelada" }[status];
}

function statusClass(status: InstallmentStatus) {
  return {
    ACTIVE: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    COMPLETED: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    CANCELLED: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300",
  }[status];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}
