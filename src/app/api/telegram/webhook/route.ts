import { NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/services";

export async function POST(req: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "Telegram webhook secret not configured" }, { status: 503 });
  }

  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid Telegram secret" }, { status: 401 });
  }

  try {
    const update = await req.json();
    void handleTelegramUpdate(update).catch((error) => {
      console.error("Telegram webhook background error:", error);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
