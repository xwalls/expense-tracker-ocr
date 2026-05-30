import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteCreditCard, updateCreditCard } from "@/lib/services";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const card = await updateCreditCard(id, session.id, await req.json());
    if (!card) return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
    return NextResponse.json(card);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar tarjeta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const card = await deleteCreditCard(id, session.id);
  if (!card) return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
