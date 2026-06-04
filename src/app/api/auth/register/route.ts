import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
	try {
		const { email, password, name } = await req.json();
		const normalizedEmail =
			typeof email === "string" ? email.trim().toLowerCase() : "";
		const normalizedName = typeof name === "string" ? name.trim() : "";

		if (!normalizedEmail || !password || !normalizedName) {
			return NextResponse.json(
				{ error: "Todos los campos son requeridos" },
				{ status: 400 },
			);
		}

		if (typeof password !== "string" || password.length < 6) {
			return NextResponse.json(
				{ error: "La contraseña debe tener al menos 6 caracteres" },
				{ status: 400 },
			);
		}

		const exists = await prisma.user.findUnique({
			where: { email: normalizedEmail },
		});
		if (exists) {
			return NextResponse.json(
				{ error: "El email ya esta registrado" },
				{ status: 400 },
			);
		}

		const hashed = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: { email: normalizedEmail, password: hashed, name: normalizedName },
		});

		return NextResponse.json({
			user: { id: user.id, email: user.email, name: user.name },
		});
	} catch (error) {
		console.error(error);
		return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
	}
}
