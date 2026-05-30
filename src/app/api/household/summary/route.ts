import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHouseholdSummary } from "@/lib/services";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");

  const summary = await getHouseholdSummary({
    userId: session.id,
    month: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
  });

  return NextResponse.json(summary);
}
