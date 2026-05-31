import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createReceiptDraft, listReceiptDrafts } from "@/lib/services";
import type { ReceiptDraftStatus } from "@prisma/client";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ReceiptDraftStatus | null;
  const drafts = await listReceiptDrafts({ userId: session.id, status: status || undefined });
  return NextResponse.json(drafts);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const draft = await createReceiptDraft(session.id, await req.json());
    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
