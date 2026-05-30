import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const { name, email } = await req.json();

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Nombre y email son requeridos" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { name: name.trim(), email: email.trim().toLowerCase() },
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

  if (id === session.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  try {
    await prisma.expense.deleteMany({ where: { userId: id } });
    await prisma.budget.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar el usuario" }, { status: 400 });
  }
}
