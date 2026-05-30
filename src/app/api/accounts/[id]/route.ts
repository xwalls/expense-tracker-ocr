import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteAccount, updateAccount } from "@/lib/services";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const account = await updateAccount(id, session.id, await req.json());
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    return NextResponse.json(account);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar cuenta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const account = await deleteAccount(id, session.id);
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
