import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildReceiptFingerprint, findReceiptDuplicateCandidate } from "@/lib/services";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const receiptFingerprint = buildReceiptFingerprint({
    amount: body.amount,
    date: body.date,
    description: body.description,
    receiptData: body.receiptData,
  });
  const candidate = await findReceiptDuplicateCandidate(session.id, receiptFingerprint, body.excludeDraftId);

  return NextResponse.json({ receiptFingerprint, candidate });
}
