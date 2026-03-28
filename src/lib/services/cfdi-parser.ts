import { XMLParser } from "fast-xml-parser";

export interface ParsedCFDI {
  // Core CFDI fields (present in all CFDIs)
  uuid: string;
  total: number;
  subtotal: number;
  fecha: string;
  folio?: string;
  emisorNombre: string;
  emisorRfc: string;
  receptorNombre: string;
  receptorRfc: string;
  tipo: "NOMINA" | "FACTURA";

  // Nómina-specific fields (null for facturas)
  nomina: {
    fechaPago: string;
    fechaInicialPago: string;
    fechaFinalPago: string;
    totalPercepciones: number;
    totalDeducciones: number;
    neto: number;
    despensa: number;
    bankDeposit: number;
  } | null;

  // Pre-filled income record fields (ready for confirmation)
  suggestedIncome: {
    amount: number;
    bankDeposit: number;
    despensa: number;
    description: string;
    source: "NOMINA" | "FACTURA";
    date: string;
    periodStart: string | null;
    periodEnd: string | null;
    employer: string;
  };
}

export class CFDIParseError extends Error {
  constructor(
    message: string,
    public code: "INVALID_XML" | "NOT_CFDI" | "MISSING_UUID" | "MISSING_TOTAL"
  ) {
    super(message);
    this.name = "CFDIParseError";
  }
}

function extractDespensa(percepciones: unknown): number {
  if (!percepciones) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const percList = (percepciones as any).Percepcion;
  if (!percList) return 0;

  const percs: Record<string, string>[] = Array.isArray(percList) ? percList : [percList];

  // SAT verified: TipoPercepcion "029" = Vales de despensa
  const despensaNode = percs.find(
    (p) =>
      p["@_TipoPercepcion"] === "029" ||
      (p["@_Concepto"] || "").toUpperCase().includes("DESPENSA")
  );

  if (!despensaNode) return 0;

  return (
    (parseFloat(despensaNode["@_ImporteExento"]) || 0) +
    (parseFloat(despensaNode["@_ImporteGravado"]) || 0)
  );
}

export function parseCFDI(xmlString: string): ParsedCFDI {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = parser.parse(xmlString);
  } catch {
    throw new CFDIParseError("El archivo no es XML válido", "INVALID_XML");
  }

  const comprobante = parsed.Comprobante;
  if (!comprobante) {
    throw new CFDIParseError("El XML no es un CFDI válido", "NOT_CFDI");
  }

  // Extract TimbreFiscalDigital UUID
  const complemento = comprobante.Complemento;
  const timbre = complemento?.TimbreFiscalDigital;
  const uuid: string = timbre?.["@_UUID"];
  if (!uuid) {
    throw new CFDIParseError("CFDI sin UUID (TimbreFiscalDigital)", "MISSING_UUID");
  }

  const total = parseFloat(comprobante["@_Total"]);
  if (isNaN(total)) {
    throw new CFDIParseError("CFDI sin Total", "MISSING_TOTAL");
  }

  const subtotal = parseFloat(comprobante["@_SubTotal"]) || 0;
  const fecha: string = comprobante["@_Fecha"] || "";
  const folio: string | undefined = comprobante["@_Folio"]?.toString();

  // Emisor
  const emisor = comprobante.Emisor;
  const emisorNombre: string = emisor?.["@_Nombre"] || "Desconocido";
  const emisorRfc: string = emisor?.["@_Rfc"] || "";

  // Receptor
  const receptor = comprobante.Receptor;
  const receptorNombre: string = receptor?.["@_Nombre"] || "";
  const receptorRfc: string = receptor?.["@_Rfc"] || "";

  // Check for Nomina complement
  const nominaNode = complemento?.Nomina;
  const isNomina = !!nominaNode;

  let nominaData: ParsedCFDI["nomina"] = null;

  if (isNomina) {
    const fechaPago: string = nominaNode["@_FechaPago"] || "";
    const fechaInicialPago: string = nominaNode["@_FechaInicialPago"] || "";
    const fechaFinalPago: string = nominaNode["@_FechaFinalPago"] || "";
    const totalPercepciones = parseFloat(nominaNode["@_TotalPercepciones"]) || 0;
    const totalDeducciones = parseFloat(nominaNode["@_TotalDeducciones"]) || 0;
    const neto = total;
    const despensa = extractDespensa(nominaNode.Percepciones);
    const bankDeposit = neto - despensa;

    nominaData = {
      fechaPago,
      fechaInicialPago,
      fechaFinalPago,
      totalPercepciones,
      totalDeducciones,
      neto,
      despensa,
      bankDeposit,
    };
  }

  // Build suggestedIncome
  let description: string;
  let date: string;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let amount: number;
  let bankDeposit: number;
  let despensa: number;

  if (isNomina && nominaData) {
    const start = (nominaData.fechaInicialPago || "").split("T")[0];
    const end = (nominaData.fechaFinalPago || "").split("T")[0];
    description = `Nómina ${start} al ${end} - ${emisorNombre}`;
    date = nominaData.fechaPago || fecha.split("T")[0];
    periodStart = nominaData.fechaInicialPago || null;
    periodEnd = nominaData.fechaFinalPago || null;
    amount = nominaData.neto;
    bankDeposit = nominaData.bankDeposit;
    despensa = nominaData.despensa;
  } else {
    const ref = folio || uuid.slice(0, 8);
    description = `Factura ${ref} - ${emisorNombre}`;
    date = fecha.split("T")[0];
    amount = total;
    bankDeposit = total;
    despensa = 0;
  }

  const suggestedIncome: ParsedCFDI["suggestedIncome"] = {
    amount,
    bankDeposit,
    despensa,
    description,
    source: isNomina ? "NOMINA" : "FACTURA",
    date,
    periodStart,
    periodEnd,
    employer: emisorNombre,
  };

  return {
    uuid,
    total,
    subtotal,
    fecha,
    folio,
    emisorNombre,
    emisorRfc,
    receptorNombre,
    receptorRfc,
    tipo: isNomina ? "NOMINA" : "FACTURA",
    nomina: nominaData,
    suggestedIncome,
  };
}
