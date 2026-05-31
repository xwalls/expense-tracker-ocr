import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { markRecurringPaymentOccurrencePaid } from "@/lib/services";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const occurrence = await markRecurringPaymentOccurrencePaid(id, session.id, await req.json().catch(() => ({})));
    if (!occurrence) return NextResponse.json({ error: "Pago esperado no encontrado" }, { status: 404 });
    return NextResponse.json(occurrence);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al marcar pago como pagado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
