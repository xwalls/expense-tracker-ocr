import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createExpense, listExpenses } from "@/lib/services";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");
  const categoryId = url.searchParams.get("categoryId");

  const expenses = await listExpenses({
    userId: session.id,
    month: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
    categoryId: categoryId || undefined,
  });

  return NextResponse.json(expenses);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await req.json();
    const { amount, description, date, categoryId, ocrText, receipt } = body;

    const expense = await createExpense({
      amount,
      description,
      categoryId,
      userId: session.id,
      date,
      receipt,
      ocrText,
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Error al crear gasto";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
