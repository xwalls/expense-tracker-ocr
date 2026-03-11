import OpenAI from "openai";
import { uploadImage } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

export interface ProcessReceiptInput {
  imageBuffer: Buffer;
  mimeType?: string;
}

export interface OcrResult {
  ocrText: string | null;
  amount: number | null;
  description: string | null;
  category: string;
  date: string | null;
  imageUrl: string | null;
}

export async function processReceipt(input: ProcessReceiptInput): Promise<OcrResult> {
  const { imageBuffer, mimeType = "image/jpeg" } = input;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const base64 = imageBuffer.toString("base64");

  // Upload to Cloudinary
  let imageUrl: string | null = null;
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      imageUrl = await uploadImage(imageBuffer, mimeType);
    } catch (err) {
      console.error("Cloudinary upload error:", err);
    }
  }

  // Get categories from database
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const categoryNames = categories.map((c) => c.name);

  // OCR with OpenAI Vision
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Eres un asistente que analiza imagenes de recibos, tickets y facturas. Extrae la informacion y responde SOLO con un JSON valido (sin markdown, sin backticks) con esta estructura:
{
  "ocrText": "texto completo extraido del recibo",
  "amount": numero total (el monto mas alto o el total final),
  "description": "descripcion corta del gasto (nombre del negocio o concepto principal)",
  "category": "una de estas categorias: ${categoryNames.join(", ")}",
  "date": "fecha del recibo en formato YYYY-MM-DD si es visible, o null"
}
Si no puedes extraer algun campo, usa null para ese campo. Para category, elige la mas apropiada basandote en el tipo de negocio o productos del recibo.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Analiza este recibo y extrae la informacion:" },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
          },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content?.trim() || "";

  let parsed;
  try {
    const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      ocrText: content,
      amount: null,
      description: null,
      category: categoryNames[0] || "Otros",
      date: null,
      imageUrl,
    };
  }

  return {
    ocrText: parsed.ocrText || content,
    amount: parsed.amount || null,
    description: parsed.description || null,
    category: categoryNames.includes(parsed.category) ? parsed.category : categoryNames[0] || "Otros",
    date: parsed.date || null,
    imageUrl,
  };
}
