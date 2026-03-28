import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createIncome, listIncome, checkDuplicateUuid } from "@/lib/services";
import type { IncomeSource } from "@prisma/client";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");
  const source = url.searchParams.get("source") as IncomeSource | null;

  const result = await listIncome({
    userId: session.id,
    month: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
    source: source || undefined,
  });

  return NextResponse.json({
    count: result.incomes.length,
    incomes: result.incomes,
    totalAmount: result.totalAmount,
    totalBankDeposit: result.totalBankDeposit,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      amount,
      bankDeposit,
      despensa,
      description,
      source,
      date,
      periodStart,
      periodEnd,
      cfdiUuid,
      cfdiXml,
      employer,
    } = body;

    if (amount == null || bankDeposit == null || !description) {
      return NextResponse.json(
        { error: "Campos requeridos: amount, bankDeposit, description" },
        { status: 400 }
      );
    }

    const income = await createIncome({
      amount,
      bankDeposit,
      despensa,
      description,
      source,
      date,
      periodStart,
      periodEnd,
      cfdiUuid,
      cfdiXml,
      employer,
      userId: session.id,
    });

    return NextResponse.json(income, { status: 201 });
  } catch (error) {
    console.error("Create income error:", error);

    // Handle Prisma unique constraint violation (duplicate cfdiUuid)
    if (
      error instanceof Error &&
      "code" in error &&
      (error as unknown as { code: string }).code === "P2002"
    ) {
      const existing = cfdiUuid ? await checkDuplicateUuid(cfdiUuid) : null;
      return NextResponse.json(
        { error: "Este CFDI ya fue importado", existingId: existing?.id ?? null },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : "Error al crear ingreso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
