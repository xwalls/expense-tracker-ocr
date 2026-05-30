"use client";

import { useEffect, useState } from "react";

type AccountType = "BANK" | "CASH" | "SAVINGS" | "VOUCHER" | "OTHER";

interface Account {
  id: string;
  name: string;
  type: AccountType;
  currentBalance: number;
  notes: string | null;
}

const accountTypes: { value: AccountType; label: string }[] = [
  { value: "BANK", label: "Banco" },
  { value: "CASH", label: "Efectivo" },
  { value: "SAVINGS", label: "Ahorro" },
  { value: "VOUCHER", label: "Vales" },
  { value: "OTHER", label: "Otro" },
];

const emptyForm = { name: "", type: "BANK" as AccountType, currentBalance: "", notes: "" };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadAccounts() {
    setLoading(true);
    const res = await fetch("/api/accounts");
    if (res.ok) setAccounts(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      currentBalance: Number(form.currentBalance),
      notes: form.notes || null,
    };

    const res = await fetch(editingId ? `/api/accounts/${editingId}` : "/api/accounts", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "No se pudo guardar la cuenta");
      setSaving(false);
      return;
    }

    setForm(emptyForm);
    setEditingId(null);
    await loadAccounts();
    setSaving(false);
  }

  async function deleteAccount(id: string) {
    if (!confirm("Eliminar esta cuenta?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    await loadAccounts();
  }

  function editAccount(account: Account) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      type: account.type,
      currentBalance: String(account.currentBalance),
      notes: account.notes || "",
    });
  }

  const total = accounts.reduce((sum, account) => sum + account.currentBalance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cuentas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Saldos manuales de dinero disponible en casa.</p>
        </div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">Disponible total</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-4 h-fit">
          <h2 className="font-semibold">{editingId ? "Editar cuenta" : "Nueva cuenta"}</h2>
          {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{error}</div>}

          <div>
            <label className="text-sm font-medium">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="BBVA, efectivo, ahorro..."
              className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
              className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {accountTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Saldo actual</label>
            <input
              type="number"
              step="0.01"
              value={form.currentBalance}
              onChange={(e) => setForm({ ...form, currentBalance: e.target.value })}
              className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
            />
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

        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-6 text-gray-500">Cargando cuentas...</div>
          ) : accounts.length === 0 ? (
            <div className="p-6 text-gray-500">Agrega tu primera cuenta para saber cuanto dinero tienen disponible.</div>
          ) : (
            <div className="divide-y dark:divide-gray-700">
              {accounts.map((account) => (
                <div key={account.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{account.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">{labelForType(account.type)}</span>
                    </div>
                    {account.notes && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{account.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 sm:text-right">
                    <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{formatMoney(account.currentBalance)}</p>
                    <button onClick={() => editAccount(account)} className="text-sm text-indigo-600 dark:text-indigo-400">Editar</button>
                    <button onClick={() => deleteAccount(account.id)} className="text-sm text-red-500">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function labelForType(type: AccountType) {
  return accountTypes.find((item) => item.value === type)?.label || "Otro";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}
