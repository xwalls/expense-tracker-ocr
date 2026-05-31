import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteRecurringPayment, updateRecurringPayment } from "@/lib/services";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const payment = await updateRecurringPayment(id, session.id, await req.json());
    if (!payment) return NextResponse.json({ error: "Pago recurrente no encontrado" }, { status: 404 });
    return NextResponse.json(payment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar pago recurrente";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const payment = await deleteRecurringPayment(id, session.id);
  if (!payment) return NextResponse.json({ error: "Pago recurrente no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
