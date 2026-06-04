import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  if (id !== session.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { name, email } = await req.json();
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedName = typeof name === "string" ? name.trim() : "";

  if (!normalizedName || !normalizedEmail) {
    return NextResponse.json({ error: "Nombre y email son requeridos" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.id },
      data: { name: normalizedName, email: normalizedEmail },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar el usuario" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  if (id !== session.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.income.deleteMany({ where: { userId: session.id } });
      await tx.expense.deleteMany({ where: { userId: session.id } });
      await tx.budget.deleteMany({ where: { userId: session.id } });
      await tx.user.delete({ where: { id: session.id } });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar el usuario" }, { status: 400 });
  }
}
