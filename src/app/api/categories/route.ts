import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { listCategories } from "@/lib/services";

export async function GET() {
	const categories = await listCategories();
	return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
	const { status } = await requireAdminSession();
	if (status === 401)
		return NextResponse.json({ error: "No autenticado" }, { status });
	if (status === 403)
		return NextResponse.json({ error: "No autorizado" }, { status });

	const { name, icon, color } = await req.json();

	if (!name || !name.trim()) {
		return NextResponse.json(
			{ error: "El nombre es requerido" },
			{ status: 400 },
		);
	}

	try {
		const category = await prisma.category.create({
			data: {
				name: name.trim(),
				icon: icon || "tag",
				color: color || "#6366f1",
			},
		});
		return NextResponse.json(category, { status: 201 });
	} catch {
		return NextResponse.json(
			{ error: "La categoria ya existe" },
			{ status: 400 },
		);
	}
}
