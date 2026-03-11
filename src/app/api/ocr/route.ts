import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { processReceipt } from "@/lib/services";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se envio imagen" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || "image/jpeg";

    const result = await processReceipt({ imageBuffer: buffer, mimeType });

    return NextResponse.json(result);
  } catch (error) {
    console.error("OCR error:", error);
    const message = error instanceof Error ? error.message : "Error al procesar la imagen con OpenAI";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
