import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAccount, listAccounts } from "@/lib/services";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const accounts = await listAccounts(session.id);
  return NextResponse.json(accounts);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const account = await createAccount(session.id, await req.json());
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear cuenta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
