import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getSession() {
	const session = await auth();
	if (!session?.user?.id) return null;
	return { id: session.user.id, email: session.user.email! };
}

export async function requireAdminSession() {
	const session = await getSession();
	if (!session) return { session: null, status: 401 as const };

	const user = await prisma.user.findUnique({
		where: { id: session.id },
		select: { role: true },
	});

	if (user?.role !== "ADMIN") return { session: null, status: 403 as const };

	return { session, status: 200 as const };
}
