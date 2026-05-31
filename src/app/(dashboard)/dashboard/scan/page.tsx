"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

interface Category {
  id: string;
  name: string;
}

interface ReceiptItem {
  quantity: number | null;
  unit: string | null;
  sku: string | null;
  description: string;
  unitPrice: number | null;
  total: number | null;
  rawText: string;
}

interface ReceiptData {
  merchant: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  paymentMethod: string | null;
  cardLast4: string | null;
  ticketNumber: string | null;
  items: ReceiptItem[];
}

type DraftStatus = "queued" | "processing" | "ready" | "error" | "saving" | "saved";

interface DraftForm {
  amount: string;
  description: string;
  categoryId: string;
  date: string;
}

interface ReceiptDraft {
  id: string;
  fileName: string;
  previewUrl: string;
  status: DraftStatus;
  selected: boolean;
  form: DraftForm;
  error: string;
  ocrText: string;
  receiptData: ReceiptData | null;
}

const MAX_BULK_FILES = 20;
const emptyForm = { amount: "", description: "", categoryId: "", date: "" };
const inputClass = "w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100";

export default function ScanPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<ReceiptDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<string[]>([]);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
  }, []);

  useEffect(() => {
    return () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const updateDraft = useCallback((id: string, patch: Partial<ReceiptDraft>) => {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  }, []);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const selectedFiles = Array.from(fileList);
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/"));

    setError("");
    if (selectedFiles.length > MAX_BULK_FILES) {
      setError(`Solo se procesan ${MAX_BULK_FILES} imagenes por lote. Se tomaron las primeras ${MAX_BULK_FILES}.`);
    }
    if (imageFiles.length === 0) {
      setError("Selecciona al menos una imagen valida.");
      return;
    }

    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];

    const queue = imageFiles.slice(0, MAX_BULK_FILES).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.push(previewUrl);
      return {
        file,
        draft: {
          id: crypto.randomUUID(),
          fileName: file.name,
          previewUrl,
          status: "queued" as DraftStatus,
          selected: true,
          form: { ...emptyForm },
          error: "",
          ocrText: "",
          receiptData: null,
        },
      };
    });

    setDrafts(queue.map((item) => item.draft));
    setSelectedDraftId(queue[0]?.draft.id ?? null);
    setBatchProcessing(true);

    for (const item of queue) {
      updateDraft(item.draft.id, { status: "processing", error: "" });

      try {
        const formData = new FormData();
        formData.append("image", item.file);

        const res = await fetch("/api/ocr", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          updateDraft(item.draft.id, { status: "error", error: data.error || "Error al procesar" });
          continue;
        }

        const catMatch = categories.find((category) => category.name === data.category);
        updateDraft(item.draft.id, {
          status: "ready",
          ocrText: data.ocrText || "",
          receiptData: data.receiptData || null,
          form: {
            amount: data.amount ? String(data.amount) : "",
            description: data.description || "Recibo escaneado",
            categoryId: catMatch?.id || "",
            date: data.date || new Date().toISOString().split("T")[0],
          },
        });
      } catch (err) {
        console.error(err);
        updateDraft(item.draft.id, { status: "error", error: "Error al conectar con el servidor" });
      }
    }

    setBatchProcessing(false);
  }, [categories, updateDraft]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    processFiles(files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files?.length) processFiles(files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function updateDraftForm(id: string, patch: Partial<DraftForm>) {
    setDrafts((current) => current.map((draft) => (
      draft.id === id ? { ...draft, form: { ...draft.form, ...patch } } : draft
    )));
  }

  function toggleDraft(id: string) {
    setDrafts((current) => current.map((draft) => (
      draft.id === id ? { ...draft, selected: !draft.selected } : draft
    )));
  }

  async function saveDraft(id: string) {
    const draft = drafts.find((item) => item.id === id);
    if (!draft || draft.status !== "ready") return;
    if (!draft.form.amount || !draft.form.description || !draft.form.categoryId) {
      updateDraft(id, { error: "Completa monto, descripcion y categoria antes de guardar." });
      return;
    }

    updateDraft(id, { status: "saving", error: "" });
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft.form, ocrText: draft.ocrText, receiptData: draft.receiptData }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        updateDraft(id, { status: "ready", error: data.error || "No se pudo guardar el gasto" });
        return;
      }

      updateDraft(id, { status: "saved", selected: false });
    } catch {
      updateDraft(id, { status: "ready", error: "Error al conectar con el servidor" });
    }
  }

  async function saveSelectedDrafts() {
    if (batchSaving) return;
    setBatchSaving(true);
    for (const draft of drafts.filter((item) => item.selected && item.status === "ready")) {
      await saveDraft(draft.id);
    }
    setBatchSaving(false);
  }

  function clearDrafts() {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    setDrafts([]);
    setSelectedDraftId(null);
    setError("");
  }

  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0] ?? null;
  const readyCount = drafts.filter((draft) => draft.status === "ready").length;
  const selectedReadyCount = drafts.filter((draft) => draft.selected && draft.status === "ready").length;
  const savedCount = drafts.filter((draft) => draft.status === "saved").length;
  const errorCount = drafts.filter((draft) => draft.status === "error").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Escanear Recibos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Procesa hasta {MAX_BULK_FILES} fotos como drafts revisables antes de crear gastos reales.</p>
        </div>
        {drafts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Drafts" value={String(drafts.length)} tone="indigo" />
            <Metric label="Listos" value={String(readyCount)} tone="amber" />
            <Metric label="Guardados" value={String(savedCount)} tone="emerald" />
            <Metric label="Errores" value={String(errorCount)} tone="red" />
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
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
          <div className="text-4xl text-gray-300 dark:text-gray-600 mb-2">&#128247;</div>
          <p className="text-gray-500 dark:text-gray-400">
            {dragging ? "Solta las imagenes aca" : "Click o arrastra una o varias fotos de recibos"}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG, HEIC si el navegador lo soporta · maximo {MAX_BULK_FILES} por lote</p>
          <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2">Se crean drafts; vos decidis cuales guardar.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFile} className="hidden" />

        {batchProcessing && (
          <div className="mt-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Analizando imagenes con IA, una por una para evitar timeouts...</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-sm">{error}</div>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden h-fit">
            <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Bandeja de drafts</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Selecciona los listos para guardar.</p>
              </div>
              <button onClick={clearDrafts} disabled={batchProcessing || batchSaving} className="text-sm text-gray-500 hover:text-red-500 disabled:opacity-50">
                Limpiar
              </button>
            </div>
            <div className="max-h-[640px] overflow-auto divide-y dark:divide-gray-700">
              {drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => setSelectedDraftId(draft.id)}
                  className={`w-full p-3 text-left flex gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedDraft?.id === draft.id ? "bg-indigo-50 dark:bg-indigo-500/10" : ""}`}
                >
                  <Image src={draft.previewUrl} alt={`Preview ${draft.fileName}`} width={56} height={56} unoptimized className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        disabled={draft.status !== "ready"}
                        onChange={(event) => { event.stopPropagation(); toggleDraft(draft.id); }}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{draft.form.description || draft.fileName}</p>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{draft.fileName}</p>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(draft.status)}`}>{statusLabel(draft.status)}</span>
                      {draft.form.amount && <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{formatMoney(Number(draft.form.amount))}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 space-y-2">
              <button
                onClick={saveSelectedDrafts}
                disabled={selectedReadyCount === 0 || batchProcessing || batchSaving}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {batchSaving ? "Guardando..." : `Guardar seleccionados (${selectedReadyCount})`}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">Solo se guardan drafts listos y seleccionados.</p>
            </div>
          </div>

          {selectedDraft && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-semibold">Draft detectado</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedDraft.fileName}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(selectedDraft.status)}`}>{statusLabel(selectedDraft.status)}</span>
                </div>

                <Image src={selectedDraft.previewUrl} alt={`Preview ${selectedDraft.fileName}`} width={800} height={320} unoptimized className="max-h-64 w-full object-contain rounded-lg bg-gray-50 dark:bg-gray-900 mb-4" />

                {selectedDraft.error && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">{selectedDraft.error}</div>
                )}

                {selectedDraft.ocrText ? (
                  <>
                    <h3 className="font-semibold mb-3">Texto detectado por IA</h3>
                    <pre className="text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-lg whitespace-pre-wrap max-h-64 overflow-auto">
                      {selectedDraft.ocrText}
                    </pre>
                    <ReceiptBreakdown receiptData={selectedDraft.receiptData} />
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Todavia no hay OCR para este draft.</p>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700 h-fit">
                <h2 className="font-semibold mb-3">Crear gasto desde draft</h2>
                {selectedDraft.status === "saved" ? (
                  <div className="text-green-600 dark:text-green-400 font-medium p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                    Gasto guardado correctamente.
                  </div>
                ) : (
                  <form onSubmit={(event) => { event.preventDefault(); saveDraft(selectedDraft.id); }} className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Monto detectado</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedDraft.form.amount}
                        onChange={(e) => updateDraftForm(selectedDraft.id, { amount: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Descripcion</label>
                      <input
                        type="text"
                        value={selectedDraft.form.description}
                        onChange={(e) => updateDraftForm(selectedDraft.id, { description: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Categoria sugerida por IA</label>
                      <select
                        value={selectedDraft.form.categoryId}
                        onChange={(e) => updateDraftForm(selectedDraft.id, { categoryId: e.target.value })}
                        className={inputClass}
                        required
                      >
                        <option value="">Seleccionar</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Fecha</label>
                      <input
                        type="date"
                        value={selectedDraft.form.date}
                        onChange={(e) => updateDraftForm(selectedDraft.id, { date: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <button type="submit" disabled={selectedDraft.status !== "ready"} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                      {selectedDraft.status === "saving" ? "Guardando..." : "Guardar este gasto"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReceiptBreakdown({ receiptData }: { receiptData: ReceiptData | null }) {
  if (!receiptData?.items?.length) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Desglose detectado</h2>
        {receiptData.total != null && (
          <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            Total: {formatMoney(receiptData.total)}
          </span>
        )}
      </div>
      <div className="overflow-x-auto border dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-3 py-2">Producto</th>
              <th className="text-right px-3 py-2">Cant.</th>
              <th className="text-right px-3 py-2">P. unit.</th>
              <th className="text-right px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {receiptData.items.map((item, index) => (
              <tr key={`${item.rawText}-${index}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{item.description}</div>
                  {item.sku && <div className="text-xs text-gray-400">SKU {item.sku}</div>}
                </td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                  {item.quantity ?? "-"}{item.unit ? ` ${item.unit}` : ""}
                </td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                  {item.unitPrice != null ? formatMoney(item.unitPrice) : "-"}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {item.total != null ? formatMoney(item.total) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
        {receiptData.subtotal != null && <span>Subtotal: {formatMoney(receiptData.subtotal)}</span>}
        {receiptData.tax != null && <span>Impuestos: {formatMoney(receiptData.tax)}</span>}
        {receiptData.paymentMethod && <span>Pago: {receiptData.paymentMethod}</span>}
        {receiptData.cardLast4 && <span>Tarjeta: ****{receiptData.cardLast4}</span>}
        {receiptData.ticketNumber && <span className="col-span-2">Ticket/Folio: {receiptData.ticketNumber}</span>}
      </div>
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

function statusLabel(status: DraftStatus) {
  return {
    queued: "En cola",
    processing: "Procesando",
    ready: "Listo",
    error: "Error",
    saving: "Guardando",
    saved: "Guardado",
  }[status];
}

function statusClass(status: DraftStatus) {
  return {
    queued: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
    processing: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    ready: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300",
    error: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300",
    saving: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    saved: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  }[status];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}
