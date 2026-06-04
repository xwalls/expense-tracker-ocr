import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
	const session = await getSession();
	if (!session)
		return NextResponse.json({ error: "No autenticado" }, { status: 401 });

	const user = await prisma.user.findUnique({
		where: { id: session.id },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			createdAt: true,
			_count: {
				select: { expenses: true },
			},
		},
	});

	if (!user)
		return NextResponse.json(
			{ error: "Usuario no encontrado" },
			{ status: 404 },
		);

	return NextResponse.json([
		{
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			createdAt: user.createdAt,
			expenseCount: user._count.expenses,
		},
	]);
}
