"use client";

import { useEffect, useState } from "react";

interface CreditCard {
  id: string;
  name: string;
  currentBalance: number;
  creditLimit: number | null;
  cutoffDay: number;
  dueDay: number;
  minimumPayment: number | null;
  notes: string | null;
}

const emptyForm = {
  name: "",
  currentBalance: "",
  creditLimit: "",
  cutoffDay: "",
  dueDay: "",
  minimumPayment: "",
  notes: "",
};

const inputClass = "w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500";

export default function CreditCardsPage() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadCards() {
    setLoading(true);
    const res = await fetch("/api/credit-cards");
    if (res.ok) setCards(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/credit-cards")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCards(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name,
      currentBalance: Number(form.currentBalance),
      creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
      cutoffDay: Number(form.cutoffDay),
      dueDay: Number(form.dueDay),
      minimumPayment: form.minimumPayment ? Number(form.minimumPayment) : null,
      notes: form.notes || null,
    };

    const res = await fetch(editingId ? `/api/credit-cards/${editingId}` : "/api/credit-cards", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "No se pudo guardar la tarjeta");
      setSaving(false);
      return;
    }

    setForm(emptyForm);
    setEditingId(null);
    await loadCards();
    setSaving(false);
  }

  async function deleteCard(id: string) {
    if (!confirm("Eliminar esta tarjeta?")) return;
    await fetch(`/api/credit-cards/${id}`, { method: "DELETE" });
    await loadCards();
  }

  function editCard(card: CreditCard) {
    setEditingId(card.id);
    setForm({
      name: card.name,
      currentBalance: String(card.currentBalance),
      creditLimit: card.creditLimit == null ? "" : String(card.creditLimit),
      cutoffDay: String(card.cutoffDay),
      dueDay: String(card.dueDay),
      minimumPayment: card.minimumPayment == null ? "" : String(card.minimumPayment),
      notes: card.notes || "",
    });
  }

  const totalDebt = cards.reduce((sum, card) => sum + card.currentBalance, 0);
  const totalLimit = cards.reduce((sum, card) => sum + (card.creditLimit || 0), 0);
  const availableCredit = cards.reduce((sum, card) => {
    if (card.creditLimit == null) return sum;
    return sum + Math.max(card.creditLimit - card.currentBalance, 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tarjetas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Deuda actual, limites y fechas importantes de tarjetas de credito.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Metric label="Debemos" value={formatMoney(totalDebt)} tone="red" />
          <Metric label="Credito disponible" value={formatMoney(availableCredit)} tone="indigo" />
          <Metric label="Limite total" value={formatMoney(totalLimit)} tone="gray" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-4 h-fit">
          <h2 className="font-semibold">{editingId ? "Editar tarjeta" : "Nueva tarjeta"}</h2>
          {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{error}</div>}

          <div>
            <label className="text-sm font-medium">Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="BBVA, Nu, Costco..." className={inputClass} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Deuda actual</label>
              <input type="number" step="0.01" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="text-sm font-medium">Limite</label>
              <input type="number" step="0.01" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Dia de corte</label>
              <input type="number" min="1" max="31" value={form.cutoffDay} onChange={(e) => setForm({ ...form, cutoffDay: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="text-sm font-medium">Dia limite</label>
              <input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} className={inputClass} required />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Pago minimo</label>
            <input type="number" step="0.01" value={form.minimumPayment} onChange={(e) => setForm({ ...form, minimumPayment: e.target.value })} className={inputClass} />
          </div>

          <div>
            <label className="text-sm font-medium">Notas</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} rows={3} />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="px-3 py-2 border dark:border-gray-600 rounded-lg">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-fit">
          {loading ? (
            <div className="p-6 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">Cargando tarjetas...</div>
          ) : cards.length === 0 ? (
            <div className="p-6 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">Agrega una tarjeta para ver cuanto deben y proximas fechas de pago.</div>
          ) : cards.map((card) => {
            const usedPct = card.creditLimit ? Math.min((card.currentBalance / card.creditLimit) * 100, 100) : 0;
            const remaining = card.creditLimit == null ? null : Math.max(card.creditLimit - card.currentBalance, 0);
            return (
              <div key={card.id} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{card.name}</h3>
                    {card.notes && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{card.notes}</p>}
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => editCard(card)} className="text-indigo-600 dark:text-indigo-400">Editar</button>
                    <button onClick={() => deleteCard(card.id)} className="text-red-500">Eliminar</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Deuda</p>
                    <p className="text-xl font-bold text-red-500 tabular-nums">{formatMoney(card.currentBalance)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Disponible</p>
                    <p className="text-xl font-bold text-indigo-500 tabular-nums">{remaining == null ? "-" : formatMoney(remaining)}</p>
                  </div>
                </div>

                {card.creditLimit != null && (
                  <div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: `${usedPct}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Uso: {Math.round(usedPct)}% de {formatMoney(card.creditLimit)}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <DateBox label="Corte" value={`Dia ${card.cutoffDay}`} />
                  <DateBox label="Pago" value={`Dia ${card.dueDay}`} />
                  <DateBox label="Minimo" value={card.minimumPayment == null ? "-" : formatMoney(card.minimumPayment)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "red" | "indigo" | "gray" }) {
  const classes = {
    red: "border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300",
    indigo: "border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    gray: "border-gray-200 dark:border-white/10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${classes}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function DateBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}
