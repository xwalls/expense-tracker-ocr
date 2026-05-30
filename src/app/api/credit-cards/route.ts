import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCreditCard, listCreditCards } from "@/lib/services";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cards = await listCreditCards(session.id);
  return NextResponse.json(cards);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const card = await createCreditCard(session.id, await req.json());
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear tarjeta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
