"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  AreaChart, Area,
  CartesianGrid, Legend,
} from "recharts";

interface RecentExpense {
  id: string;
  amount: number;
  description: string;
  date: string;
  receipt: string | null;
  category: { name: string; color: string };
}

interface Stats {
  total: number;
  prevTotal: number;
  count: number;
  byCategory: { name: string; color: string; total: number; count: number }[];
  dailyTotals: { date: string; amount: number; cumulative: number }[];
  weeklyTotals: { week: string; amount: number }[];
  alerts: { category: string; budget: number; spent: number; percentage: number }[];
  recentExpenses: RecentExpense[];
  topExpense: { amount: number; description: string; category: string } | null;
  allTimeRecent: RecentExpense[];
}

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const monthShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type TabId = "diario" | "semanal" | "categorias" | "transacciones";

const tabs: { id: TabId; label: string }[] = [
  { id: "diario", label: "Diario" },
  { id: "semanal", label: "Semanal" },
  { id: "categorias", label: "Categorias" },
  { id: "transacciones", label: "Transacciones" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<TabId>("diario");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/expenses/stats?month=${month}&year=${year}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
    return () => controller.abort();
  }, [month, year]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  if (!stats) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-gray-200 dark:bg-white/5" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-200 dark:bg-white/5" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-gray-200 dark:bg-white/5" />
      </div>
    );
  }

  const monthDiff = stats.prevTotal > 0
    ? Math.round(((stats.total - stats.prevTotal) / stats.prevTotal) * 100)
    : null;

  const avgPerExpense = stats.count > 0 ? stats.total / stats.count : 0;

  const expensesToShow = stats.recentExpenses.length > 0
    ? stats.recentExpenses
    : stats.allTimeRecent;
  const isAllTime = stats.recentExpenses.length === 0 && stats.allTimeRecent.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Resumen financiero personal</p>
        </div>

        {/* Month navigation as tags */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-white/8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {monthShort[month - 1]}
            </span>
            <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-white/8 bg-gray-100 dark:bg-white/5 text-xs font-medium text-gray-600 dark:text-gray-400">
              {year}
            </span>
            {stats.alerts.length > 0 && (
              <span className="px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400">
                {stats.alerts.length} alerta{stats.alerts.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-white/8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Three panel overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Panel 1: Resumen */}
        <div className="bg-white dark:bg-[#141e2e] rounded-xl border border-gray-200 dark:border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Resumen</span>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-0.5">Total del mes</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  ${stats.total.toFixed(2)}
                </span>
                {monthDiff !== null && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    monthDiff > 0
                      ? "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10"
                      : "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10"
                  }`}>
                    {monthDiff > 0 ? "+" : ""}{monthDiff}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                vs ${stats.prevTotal.toFixed(2)} mes anterior
              </p>
            </div>
            <div className="h-px bg-gray-100 dark:bg-white/5" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-500">Transacciones</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{stats.count}</p>
                <p className="text-xs text-gray-400 dark:text-gray-600">{stats.byCategory.length} categorias</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-500">Promedio</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">${avgPerExpense.toFixed(2)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-600">por gasto</p>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Tendencias */}
        <div className="bg-white dark:bg-[#141e2e] rounded-xl border border-gray-200 dark:border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Tendencias</span>
            <span className="text-xs text-gray-400 dark:text-gray-600">{monthNames[month - 1]} {year}</span>
          </div>
          {stats.dailyTotals.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">Gasto acumulado</p>
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={stats.dailyTotals} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => [`$${Number(v).toFixed(2)}`, "Acumulado"]}
                    labelFormatter={(l) => `Dia ${String(l).slice(8)}`}
                    contentStyle={{ backgroundColor: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "6px", fontSize: "11px" }}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="#6366f1" strokeWidth={1.5} fill="url(#areaGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 grid grid-cols-2 gap-2">
                {stats.dailyTotals.length > 0 && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-500">Pico diario</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                        ${Math.max(...stats.dailyTotals.map((d) => d.amount)).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-500">Dias activos</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                        {stats.dailyTotals.filter((d) => d.amount > 0).length}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 text-gray-400 dark:text-gray-600 text-xs">
              Sin datos este mes
            </div>
          )}
        </div>

        {/* Panel 3: Info adicional */}
        <div className="bg-white dark:bg-[#141e2e] rounded-xl border border-gray-200 dark:border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">Info</span>
          </div>
          <div className="space-y-3">
            {stats.topExpense ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mb-0.5">Mayor gasto</p>
                <p className="text-xl font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                  ${stats.topExpense.amount.toFixed(2)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                  {stats.topExpense.description}
                </p>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-white/8 text-gray-500 dark:text-gray-500">
                  {stats.topExpense.category}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-600">Sin gastos registrados</p>
            )}

            {stats.alerts.length > 0 && (
              <>
                <div className="h-px bg-gray-100 dark:bg-white/5" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-1.5">Alertas de presupuesto</p>
                  <div className="space-y-1.5">
                    {stats.alerts.slice(0, 2).map((a) => (
                      <div key={a.category} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.percentage >= 100 ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{a.category}</span>
                        <span className={`text-xs font-semibold tabular-nums ${a.percentage >= 100 ? "text-red-500" : "text-amber-500"}`}>
                          {a.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {stats.byCategory.length > 0 && (
              <>
                <div className="h-px bg-gray-100 dark:bg-white/5" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-1.5">Top categoria</p>
                  {stats.byCategory.slice(0, 1).map((c) => {
                    const pct = stats.total > 0 ? Math.round((c.total / stats.total) * 100) : 0;
                    return (
                      <div key={c.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{c.name}</span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-200 tabular-nums">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-[#141e2e] rounded-xl border border-gray-200 dark:border-white/5">
        {/* Tab header */}
        <div className="flex items-center border-b border-gray-200 dark:border-white/5 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {activeTab === "diario" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-3">Gasto acumulado del mes</p>
                {stats.dailyTotals.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={stats.dailyTotals}>
                      <defs>
                        <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(8)} stroke="currentColor" opacity={0.3} />
                      <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                      <Tooltip
                        formatter={(v, name) => [`$${Number(v).toFixed(2)}`, name === "cumulative" ? "Acumulado" : "Dia"]}
                        labelFormatter={(l) => `Dia ${String(l).slice(8)}`}
                        contentStyle={{ backgroundColor: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "8px", fontSize: "11px" }}
                      />
                      <Area type="monotone" dataKey="cumulative" stroke="#6366f1" strokeWidth={1.5} fill="url(#cumGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-600">Sin datos</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-3">Gastos por dia</p>
                {stats.dailyTotals.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.dailyTotals}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(8)} stroke="currentColor" opacity={0.3} />
                      <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                      <Tooltip
                        formatter={(v) => [`$${Number(v).toFixed(2)}`, "Monto"]}
                        labelFormatter={(l) => `Dia ${String(l).slice(8)}`}
                        contentStyle={{ backgroundColor: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "8px", fontSize: "11px" }}
                      />
                      <Bar dataKey="amount" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-600">Sin datos</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "semanal" && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-3">Gastos por semana</p>
              {stats.weeklyTotals.some((w) => w.amount > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.weeklyTotals}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.3} />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.3} />
                    <Tooltip
                      formatter={(v) => [`$${Number(v).toFixed(2)}`, "Total"]}
                      contentStyle={{ backgroundColor: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "8px", fontSize: "11px" }}
                    />
                    <Legend />
                    <Bar dataKey="amount" name="Gasto semanal" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-600">Sin datos semanales</p>
              )}
            </div>
          )}

          {activeTab === "categorias" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-3">Distribucion por categoria</p>
                {stats.byCategory.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="45%" height={200}>
                      <PieChart>
                        <Pie
                          data={stats.byCategory}
                          dataKey="total"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={42}
                          strokeWidth={0}
                        >
                          {stats.byCategory.map((c) => (
                            <Cell key={c.name} fill={c.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`]} contentStyle={{ backgroundColor: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "8px", fontSize: "11px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 text-sm flex-1">
                      {stats.byCategory.map((c) => {
                        const pct = stats.total > 0 ? Math.round((c.total / stats.total) * 100) : 0;
                        return (
                          <div key={c.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                            <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-500 tabular-nums">${c.total.toFixed(2)}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-600 w-7 text-right tabular-nums">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-600">Sin datos</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-3">Comparativa por categoria</p>
                {stats.byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.byCategory} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.3} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} stroke="currentColor" opacity={0.3} />
                      <Tooltip
                        formatter={(v) => [`$${Number(v).toFixed(2)}`, "Total"]}
                        contentStyle={{ backgroundColor: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "8px", fontSize: "11px" }}
                      />
                      <Bar dataKey="total" radius={[0, 3, 3, 0]}>
                        {stats.byCategory.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-600">Sin datos</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "transacciones" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-500">
                  {isAllTime ? "Ultimos gastos (todos los meses)" : `Gastos de ${monthNames[month - 1]} ${year}`}
                </p>
                {isAllTime && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10">
                    Sin gastos en {monthShort[month - 1]} {year}
                  </span>
                )}
              </div>

              {expensesToShow.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-gray-400 dark:text-gray-600">Sin gastos registrados.</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Ve a Gastos o Escanear para agregar.</p>
                </div>
              ) : (
                <div className="space-y-0 divide-y divide-gray-100 dark:divide-white/5">
                  {expensesToShow.map((exp) => (
                    <div key={exp.id} className="flex items-center gap-3 py-3 hover:bg-gray-50 dark:hover:bg-white/3 rounded-lg px-2 transition-colors">
                      {exp.receipt ? (
                        <a href={exp.receipt} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={exp.receipt} alt="Recibo" className="w-8 h-8 rounded-lg object-cover border border-gray-200 dark:border-white/8" />
                        </a>
                      ) : (
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: exp.category.color + "20" }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: exp.category.color }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">{exp.description}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: exp.category.color }} />
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {exp.category.name} · {new Date(exp.date).toLocaleDateString("es")}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 tabular-nums shrink-0">
                        ${exp.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
