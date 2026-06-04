import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { status } = await requireAdminSession();
	if (status === 401)
		return NextResponse.json({ error: "No autenticado" }, { status });
	if (status === 403)
		return NextResponse.json({ error: "No autorizado" }, { status });

	const { id } = await params;
	const { name, icon, color } = await req.json();
	const normalizedName = typeof name === "string" ? name.trim() : "";

	if (!normalizedName) {
		return NextResponse.json(
			{ error: "El nombre es requerido" },
			{ status: 400 },
		);
	}

	try {
		const category = await prisma.category.update({
			where: { id },
			data: { name: normalizedName, icon, color },
		});
		return NextResponse.json(category);
	} catch {
		return NextResponse.json(
			{ error: "No se pudo actualizar la categoria" },
			{ status: 400 },
		);
	}
}

export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { status } = await requireAdminSession();
	if (status === 401)
		return NextResponse.json({ error: "No autenticado" }, { status });
	if (status === 403)
		return NextResponse.json({ error: "No autorizado" }, { status });

	const { id } = await params;

	const expenses = await prisma.expense.count({ where: { categoryId: id } });
	if (expenses > 0) {
		return NextResponse.json(
			{ error: "No se puede eliminar: tiene gastos asociados" },
			{ status: 400 },
		);
	}

	const budgets = await prisma.budget.count({ where: { categoryId: id } });
	if (budgets > 0) {
		return NextResponse.json(
			{ error: "No se puede eliminar: tiene presupuestos asociados" },
			{ status: 400 },
		);
	}

	const [installmentPlans, recurringPayments, receiptDrafts, planEnvelopes] =
		await Promise.all([
			prisma.installmentPlan.count({ where: { categoryId: id } }),
			prisma.recurringPayment.count({ where: { categoryId: id } }),
			prisma.receiptDraft.count({ where: { categoryId: id } }),
			prisma.monthlyPlanEnvelope.count({ where: { categoryId: id } }),
		]);

	if (installmentPlans + recurringPayments + receiptDrafts + planEnvelopes > 0) {
		return NextResponse.json(
			{ error: "No se puede eliminar: tiene registros asociados" },
			{ status: 400 },
		);
	}

	await prisma.category.delete({ where: { id } });
	return NextResponse.json({ ok: true });
}
