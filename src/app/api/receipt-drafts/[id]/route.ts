import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteReceiptDraft, updateReceiptDraft } from "@/lib/services";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const draft = await updateReceiptDraft(id, session.id, await req.json());
    if (!draft) return NextResponse.json({ error: "Draft no encontrado" }, { status: 404 });
    return NextResponse.json(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const draft = await deleteReceiptDraft(id, session.id);
  if (!draft) return NextResponse.json({ error: "Draft no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
