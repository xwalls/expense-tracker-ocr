import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getExpenseStats } from "@/lib/services";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const month = Number(url.searchParams.get("month") || new Date().getMonth() + 1);
  const year = Number(url.searchParams.get("year") || new Date().getFullYear());

  const stats = await getExpenseStats({ userId: session.id, month, year });

  return NextResponse.json(stats);
}
