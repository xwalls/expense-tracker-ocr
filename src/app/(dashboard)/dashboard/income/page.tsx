"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface IncomePreview {
  employer: string;
  periodStart: string;
  periodEnd: string;
  totalNeto: number;
  despensa: number;
  bankDeposit: number;
  uuid: string;
  isDuplicate: boolean;
  tipo: "NOMINA" | "FACTURA";
  rawData: Record<string, unknown>;
}

interface Income {
  id: string;
  amount: number;
  bankDeposit: number;
  despensa: number;
  description: string;
  source: string;
  employer: string | null;
  date: string;
}

const SOURCE_LABELS: Record<string, string> = {
  NOMINA: "Nómina",
  FACTURA: "Factura",
  OTRO: "Otro",
};

const SOURCE_BADGE: Record<string, string> = {
  NOMINA: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  FACTURA: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  OTRO: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
};

export default function IncomePage() {
  const now = new Date();
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<IncomePreview | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    amount: "",
    description: "",
    source: "NOMINA",
    date: now.toISOString().split("T")[0],
    employer: "",
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSaved, setManualSaved] = useState(false);
  const [manualError, setManualError] = useState("");

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [filterMonth, setFilterMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));

  const fileRef = useRef<HTMLInputElement>(null);

  const loadIncomes = useCallback(() => {
    const params = new URLSearchParams({ month: filterMonth, year: filterYear });
    fetch(`/api/income?${params}`)
      .then((r) => r.json())
      .then((data) => setIncomes(Array.isArray(data.incomes) ? data.incomes : []));
  }, [filterMonth, filterYear]);

  useEffect(() => {
    loadIncomes();
  }, [loadIncomes]);

  const processFile = useCallback(async (file: File) => {
    setProcessing(true);
    setUploadError("");
    setPreview(null);
    setSaved(false);
    setSaveError("");

    try {
      const formData = new FormData();
      formData.append("xml", file);

      const res = await fetch("/api/income/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setUploadError("Este CFDI ya fue importado anteriormente.");
        } else {
          setUploadError(data.message || data.error || "Error al procesar el archivo");
        }
        return;
      }

      // Map API response shape to flat IncomePreview
      const parsed = data.parsed;
      const suggested = data.suggested;
      const isNomina = parsed.tipo === "NOMINA";
      setPreview({
        employer: suggested.employer,
        periodStart: isNomina ? (parsed.nomina?.fechaInicialPago || "").split("T")[0] : "",
        periodEnd: isNomina ? (parsed.nomina?.fechaFinalPago || "").split("T")[0] : "",
        totalNeto: suggested.amount,
        despensa: suggested.despensa,
        bankDeposit: suggested.bankDeposit,
        uuid: parsed.uuid,
        isDuplicate: data.duplicate,
        tipo: parsed.tipo,
        rawData: {
          ...suggested,
          cfdiUuid: parsed.uuid,
          cfdiXml: undefined,
        },
      });
    } catch {
      setUploadError("Error al conectar con el servidor");
    } finally {
      setProcessing(false);
    }
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  async function handleConfirm() {
    if (!preview || preview.isDuplicate) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview.rawData),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Error al guardar");
        return;
      }
      setSaved(true);
      setPreview(null);
      loadIncomes();
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManualSaving(true);
    setManualError("");
    setManualSaved(false);
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(manualForm.amount),
          bankDeposit: Number(manualForm.amount),
          despensa: 0,
          description: manualForm.description,
          source: manualForm.source,
          date: manualForm.date,
          employer: manualForm.employer || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualError(data.error || "Error al guardar");
        return;
      }
      setManualSaved(true);
      setManualForm({
        amount: "",
        description: "",
        source: "NOMINA",
        date: now.toISOString().split("T")[0],
        employer: "",
      });
      loadIncomes();
    } finally {
      setManualSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Eliminar este ingreso?")) return;
    await fetch(`/api/income/${id}`, { method: "DELETE" });
    loadIncomes();
  }

  const totalNeto = incomes.reduce((sum, i) => sum + i.amount, 0);
  const totalDeposit = incomes.reduce((sum, i) => sum + i.bankDeposit, 0);

  const months = [
    { value: "01", label: "Enero" },
    { value: "02", label: "Febrero" },
    { value: "03", label: "Marzo" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Mayo" },
    { value: "06", label: "Junio" },
    { value: "07", label: "Julio" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ingresos</h1>

      {/* XML Upload Zone */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
        <h2 className="font-semibold mb-4">Importar CFDI (XML)</h2>
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
            dragging
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
              : "dark:border-gray-600 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20"
          }`}
        >
          <div className="text-4xl text-gray-300 dark:text-gray-600 mb-2">&#128196;</div>
          <p className="text-gray-500 dark:text-gray-400">
            {dragging ? "Suelta el archivo XML aqui" : "Click o arrastra tu XML de nómina (CFDI)"}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Solo archivos .xml</p>
        </div>
        <input ref={fileRef} type="file" accept=".xml" onChange={handleFile} className="hidden" />

        {processing && (
          <div className="mt-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Procesando XML...</span>
          </div>
        )}

        {uploadError && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {uploadError}
          </div>
        )}

        {saved && (
          <div className="mt-4 text-green-600 dark:text-green-400 font-medium p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
            Ingreso guardado correctamente.
          </div>
        )}
      </div>

      {/* Preview Card */}
      {preview && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700 space-y-4">
          <h2 className="font-semibold">Vista previa del CFDI</h2>

          {preview.isDuplicate && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium">
              Este CFDI ya fue importado.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Empleador</span>
              <p className="font-medium dark:text-gray-100">{preview.employer}</p>
            </div>
            {preview.tipo === "NOMINA" && preview.periodStart && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Periodo</span>
                <p className="font-medium dark:text-gray-100">
                  {preview.periodStart} — {preview.periodEnd}
                </p>
              </div>
            )}
            <div>
              <span className="text-gray-500 dark:text-gray-400">Total NETO</span>
              <p className="font-semibold text-base dark:text-gray-100">${preview.totalNeto.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Despensa</span>
              <p className="font-medium dark:text-gray-100">${preview.despensa.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Depósito bancario</span>
              <p className="font-medium dark:text-gray-100">${preview.bankDeposit.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">UUID</span>
              <p className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all">{preview.uuid}</p>
            </div>
          </div>

          {saveError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {saveError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={saving || preview.isDuplicate}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {saving ? "Guardando..." : "Confirmar y Guardar"}
            </button>
            <button
              onClick={() => { setPreview(null); setSaveError(""); }}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Manual Entry Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
        <button
          onClick={() => setManualOpen(!manualOpen)}
          className="w-full p-4 flex items-center justify-between text-left font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition"
        >
          <span>Ingreso manual</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${manualOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {manualOpen && (
          <div className="px-6 pb-6 border-t dark:border-gray-700 pt-4">
            {manualSaved && (
              <div className="mb-4 text-green-600 dark:text-green-400 font-medium p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                Ingreso guardado correctamente.
              </div>
            )}
            {manualError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {manualError}
              </div>
            )}
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Descripcion</label>
                  <input
                    type="text"
                    placeholder="Ej: Quincena enero"
                    value={manualForm.description}
                    onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Fuente</label>
                  <select
                    value={manualForm.source}
                    onChange={(e) => setManualForm({ ...manualForm, source: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="NOMINA">Nómina</option>
                    <option value="FACTURA">Factura</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha</label>
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium">Empleador (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Empresa S.A. de C.V."
                    value={manualForm.employer}
                    onChange={(e) => setManualForm({ ...manualForm, employer: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={manualSaving}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {manualSaving ? "Guardando..." : "Guardar ingreso"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Income List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
        <div className="p-4 border-b dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Lista de Ingresos</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="text-sm px-3 py-1.5 border dark:border-gray-600 rounded-lg outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="text-sm px-3 py-1.5 border dark:border-gray-600 rounded-lg outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {incomes.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">No hay ingresos registrados para este periodo</p>
        ) : (
          <>
            <div className="divide-y dark:divide-gray-700">
              {incomes.map((income) => (
                <div
                  key={income.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium dark:text-gray-100">{income.description}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_BADGE[income.source] ?? SOURCE_BADGE.OTRO}`}
                        >
                          {SOURCE_LABELS[income.source] ?? income.source}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {new Date(income.date).toLocaleDateString("es-MX")}
                        {income.employer && ` — ${income.employer}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-semibold text-base dark:text-gray-100">${income.amount.toFixed(2)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Dep: ${income.bankDeposit.toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(income.id)}
                      className="text-sm text-red-500 dark:text-red-400 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 rounded-b-xl flex flex-wrap gap-6">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total NETO</span>
                <p className="font-bold text-lg dark:text-gray-100">${totalNeto.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Depósito</span>
                <p className="font-bold text-lg dark:text-gray-100">${totalDeposit.toFixed(2)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
