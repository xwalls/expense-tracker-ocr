import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveReceiptDraft } from "@/lib/services";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const draft = await saveReceiptDraft(id, session.id);
    if (!draft) return NextResponse.json({ error: "Draft no encontrado" }, { status: 404 });
    return NextResponse.json(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al guardar draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
