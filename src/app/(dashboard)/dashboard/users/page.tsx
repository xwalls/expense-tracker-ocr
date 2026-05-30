"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface User {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  expenseCount: number;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  }

  function handleEdit(user: User) {
    setEditId(user.id);
    setForm({ name: user.name ?? "", email: user.email });
    setError("");
  }

  function handleCancel() {
    setEditId(null);
    setForm({ name: "", email: "" });
    setError("");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/users/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al actualizar");
        return;
      }

      setEditId(null);
      setForm({ name: "", email: "" });
      loadUsers();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`¿Eliminar al usuario "${email}"?\nSe eliminarán todos sus gastos y presupuestos.`)) return;
    setError("");

    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al eliminar");
      return;
    }
    loadUsers();
  }

  const initials = (name: string | null, email: string) => {
    if (name) return name.charAt(0).toUpperCase();
    return email.charAt(0).toUpperCase();
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-white">Usuarios</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {users.length} {users.length === 1 ? "usuario" : "usuarios"} registrados
        </span>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {editId && (
        <form
          onSubmit={handleUpdate}
          className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700 space-y-4"
        >
          <h2 className="font-semibold dark:text-white">Editar Usuario</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-4 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 dark:text-gray-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
        <div className="p-4 border-b dark:border-gray-700">
          <h2 className="font-semibold dark:text-white">Lista de Usuarios</h2>
        </div>

        {users.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">No hay usuarios registrados</p>
        ) : (
          <div className="divide-y dark:divide-gray-700">
            {users.map((user) => (
              <div
                key={user.id}
                className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {initials(user.name, user.email)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium dark:text-white">
                        {user.name ?? <span className="text-gray-400 italic">Sin nombre</span>}
                      </p>
                      {user.id === session?.user?.id && (
                        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                          Tú
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-sm font-medium dark:text-gray-200">
                      {user.expenseCount} {user.expenseCount === 1 ? "gasto" : "gastos"}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(user.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(user.id, user.email)}
                      disabled={user.id === session?.user?.id}
                      className="text-sm text-red-500 dark:text-red-400 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total usuarios</p>
          <p className="text-2xl font-bold dark:text-white">{users.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total gastos</p>
          <p className="text-2xl font-bold dark:text-white">
            {users.reduce((sum, u) => sum + u.expenseCount, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Promedio gastos/usuario</p>
          <p className="text-2xl font-bold dark:text-white">
            {users.length
              ? (users.reduce((sum, u) => sum + u.expenseCount, 0) / users.length).toFixed(1)
              : "0"}
          </p>
        </div>
      </div>
    </div>
  );
}
