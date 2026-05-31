import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { processReceipt } from "./ocr";
import {
  createReceiptDraft,
  findCategoryIdByName,
  findTelegramReceiptDraft,
  updateReceiptDraft,
} from "./receipt-drafts";

const PAIRING_TTL_MINUTES = 10;
const TELEGRAM_RETRY_ATTEMPTS = 3;
const TELEGRAM_RETRY_BASE_DELAY_MS = 750;

let telegramOcrQueue: Promise<void> = Promise.resolve();

type TelegramUser = {
  id: number;
  first_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string };
  from?: TelegramUser;
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; file_size?: number; width: number; height: number }>;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

export async function getTelegramConnection(userId: string) {
  return prisma.telegramConnection.findUnique({ where: { userId } });
}

export async function createTelegramPairingCode(userId: string) {
  const code = await generateUniquePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60 * 1000);

  await prisma.telegramPairingCode.updateMany({
    where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  return prisma.telegramPairingCode.create({
    data: { userId, code, expiresAt },
  });
}

export async function revokeTelegramConnection(userId: string) {
  const existing = await prisma.telegramConnection.findUnique({ where: { userId } });
  if (!existing) return null;

  return prisma.telegramConnection.update({
    where: { userId },
    data: { status: "REVOKED" },
  });
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const traceId = telegramTraceId(update);
  const message = update.message;
  if (!message) {
    telegramLog("update_ignored", { traceId, reason: "missing_message", updateId: update.update_id ?? null });
    return;
  }

  const chatId = String(message.chat.id);
  const text = message.text?.trim();

  telegramLog("update_received", {
    traceId,
    updateId: update.update_id ?? null,
    messageId: message.message_id,
    chatId,
    kind: messageKind(message),
    photoCount: message.photo?.length ?? 0,
  });

  if (text?.startsWith("/start")) {
    await handleStart(chatId, message.from, text, traceId);
    return;
  }

  if (message.photo?.length) {
    await handlePhoto(chatId, message, traceId);
    return;
  }

  await safeSendTelegramMessage(chatId, "Mandame una foto de un ticket o conectá tu cuenta con /start CODIGO desde la app.");
}

async function handleStart(chatId: string, from: TelegramUser | undefined, text: string, traceId: string) {
  const code = text.split(/\s+/)[1]?.trim().toUpperCase();
  if (!code) {
    telegramLog("pairing_rejected", { traceId, chatId, reason: "missing_code" });
    await safeSendTelegramMessage(chatId, "Generá un código en la app y mandame /start CODIGO para conectar Telegram.");
    return;
  }

  const pairing = await prisma.telegramPairingCode.findUnique({ where: { code } });
  if (!pairing || pairing.consumedAt || pairing.expiresAt < new Date()) {
    telegramLog("pairing_rejected", { traceId, chatId, reason: "invalid_or_expired_code" });
    await safeSendTelegramMessage(chatId, "Ese código no existe o ya expiró. Generá uno nuevo en la app.");
    return;
  }

  telegramLog("pairing_started", { traceId, chatId, pairingId: pairing.id });

  await prisma.$transaction(async (tx) => {
    await tx.telegramConnection.deleteMany({
      where: { OR: [{ userId: pairing.userId }, { chatId }] },
    });
    await tx.telegramConnection.create({
      data: {
        userId: pairing.userId,
        chatId,
        telegramUserId: from?.id == null ? null : String(from.id),
        username: from?.username || null,
        firstName: from?.first_name || null,
        status: "ACTIVE",
      },
    });
    await tx.telegramPairingCode.update({ where: { id: pairing.id }, data: { consumedAt: new Date() } });
  });

  telegramLog("pairing_connected", { traceId, chatId, pairingId: pairing.id });
  await safeSendTelegramMessage(chatId, "Telegram conectado. Mandame fotos de tickets y las voy a dejar como drafts para revisar en Escanear.");
}

async function handlePhoto(chatId: string, message: TelegramMessage, traceId: string) {
  const connection = await prisma.telegramConnection.findUnique({ where: { chatId } });
  if (!connection || connection.status !== "ACTIVE") {
    telegramLog("photo_rejected", { traceId, chatId, reason: "inactive_connection" });
    await safeSendTelegramMessage(chatId, "Este chat no está conectado. Generá un código en la app y mandame /start CODIGO.");
    return;
  }

  const photo = [...(message.photo || [])].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
  if (!photo) {
    telegramLog("photo_rejected", { traceId, chatId, reason: "missing_photo" });
    return;
  }

  const existing = await findTelegramReceiptDraft(connection.userId, photo.file_unique_id);
  if (existing) {
    telegramLog("photo_duplicate", { traceId, chatId, draftId: existing.id, telegramFileUniqueId: photo.file_unique_id });
    await safeSendTelegramMessage(chatId, "Ese ticket ya estaba recibido. Lo tenés en drafts de Escanear.");
    return;
  }

  const draft = await createReceiptDraft(connection.userId, {
    traceId,
    source: "TELEGRAM",
    status: "PROCESSING",
    telegramChatId: chatId,
    telegramMessageId: message.message_id,
    telegramFileUniqueId: photo.file_unique_id,
  });

  telegramLog("draft_created", {
    traceId,
    chatId,
    draftId: draft.id,
    messageId: message.message_id,
    telegramFileUniqueId: photo.file_unique_id,
    fileSize: photo.file_size ?? null,
  });

  await safeSendTelegramMessage(chatId, "Recibí el ticket. Lo dejé en cola y lo voy a procesar con OCR...");

  await enqueueTelegramOcr(traceId, draft.id, () => processTelegramReceiptDraft(draft.id, connection.userId, chatId, message, photo, traceId));
}

async function processTelegramReceiptDraft(
  draftId: string,
  userId: string,
  chatId: string,
  message: TelegramMessage,
  photo: NonNullable<TelegramMessage["photo"]>[number],
  traceId: string
) {
  try {
    telegramLog("ocr_started", { traceId, chatId, draftId, messageId: message.message_id });
    const imageBuffer = await downloadTelegramFile(photo.file_id, traceId, draftId);
    telegramLog("telegram_file_downloaded", { traceId, chatId, draftId, bytes: imageBuffer.byteLength });

    const result = await processReceipt({ imageBuffer, mimeType: "image/jpeg", traceId });
    telegramLog("ocr_finished", {
      traceId,
      chatId,
      draftId,
      amount: result.amount,
      category: result.category,
      hasText: Boolean(result.ocrText),
      itemCount: result.receiptData.items.length,
    });

    const categoryId = await findCategoryIdByName(result.category);

    const updated = await updateReceiptDraft(draftId, userId, {
      traceId,
      source: "TELEGRAM",
      status: "READY",
      amount: result.amount,
      description: result.description || "Recibo escaneado",
      categoryId,
      date: result.date,
      ocrText: result.ocrText,
      receiptData: result.receiptData as unknown as Prisma.InputJsonValue,
      telegramChatId: chatId,
      telegramMessageId: message.message_id,
      telegramFileUniqueId: photo.file_unique_id,
    });

    telegramLog("draft_ready", { traceId, chatId, draftId, hasDescription: Boolean(updated?.description) });

    await safeSendTelegramMessage(
      chatId,
      `Listo. Draft creado: ${updated?.description || "Recibo"} · ${formatMoney(updated?.amount)}. Revisalo en Escanear: ${dashboardScanUrl()}`
    );
  } catch (error) {
    await updateReceiptDraft(draftId, userId, {
      traceId,
      source: "TELEGRAM",
      status: "ERROR",
      error: error instanceof Error ? error.message : "Error al procesar ticket",
      telegramChatId: chatId,
      telegramMessageId: message.message_id,
      telegramFileUniqueId: photo.file_unique_id,
    });
    telegramError("ocr_failed", error, { traceId, chatId, draftId, messageId: message.message_id });
    await safeSendTelegramMessage(chatId, "No pude procesar ese ticket. Quedó como draft con error en Escanear.");
  }
}

function enqueueTelegramOcr(traceId: string, draftId: string, job: () => Promise<void>) {
  telegramLog("ocr_queued", { traceId, draftId });
  telegramOcrQueue = telegramOcrQueue.then(job, job);
  return telegramOcrQueue;
}

async function downloadTelegramFile(fileId: string, traceId: string, draftId: string) {
  telegramLog("telegram_get_file_started", { traceId, draftId });
  const file = await callTelegram<{ file_path: string }>("getFile", { file_id: fileId });
  const token = requireTelegramBotToken();
  telegramLog("telegram_file_download_started", { traceId, draftId, filePath: file.file_path });
  const res = await fetchWithRetry(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error("No se pudo descargar la imagen desde Telegram");
  return Buffer.from(await res.arrayBuffer());
}

async function sendTelegramMessage(chatId: string, text: string) {
  await callTelegram("sendMessage", { chat_id: chatId, text });
}

async function safeSendTelegramMessage(chatId: string, text: string) {
  try {
    await sendTelegramMessage(chatId, text);
  } catch (error) {
    telegramError("send_message_failed", error, { chatId });
  }
}

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = requireTelegramBotToken();
  telegramLog("api_call_started", { method });
  const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  telegramLog("api_call_finished", { method, status: res.status });
  return data.result as T;
}

async function fetchWithRetry(input: string, init?: RequestInit) {
  let lastError: unknown;
  const target = telegramFetchTarget(input);

  for (let attempt = 1; attempt <= TELEGRAM_RETRY_ATTEMPTS; attempt++) {
    try {
      telegramLog("fetch_attempt", { target, attempt });
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      telegramError("fetch_attempt_failed", error, { target, attempt });
      if (attempt === TELEGRAM_RETRY_ATTEMPTS) break;
      await delay(TELEGRAM_RETRY_BASE_DELAY_MS * attempt);
    }
  }

  telegramError("fetch_failed", lastError, { target, attempts: TELEGRAM_RETRY_ATTEMPTS });
  throw lastError;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  return token;
}

function telegramTraceId(update: TelegramUpdate) {
  const messageId = update.message?.message_id ?? "no-message";
  return `tg-${update.update_id ?? messageId}`;
}

function messageKind(message: TelegramMessage) {
  if (message.photo?.length) return "photo";
  if (message.text?.startsWith("/start")) return "start";
  if (message.text) return "text";
  return "unknown";
}

function telegramLog(event: string, details: Record<string, unknown> = {}) {
  console.log(`[telegram] ${JSON.stringify({ event, ...details })}`);
}

function telegramError(event: string, error: unknown, details: Record<string, unknown> = {}) {
  console.error(`[telegram] ${JSON.stringify({ event, ...details, ...errorDetails(error) })}`);
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

function telegramFetchTarget(input: string) {
  try {
    const url = new URL(input);
    return `${url.hostname}${url.pathname.includes("/file/") ? "/file" : "/api"}`;
  } catch {
    return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function generateUniquePairingCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    const existing = await prisma.telegramPairingCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("No se pudo generar codigo de Telegram");
}

function dashboardScanUrl() {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
  return baseUrl ? `${baseUrl}/dashboard/scan` : "/dashboard/scan";
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return "monto pendiente";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}
