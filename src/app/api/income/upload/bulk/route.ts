import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logError, logInfo, newTraceId } from "@/lib/structured-logger";
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

  const traceId = newTraceId("cfdi-import");
  const startedAt = Date.now();

  try {
    const formData = await req.formData();
    const files = formData.getAll("xml").filter((file): file is File => file instanceof File);

    logInfo("cfdi-import", "batch_started", { traceId, fileCount: files.length });

    if (files.length === 0) {
      logInfo("cfdi-import", "batch_rejected", { traceId, reason: "empty_batch", ms: Date.now() - startedAt });
      return NextResponse.json({ error: "No se enviaron archivos XML" }, { status: 400 });
    }

    if (files.length > MAX_BULK_FILES) {
      logInfo("cfdi-import", "batch_rejected", { traceId, reason: "too_many_files", fileCount: files.length, maxFiles: MAX_BULK_FILES, ms: Date.now() - startedAt });
      return NextResponse.json({ error: `Maximo ${MAX_BULK_FILES} XML por lote` }, { status: 400 });
    }

    const seenInBatch = new Set<string>();
    const results: BulkResult[] = [];

    for (const [fileIndex, file] of files.entries()) {
      const fileStartedAt = Date.now();
      const baseResult = emptyResult(file.name);

      if (!isXmlFile(file)) {
        logInfo("cfdi-import", "file_error", { traceId, fileIndex, reason: "invalid_file_type", fileSize: file.size, ms: Date.now() - fileStartedAt });
        results.push({ ...baseResult, status: "error", message: "El archivo debe ser XML" });
        continue;
      }

      try {
        const xmlString = await file.text();
        const parsed = parseCFDI(xmlString);
        logInfo("cfdi-import", "file_parsed", { traceId, fileIndex, uuidTail: uuidTail(parsed.uuid), tipo: parsed.tipo, fileSize: file.size, ms: Date.now() - fileStartedAt });

        if (seenInBatch.has(parsed.uuid)) {
          logInfo("cfdi-import", "file_duplicate", { traceId, fileIndex, reason: "duplicate_in_batch", uuidTail: uuidTail(parsed.uuid), tipo: parsed.tipo, ms: Date.now() - fileStartedAt });
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
          logInfo("cfdi-import", "file_duplicate", { traceId, fileIndex, reason: "already_imported", uuidTail: uuidTail(parsed.uuid), tipo: parsed.tipo, existingId: existing.id, ms: Date.now() - fileStartedAt });
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

        logInfo("cfdi-import", "file_imported", { traceId, fileIndex, uuidTail: uuidTail(parsed.uuid), tipo: parsed.tipo, incomeId: income.id, amount: parsed.suggestedIncome.amount, ms: Date.now() - fileStartedAt });

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
          logError("cfdi-import", "file_error", error, { traceId, fileIndex, reason: "parse_error", fileSize: file.size, ms: Date.now() - fileStartedAt });
          results.push({ ...baseResult, status: "error", message: error.message });
          continue;
        }

        logError("cfdi-import", "file_error", error, { traceId, fileIndex, reason: "import_error", fileSize: file.size, ms: Date.now() - fileStartedAt });
        results.push({
          ...baseResult,
          status: "error",
          message: error instanceof Error ? error.message : "Error al importar CFDI",
        });
      }
    }

    logInfo("cfdi-import", "batch_finished", {
      traceId,
      count: results.length,
      imported: results.filter((result) => result.status === "imported").length,
      duplicates: results.filter((result) => result.status === "duplicate").length,
      errors: results.filter((result) => result.status === "error").length,
      ms: Date.now() - startedAt,
    });

    return NextResponse.json({
      count: results.length,
      imported: results.filter((result) => result.status === "imported").length,
      duplicates: results.filter((result) => result.status === "duplicate").length,
      errors: results.filter((result) => result.status === "error").length,
      results,
    });
  } catch (error) {
    logError("cfdi-import", "batch_failed", error, { traceId, ms: Date.now() - startedAt });
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

function uuidTail(uuid: string) {
  return uuid.slice(-8);
}
