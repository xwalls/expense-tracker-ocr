import { NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/services";

export async function POST(req: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    telegramWebhookLog("secret_missing");
    return NextResponse.json({ error: "Telegram webhook secret not configured" }, { status: 503 });
  }

  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (receivedSecret !== expectedSecret) {
    telegramWebhookLog("secret_invalid");
    return NextResponse.json({ error: "Invalid Telegram secret" }, { status: 401 });
  }

  try {
    const update = await req.json();
    telegramWebhookLog("accepted", summarizeTelegramUpdate(update));
    void handleTelegramUpdate(update).catch((error) => {
      telegramWebhookError("background_error", error);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    telegramWebhookError("request_error", error);
    return NextResponse.json({ ok: true });
  }
}

function telegramWebhookLog(event: string, details: Record<string, unknown> = {}) {
  console.log(`[telegram-webhook] ${JSON.stringify({ event, ...details })}`);
}

function telegramWebhookError(event: string, error: unknown) {
  console.error(`[telegram-webhook] ${JSON.stringify({ event, ...errorDetails(error) })}`);
}

function summarizeTelegramUpdate(update: unknown) {
  if (!isRecord(update)) return { updateType: typeof update };

  const message = isRecord(update.message) ? update.message : null;
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const text = typeof message?.text === "string" ? message.text : null;

  return {
    updateId: typeof update.update_id === "number" ? update.update_id : null,
    messageId: typeof message?.message_id === "number" ? message.message_id : null,
    chatId: typeof chat?.id === "number" || typeof chat?.id === "string" ? String(chat.id) : null,
    kind: Array.isArray(message?.photo) ? "photo" : text?.startsWith("/start") ? "start" : text ? "text" : "unknown",
    photoCount: Array.isArray(message?.photo) ? message.photo.length : 0,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
