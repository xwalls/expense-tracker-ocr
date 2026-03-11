import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import OpenAI from "openai";

const CATEGORIES = [
  "Alimentacion",
  "Transporte",
  "Entretenimiento",
  "Salud",
  "Educacion",
  "Servicios",
  "Compras",
  "Otros",
];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const { description, amount } = await req.json();

    if (!description) {
      return NextResponse.json({ error: "Descripcion requerida" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres un clasificador de gastos. Dada la descripcion de un gasto, responde SOLO con el nombre de la categoria mas apropiada. Las categorias disponibles son: ${CATEGORIES.join(", ")}. Responde unicamente con el nombre de la categoria, nada mas.`,
        },
        {
          role: "user",
          content: `Gasto: "${description}"${amount ? ` por $${amount}` : ""}`,
        },
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const category = response.choices[0]?.message?.content?.trim() || "Otros";
    const matched = CATEGORIES.find((c) => c.toLowerCase() === category.toLowerCase()) || "Otros";

    return NextResponse.json({ category: matched });
  } catch (error) {
    console.error("Categorize error:", error);
    return NextResponse.json({ category: "Otros" });
  }
}
