import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseCFDI, CFDIParseError, checkDuplicateUuid } from "@/lib/services";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("xml") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se envió archivo XML" }, { status: 400 });
    }

    // Validate file is XML by extension or MIME type
    const isXmlByName = file.name.toLowerCase().endsWith(".xml");
    const isXmlByMime =
      file.type === "text/xml" ||
      file.type === "application/xml";

    if (!isXmlByName && !isXmlByMime) {
      return NextResponse.json({ error: "El archivo debe ser XML" }, { status: 400 });
    }

    const xmlString = await file.text();

    let parsed;
    try {
      parsed = parseCFDI(xmlString);
    } catch (err) {
      if (err instanceof CFDIParseError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: 422 }
        );
      }
      throw err;
    }

    // Check for duplicate CFDI (global check — UUID is unique across all users)
    const existing = await checkDuplicateUuid(parsed.uuid);
    if (existing) {
      return NextResponse.json(
        { error: "DUPLICATE_UUID", message: "Este CFDI ya fue importado", existingId: existing.id },
        { status: 409 }
      );
    }

    return NextResponse.json({
      parsed,
      suggested: parsed.suggestedIncome,
      duplicate: false,
      existingId: null,
    });
  } catch (error) {
    console.error("Income upload error:", error);
    const message = error instanceof Error ? error.message : "Error al procesar el archivo XML";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
