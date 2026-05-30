import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteInstallmentPlan, updateInstallmentPlan } from "@/lib/services";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const plan = await updateInstallmentPlan(id, session.id, await req.json());
    if (!plan) return NextResponse.json({ error: "Mensualidad no encontrada" }, { status: 404 });
    return NextResponse.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar mensualidad";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const plan = await deleteInstallmentPlan(id, session.id);
  if (!plan) return NextResponse.json({ error: "Mensualidad no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
