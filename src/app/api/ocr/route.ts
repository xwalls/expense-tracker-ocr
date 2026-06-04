import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { processReceipt } from "@/lib/services";

const MAX_OCR_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
]);

export async function POST(req: Request) {
	const session = await getSession();
	if (!session)
		return NextResponse.json({ error: "No autenticado" }, { status: 401 });

	try {
		const contentLength = Number(req.headers.get("content-length") || 0);
		if (contentLength > MAX_OCR_UPLOAD_BYTES) {
			return NextResponse.json(
				{ error: "La imagen no puede superar 8 MB" },
				{ status: 400 },
			);
		}

		const formData = await req.formData();
		const file = formData.get("image") as File | null;

		if (!file) {
			return NextResponse.json(
				{ error: "No se envio imagen" },
				{ status: 400 },
			);
		}

		const mimeType = file.type || "";
		if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
			return NextResponse.json(
				{ error: "Formato de imagen no soportado" },
				{ status: 400 },
			);
		}

		if (file.size > MAX_OCR_UPLOAD_BYTES) {
			return NextResponse.json(
				{ error: "La imagen no puede superar 8 MB" },
				{ status: 400 },
			);
		}

		const bytes = await file.arrayBuffer();
		const buffer = Buffer.from(bytes);

		const result = await processReceipt({
			imageBuffer: buffer,
			mimeType,
			traceId: `web-ocr-${crypto.randomUUID()}`,
		});

		return NextResponse.json(result);
	} catch (error) {
		console.error("OCR error:", error);
		const message =
			error instanceof Error
				? error.message
				: "Error al procesar la imagen con IA";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
