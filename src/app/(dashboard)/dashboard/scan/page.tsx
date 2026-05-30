"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export default function ScanPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: "", description: "", categoryId: "", date: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
  }, []);

  const processFile = useCallback(async (file: File) => {
    setPreview(URL.createObjectURL(file));
    setProcessing(true);
    setOcrText("");
    setReceiptData(null);
    setSaved(false);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/ocr", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al procesar");
        return;
      }

      setOcrText(data.ocrText || "");
      setReceiptData(data.receiptData || null);

      const catMatch = categories.find((c) => c.name === data.category);

      setForm({
        amount: data.amount ? String(data.amount) : "",
        description: data.description || "Recibo escaneado",
        categoryId: catMatch?.id || "",
        date: data.date || new Date().toISOString().split("T")[0],
      });
    } catch (err) {
      console.error(err);
      setError("Error al conectar con el servidor");
    } finally {
      setProcessing(false);
    }
  }, [categories]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processFile(file);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, ocrText, receiptData }),
        });
        if (res.ok) {
          setSaved(true);
          setForm({ amount: "", description: "", categoryId: "", date: "" });
          setOcrText("");
          setReceiptData(null);
          setPreview(null);
        }
      } finally {
        setSaving(false);
      }
    }, 500);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Escanear Recibo (OCR con IA)</h1>

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
          {preview ? (
            <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
          ) : (
            <div>
              <div className="text-4xl text-gray-300 dark:text-gray-600 mb-2">&#128247;</div>
              <p className="text-gray-500 dark:text-gray-400">
                {dragging ? "Suelta la imagen aqui" : "Click o arrastra una imagen de recibo"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG - Tickets, facturas, recibos</p>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2">Procesado con IA vision</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

        {processing && (
          <div className="mt-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Analizando imagen con IA...</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">{error}</div>
        )}
      </div>

      {ocrText && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
            <h2 className="font-semibold mb-3">Texto Detectado por IA</h2>
            <pre className="text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-lg whitespace-pre-wrap max-h-64 overflow-auto">
              {ocrText}
            </pre>

            {receiptData?.items?.length ? (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Desglose Detectado</h2>
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
            ) : null}
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
            <h2 className="font-semibold mb-3">Crear Gasto</h2>
            {saved ? (
              <div className="text-green-600 dark:text-green-400 font-medium p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                Gasto guardado correctamente!
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Monto (detectado por IA)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Descripcion</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Categoria (sugerida por IA)</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                    required
                  >
                    <option value="">Seleccionar</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <button type="submit" disabled={saving} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                  {saving ? "Guardando..." : "Guardar Gasto"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}
