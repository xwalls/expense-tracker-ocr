import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getIncomeById, deleteIncome } from "@/lib/services";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const income = await getIncomeById(id, session.id);
  if (!income) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });

  return NextResponse.json(income);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const deleted = await deleteIncome(id, session.id);
  if (!deleted) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
