import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { CFDIParseError, checkDuplicateUuid, createIncome, parseCFDI } from "@/lib/services";

const MAX_BULK_FILES = 20;

type BulkResult = {
  fileName: string;
  status: "imported" | "duplicate" | "error";
  message: string;
  uuid: string | null;
  tipo: "NOMINA" | "FACTURA" | null;
  employer: string | null;
  date: string | null;
  amount: number | null;
  bankDeposit: number | null;
  despensa: number | null;
  incomeId: string | null;
  existingId: string | null;
};

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const files = formData.getAll("xml").filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No se enviaron archivos XML" }, { status: 400 });
    }

    if (files.length > MAX_BULK_FILES) {
      return NextResponse.json({ error: `Maximo ${MAX_BULK_FILES} XML por lote` }, { status: 400 });
    }

    const seenInBatch = new Set<string>();
    const results: BulkResult[] = [];

    for (const file of files) {
      const baseResult = emptyResult(file.name);

      if (!isXmlFile(file)) {
        results.push({ ...baseResult, status: "error", message: "El archivo debe ser XML" });
        continue;
      }

      try {
        const xmlString = await file.text();
        const parsed = parseCFDI(xmlString);

        if (seenInBatch.has(parsed.uuid)) {
          results.push({
            ...baseResult,
            status: "duplicate",
            message: "UUID repetido dentro del lote",
            uuid: parsed.uuid,
            tipo: parsed.tipo,
            employer: parsed.suggestedIncome.employer,
            date: parsed.suggestedIncome.date,
            amount: parsed.suggestedIncome.amount,
            bankDeposit: parsed.suggestedIncome.bankDeposit,
            despensa: parsed.suggestedIncome.despensa,
          });
          continue;
        }
        seenInBatch.add(parsed.uuid);

        const existing = await checkDuplicateUuid(parsed.uuid);
        if (existing) {
          results.push({
            ...baseResult,
            status: "duplicate",
            message: "Este CFDI ya fue importado",
            uuid: parsed.uuid,
            tipo: parsed.tipo,
            employer: parsed.suggestedIncome.employer,
            date: parsed.suggestedIncome.date,
            amount: parsed.suggestedIncome.amount,
            bankDeposit: parsed.suggestedIncome.bankDeposit,
            despensa: parsed.suggestedIncome.despensa,
            existingId: existing.id,
          });
          continue;
        }

        const income = await createIncome({
          ...parsed.suggestedIncome,
          periodStart: parsed.suggestedIncome.periodStart || undefined,
          periodEnd: parsed.suggestedIncome.periodEnd || undefined,
          cfdiUuid: parsed.uuid,
          cfdiXml: xmlString,
          userId: session.id,
        });

        results.push({
          ...baseResult,
          status: "imported",
          message: "Importado correctamente",
          uuid: parsed.uuid,
          tipo: parsed.tipo,
          employer: parsed.suggestedIncome.employer,
          date: parsed.suggestedIncome.date,
          amount: parsed.suggestedIncome.amount,
          bankDeposit: parsed.suggestedIncome.bankDeposit,
          despensa: parsed.suggestedIncome.despensa,
          incomeId: income.id,
        });
      } catch (error) {
        if (error instanceof CFDIParseError) {
          results.push({ ...baseResult, status: "error", message: error.message });
          continue;
        }

        results.push({
          ...baseResult,
          status: "error",
          message: error instanceof Error ? error.message : "Error al importar CFDI",
        });
      }
    }

    return NextResponse.json({
      count: results.length,
      imported: results.filter((result) => result.status === "imported").length,
      duplicates: results.filter((result) => result.status === "duplicate").length,
      errors: results.filter((result) => result.status === "error").length,
      results,
    });
  } catch (error) {
    console.error("Bulk income upload error:", error);
    const message = error instanceof Error ? error.message : "Error al procesar los XML";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function emptyResult(fileName: string): BulkResult {
  return {
    fileName,
    status: "error",
    message: "",
    uuid: null,
    tipo: null,
    employer: null,
    date: null,
    amount: null,
    bankDeposit: null,
    despensa: null,
    incomeId: null,
    existingId: null,
  };
}

function isXmlFile(file: File) {
  return file.name.toLowerCase().endsWith(".xml") || file.type === "text/xml" || file.type === "application/xml";
}
