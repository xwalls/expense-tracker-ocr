import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createInstallmentPlan, listInstallmentPlans } from "@/lib/services";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const plans = await listInstallmentPlans(session.id);
  return NextResponse.json(plans);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const plan = await createInstallmentPlan(session.id, await req.json());
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear mensualidad";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
