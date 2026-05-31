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
  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const text = message.text?.trim();

  if (text?.startsWith("/start")) {
    await handleStart(chatId, message.from, text);
    return;
  }

  if (message.photo?.length) {
    await handlePhoto(chatId, message);
    return;
  }

  await safeSendTelegramMessage(chatId, "Mandame una foto de un ticket o conectá tu cuenta con /start CODIGO desde la app.");
}

async function handleStart(chatId: string, from: TelegramUser | undefined, text: string) {
  const code = text.split(/\s+/)[1]?.trim().toUpperCase();
  if (!code) {
    await safeSendTelegramMessage(chatId, "Generá un código en la app y mandame /start CODIGO para conectar Telegram.");
    return;
  }

  const pairing = await prisma.telegramPairingCode.findUnique({ where: { code } });
  if (!pairing || pairing.consumedAt || pairing.expiresAt < new Date()) {
    await safeSendTelegramMessage(chatId, "Ese código no existe o ya expiró. Generá uno nuevo en la app.");
    return;
  }

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

  await safeSendTelegramMessage(chatId, "Telegram conectado. Mandame fotos de tickets y las voy a dejar como drafts para revisar en Escanear.");
}

async function handlePhoto(chatId: string, message: TelegramMessage) {
  const connection = await prisma.telegramConnection.findUnique({ where: { chatId } });
  if (!connection || connection.status !== "ACTIVE") {
    await safeSendTelegramMessage(chatId, "Este chat no está conectado. Generá un código en la app y mandame /start CODIGO.");
    return;
  }

  const photo = [...(message.photo || [])].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
  if (!photo) return;

  const existing = await findTelegramReceiptDraft(connection.userId, photo.file_unique_id);
  if (existing) {
    await safeSendTelegramMessage(chatId, "Ese ticket ya estaba recibido. Lo tenés en drafts de Escanear.");
    return;
  }

  const draft = await createReceiptDraft(connection.userId, {
    source: "TELEGRAM",
    status: "PROCESSING",
    telegramChatId: chatId,
    telegramMessageId: message.message_id,
    telegramFileUniqueId: photo.file_unique_id,
  });

  await safeSendTelegramMessage(chatId, "Recibí el ticket. Lo dejé en cola y lo voy a procesar con OCR...");

  await enqueueTelegramOcr(() => processTelegramReceiptDraft(draft.id, connection.userId, chatId, message, photo));
}

async function processTelegramReceiptDraft(
  draftId: string,
  userId: string,
  chatId: string,
  message: TelegramMessage,
  photo: NonNullable<TelegramMessage["photo"]>[number]
) {
  try {
    const imageBuffer = await downloadTelegramFile(photo.file_id);
    const result = await processReceipt({ imageBuffer, mimeType: "image/jpeg" });
    const categoryId = await findCategoryIdByName(result.category);

    const updated = await updateReceiptDraft(draftId, userId, {
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

    await safeSendTelegramMessage(
      chatId,
      `Listo. Draft creado: ${updated?.description || "Recibo"} · ${formatMoney(updated?.amount)}. Revisalo en Escanear: ${dashboardScanUrl()}`
    );
  } catch (error) {
    await updateReceiptDraft(draftId, userId, {
      source: "TELEGRAM",
      status: "ERROR",
      error: error instanceof Error ? error.message : "Error al procesar ticket",
      telegramChatId: chatId,
      telegramMessageId: message.message_id,
      telegramFileUniqueId: photo.file_unique_id,
    });
    await safeSendTelegramMessage(chatId, "No pude procesar ese ticket. Quedó como draft con error en Escanear.");
  }
}

function enqueueTelegramOcr(job: () => Promise<void>) {
  telegramOcrQueue = telegramOcrQueue.then(job, job);
  return telegramOcrQueue;
}

async function downloadTelegramFile(fileId: string) {
  const file = await callTelegram<{ file_path: string }>("getFile", { file_id: fileId });
  const token = requireTelegramBotToken();
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
    console.error("Telegram sendMessage failed:", error);
  }
}

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = requireTelegramBotToken();
  const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result as T;
}

async function fetchWithRetry(input: string, init?: RequestInit) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TELEGRAM_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt === TELEGRAM_RETRY_ATTEMPTS) break;
      await delay(TELEGRAM_RETRY_BASE_DELAY_MS * attempt);
    }
  }

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
