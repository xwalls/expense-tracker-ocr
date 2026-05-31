import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createRecurringPayment, listRecurringPayments } from "@/lib/services";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const payments = await listRecurringPayments(session.id);
  return NextResponse.json(payments);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const payment = await createRecurringPayment(session.id, await req.json());
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear pago recurrente";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
