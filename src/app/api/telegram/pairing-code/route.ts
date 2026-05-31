import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTelegramPairingCode } from "@/lib/services";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const pairingCode = await createTelegramPairingCode(session.id);
  return NextResponse.json({
    code: pairingCode.code,
    expiresAt: pairingCode.expiresAt.toISOString(),
  });
}
