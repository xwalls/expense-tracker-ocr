import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

export interface ProcessReceiptInput {
  imageBuffer: Buffer;
  mimeType?: string;
  traceId?: string;
}

export interface ReceiptItem {
  quantity: number | null;
  unit: string | null;
  sku: string | null;
  description: string;
  unitPrice: number | null;
  total: number | null;
  rawText: string;
}

export interface ReceiptData {
  merchant: string | null;
  address: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  paymentMethod: string | null;
  cardLast4: string | null;
  ticketNumber: string | null;
  items: ReceiptItem[];
}

export interface OcrResult {
  ocrText: string | null;
  amount: number | null;
  description: string | null;
  category: string;
  date: string | null;
  receiptData: ReceiptData;
}

type MiniMaxToolResult = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: { text?: string };
};

type ParsedDate = {
  year: number;
  month: number;
  day: number;
};

type DateCandidate = ParsedDate & {
  score: number;
  source: "provided" | "text" | "billing-folio";
};

const DEFAULT_MINIMAX_MCP_TIMEOUT_MS = 180_000;

export async function processReceipt(input: ProcessReceiptInput): Promise<OcrResult> {
  const { imageBuffer, mimeType = "image/jpeg", traceId = `ocr-${randomUUID()}` } = input;
  const startedAt = Date.now();
  ocrLog("started", { traceId, mimeType, bytes: imageBuffer.byteLength });

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const categoryNames = categories.map((c) => c.name);
  ocrLog("categories_loaded", { traceId, count: categoryNames.length, ms: Date.now() - startedAt });

  try {
    if (process.env.MINIMAX_API_KEY) {
      const result = await processWithMiniMax(imageBuffer, mimeType, categoryNames, traceId);
      ocrLog("finished", { traceId, provider: "minimax", ms: Date.now() - startedAt });
      return result;
    }

    if (process.env.OPENAI_API_KEY) {
      const result = await processWithOpenAI(imageBuffer, mimeType, categoryNames, traceId);
      ocrLog("finished", { traceId, provider: "openai", ms: Date.now() - startedAt });
      return result;
    }

    throw new Error("MINIMAX_API_KEY u OPENAI_API_KEY no configurada");
  } catch (error) {
    ocrError("failed", error, { traceId, ms: Date.now() - startedAt });
    throw error;
  }
}

async function processWithMiniMax(
  imageBuffer: Buffer,
  mimeType: string,
  categoryNames: string[],
  traceId: string
): Promise<OcrResult> {
  const startedAt = Date.now();
  const tempDir = join(tmpdir(), "expense-tracker-ocr");
  await mkdir(tempDir, { recursive: true });

  const imagePath = join(tempDir, `receipt-${randomUUID()}${extensionForMimeType(mimeType)}`);
  await writeFile(imagePath, imageBuffer);
  ocrLog("minimax_temp_file_written", { traceId, bytes: imageBuffer.byteLength, ms: Date.now() - startedAt });

  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      MINIMAX_API_HOST: process.env.MINIMAX_API_HOST || "https://api.minimax.io",
      MINIMAX_MCP_BASE_PATH: process.env.MINIMAX_MCP_BASE_PATH || tempDir,
      MINIMAX_API_RESOURCE_MODE: process.env.MINIMAX_API_RESOURCE_MODE || "local",
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );

  const transport = new StdioClientTransport({
    command: process.env.MINIMAX_MCP_COMMAND || "uvx",
    args: (process.env.MINIMAX_MCP_ARGS || "minimax-coding-plan-mcp").split(" "),
    env,
  });
  const client = new Client({ name: "expense-tracker-ocr", version: "0.1.0" });
  const timeout = minimaxMcpTimeoutMs();

  try {
    ocrLog("minimax_connect_started", { traceId, command: process.env.MINIMAX_MCP_COMMAND || "uvx" });
    await client.connect(transport);
    ocrLog("minimax_connect_finished", { traceId, ms: Date.now() - startedAt });

    const callStartedAt = Date.now();
    ocrLog("minimax_understand_image_started", { traceId, timeout });
    const result = (await client.callTool({
      name: "understand_image",
      arguments: {
        image_source: imagePath,
        prompt: buildReceiptPrompt(categoryNames),
      },
    }, undefined, { timeout })) as MiniMaxToolResult;
    ocrLog("minimax_understand_image_finished", { traceId, ms: Date.now() - callStartedAt });

    const text = getToolText(result);
    if (result.isError) {
      throw new Error(text || "MiniMax no pudo procesar la imagen");
    }

    const normalized = normalizeOcrResult(parseJson(text), text, categoryNames);
    ocrLog("minimax_result_normalized", {
      traceId,
      amount: normalized.amount,
      category: normalized.category,
      hasText: Boolean(normalized.ocrText),
      itemCount: normalized.receiptData.items.length,
      ms: Date.now() - startedAt,
    });
    return normalized;
  } finally {
    await client.close().catch((error) => ocrError("minimax_client_close_failed", error, { traceId }));
    await unlink(imagePath).catch((error) => ocrError("minimax_temp_file_delete_failed", error, { traceId }));
    ocrLog("minimax_cleanup_finished", { traceId, ms: Date.now() - startedAt });
  }
}

async function processWithOpenAI(
  imageBuffer: Buffer,
  mimeType: string,
  categoryNames: string[],
  traceId: string
): Promise<OcrResult> {
  const startedAt = Date.now();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const base64 = imageBuffer.toString("base64");

  ocrLog("openai_request_started", { traceId });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildReceiptPrompt(categoryNames) },
      {
        role: "user",
        content: [
          { type: "text", text: "Analiza este recibo y extrae la informacion:" },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
          },
        ],
      },
    ],
    max_tokens: 2500,
    temperature: 0.1,
  });
  ocrLog("openai_request_finished", { traceId, ms: Date.now() - startedAt });

  const content = response.choices[0]?.message?.content?.trim() || "";
  return normalizeOcrResult(parseJson(content), content, categoryNames);
}

function buildReceiptPrompt(categoryNames: string[]) {
  const categories = categoryNames.length ? categoryNames.join(", ") : "Otros";

  return `Eres un asistente que analiza imagenes de tickets, recibos y facturas mexicanas.
Responde SOLO con JSON valido, sin markdown, sin backticks y sin explicaciones.

Extrae esta estructura exacta:
{
  "ocrText": "texto completo extraido del recibo, incluyendo renglones de productos",
  "amount": numero total final pagado,
  "description": "nombre del comercio o concepto principal",
  "category": "una de estas categorias: ${categories}",
  "date": "fecha del recibo en formato YYYY-MM-DD si es visible, o null",
  "receiptData": {
    "merchant": "nombre del comercio o null",
    "address": "direccion/sucursal si es visible, o null",
    "subtotal": numero o null,
    "tax": numero o null,
    "total": numero final pagado o null,
    "paymentMethod": "efectivo, tarjeta, transferencia, vales, mixto o null",
    "cardLast4": "ultimos 4 digitos si son visibles, o null",
    "ticketNumber": "folio/ticket/facturar/autorizacion si es visible, o null",
    "items": [
      {
        "quantity": numero o null,
        "unit": "pieza, kg, g, l, paquete o null",
        "sku": "codigo del producto si es visible, o null",
        "description": "descripcion del producto",
        "unitPrice": numero o null,
        "total": numero de ese renglon o null,
        "rawText": "renglon original del ticket"
      }
    ]
  }
}

Reglas:
- Usa el total final pagado, no subtotal.
- Para date, usa la fecha real de compra/transaccion, no la fecha limite para facturar.
- Si el ticket tiene una linea final con cajero/TP/Tick y hora, prioriza esa fecha.
- En tickets mexicanos, si aparece un folio de facturacion con una fecha compacta tipo YYMMDD, usalo como pista para validar el año.
- Lee el año con especial cuidado: no confundas 2026 con 2024.
- Extrae TODOS los productos visibles del desglose, sin resumirlos.
- Si hay cantidades por peso como 0.345 kg, conserva quantity=0.345 y unit="kg".
- Si hay varios montos, prioriza TOTAL, TOTAL A PAGAR, IMPORTE, o Total tarjeta.
- No inventes datos que no sean visibles: usa null.
- Para category, elige la mas apropiada basandote en el comercio y productos.`;
}

function normalizeOcrResult(parsed: unknown, rawContent: string, categoryNames: string[]): OcrResult {
  const data = isRecord(parsed) ? parsed : {};
  const receiptData = normalizeReceiptData(data.receiptData, data);
  const category = typeof data.category === "string" && categoryNames.includes(data.category)
    ? data.category
    : categoryNames[0] || "Otros";

  return {
    ocrText: typeof data.ocrText === "string" ? data.ocrText : rawContent || null,
    amount: toNumber(data.amount) ?? receiptData.total,
    description: typeof data.description === "string" ? data.description : receiptData.merchant,
    category,
    date: normalizeReceiptDate(typeof data.date === "string" ? data.date : null, typeof data.ocrText === "string" ? data.ocrText : rawContent),
    receiptData,
  };
}

export function normalizeReceiptDate(date: string | null, ocrText: string | null) {
  const candidates: DateCandidate[] = [];
  const deadlineDates: ParsedDate[] = [];

  if (date) {
    for (const parsed of parseDatesFromText(date)) {
      candidates.push({ ...parsed, score: 20, source: "provided" });
    }
  }

  for (const line of (ocrText || "").split(/\r?\n/)) {
    const normalizedLine = line.trim();
    if (!normalizedLine) continue;

    const isDeadline = /fecha\s+l[ií]mite|limite\s+para\s+facturar/i.test(normalizedLine);
    const hasTime = /\b\d{1,2}:\d{2}\b/.test(normalizedLine);
    const looksLikeTransactionLine = /\b(tp|tick|ticket|cajer[oa]|monica)\b/i.test(normalizedLine);

    for (const parsed of parseDatesFromText(normalizedLine)) {
      if (isDeadline) {
        deadlineDates.push(parsed);
        continue;
      }

      candidates.push({
        ...parsed,
        score: (hasTime ? 80 : 40) + (looksLikeTransactionLine ? 20 : 0),
        source: "text",
      });
    }

    if (/facturar|facturaci[oó]n/i.test(normalizedLine)) {
      for (const parsed of parseCompactBillingDates(normalizedLine)) {
        candidates.push({ ...parsed, score: 70, source: "billing-folio" });
      }
    }
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) return null;

  const billingHint = candidates.find(
    (candidate) => candidate.source === "billing-folio" && candidate.month === best.month && candidate.day === best.day
  );
  const correctedByBilling = billingHint ? { ...best, year: billingHint.year } : best;
  const correctedByDeadline = correctYearUsingDeadline(correctedByBilling, deadlineDates);

  return formatDate(correctedByDeadline);
}

function normalizeReceiptData(receiptData: unknown, fallback: Record<string, unknown>): ReceiptData {
  const data = isRecord(receiptData) ? receiptData : {};
  const rawItems = Array.isArray(data.items) ? data.items : [];

  return {
    merchant: toStringOrNull(data.merchant) ?? toStringOrNull(fallback.description),
    address: toStringOrNull(data.address),
    subtotal: toNumber(data.subtotal),
    tax: toNumber(data.tax),
    total: toNumber(data.total) ?? toNumber(fallback.amount),
    paymentMethod: toStringOrNull(data.paymentMethod),
    cardLast4: toStringOrNull(data.cardLast4),
    ticketNumber: toStringOrNull(data.ticketNumber),
    items: rawItems.map(normalizeReceiptItem).filter((item): item is ReceiptItem => item !== null),
  } satisfies ReceiptData;
}

function normalizeReceiptItem(item: unknown): ReceiptItem | null {
  if (!isRecord(item)) return null;
  const description = toStringOrNull(item.description);
  const rawText = toStringOrNull(item.rawText) ?? description;
  if (!description || !rawText) return null;

  return {
    quantity: toNumber(item.quantity),
    unit: toStringOrNull(item.unit),
    sku: toStringOrNull(item.sku),
    description,
    unitPrice: toNumber(item.unitPrice),
    total: toNumber(item.total),
    rawText,
  };
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch {
    return null;
  }
}

function parseDatesFromText(text: string): ParsedDate[] {
  const dates: ParsedDate[] = [];
  const dayFirstPattern = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\b/g;
  const yearFirstPattern = /\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/g;

  for (const match of text.matchAll(dayFirstPattern)) {
    const year = normalizeYear(Number(match[3]));
    const month = Number(match[2]);
    const day = Number(match[1]);
    if (isValidDateParts(year, month, day)) dates.push({ year, month, day });
  }

  for (const match of text.matchAll(yearFirstPattern)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (isValidDateParts(year, month, day)) dates.push({ year, month, day });
  }

  return dates;
}

function parseCompactBillingDates(text: string): ParsedDate[] {
  const dates: ParsedDate[] = [];

  for (const match of text.matchAll(/\b(\d{2})(\d{2})(\d{2})\b/g)) {
    const year = normalizeYear(Number(match[1]));
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (isValidDateParts(year, month, day)) dates.push({ year, month, day });
  }

  return dates;
}

function correctYearUsingDeadline(date: ParsedDate, deadlines: ParsedDate[]) {
  for (const deadline of deadlines) {
    if (deadline.year === date.year) continue;

    const corrected = { ...date, year: deadline.year };
    if (!isValidDateParts(corrected.year, corrected.month, corrected.day)) continue;

    const daysBeforeDeadline = daysBetween(corrected, deadline);
    if (daysBeforeDeadline >= 0 && daysBeforeDeadline <= 60) return corrected;
  }

  return date;
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function daysBetween(start: ParsedDate, end: ParsedDate) {
  const startDate = Date.UTC(start.year, start.month - 1, start.day);
  const endDate = Date.UTC(end.year, end.month - 1, end.day);
  return Math.floor((endDate - startDate) / 86_400_000);
}

function formatDate(date: ParsedDate) {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

function getToolText(result: MiniMaxToolResult): string {
  if (typeof result.structuredContent?.text === "string") return result.structuredContent.text;
  return result.content?.find((item) => item.type === "text" && item.text)?.text ?? "";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  return ".jpg";
}

function minimaxMcpTimeoutMs() {
  const configured = Number(process.env.MINIMAX_MCP_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MINIMAX_MCP_TIMEOUT_MS;
}

function ocrLog(event: string, details: Record<string, unknown> = {}) {
  console.log(`[ocr] ${JSON.stringify({ event, ...details })}`);
}

function ocrError(event: string, error: unknown, details: Record<string, unknown> = {}) {
  console.error(`[ocr] ${JSON.stringify({ event, ...details, ...errorDetails(error) })}`);
}

function errorDetails(error: unknown) {
  const cause = error instanceof Error && "cause" in error ? error.cause : null;
  const causeRecord = isRecord(cause) ? cause : null;

  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    causeCode: typeof causeRecord?.code === "string" ? causeRecord.code : null,
    causeHostname: typeof causeRecord?.hostname === "string" ? causeRecord.hostname : null,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
