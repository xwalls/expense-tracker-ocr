import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTelegramConnection, revokeTelegramConnection } from "@/lib/services";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const connection = await getTelegramConnection(session.id);
  return NextResponse.json({ connection });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await revokeTelegramConnection(session.id);
  return NextResponse.json({ ok: true });
}
