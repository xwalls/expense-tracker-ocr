import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listRecurringPaymentOccurrences } from "@/lib/services";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const now = new Date();
    const month = Number(url.searchParams.get("month") || now.getMonth() + 1);
    const year = Number(url.searchParams.get("year") || now.getFullYear());
    const occurrences = await listRecurringPaymentOccurrences(session.id, month, year);
    return NextResponse.json(occurrences);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al listar pagos esperados";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
