import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
	getFamilyPlanSummary,
	updateFamilyPlan,
	validateFamilyPlanPeriod,
} from "@/lib/services";

const patchAllowedKeys = new Set([
	"plannedLiquidIncome",
	"plannedVoucherIncome",
	"notes",
	"envelopes",
]);
const envelopeAllowedKeys = new Set([
	"categoryId",
	"plannedAmount",
	"weeklyAmount",
	"weekCount",
	"sortOrder",
	"notes",
	"label",
]);

type RouteEnvelopePatch = {
	categoryId?: unknown;
	plannedAmount?: unknown;
	weeklyAmount?: unknown;
	weekCount?: unknown;
	sortOrder?: unknown;
	notes?: unknown;
	label?: unknown;
};

export async function GET(req: Request) {
	const session = await getSession();
	if (!session)
		return NextResponse.json({ error: "No autenticado" }, { status: 401 });

	try {
		const url = new URL(req.url);
		const now = new Date();
		const period = validateFamilyPlanPeriod(
			url.searchParams.get("month") || now.getMonth() + 1,
			url.searchParams.get("year") || now.getFullYear(),
		);
		const summary = await getFamilyPlanSummary(session.id, period);
		return NextResponse.json(summary);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "No se pudo cargar el plan familiar";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

export async function PATCH(req: Request) {
	const session = await getSession();
	if (!session)
		return NextResponse.json({ error: "No autenticado" }, { status: 401 });

	try {
		const url = new URL(req.url);
		const now = new Date();
		const period = validateFamilyPlanPeriod(
			url.searchParams.get("month") || now.getMonth() + 1,
			url.searchParams.get("year") || now.getFullYear(),
		);
		const body = await readJsonObject(req);
		rejectUnknownKeys(
			body,
			patchAllowedKeys,
			"Campo no permitido en el plan familiar",
		);
		if (body.envelopes !== undefined) validateEnvelopePayload(body.envelopes);
		const envelopes = body.envelopes as RouteEnvelopePatch[] | undefined;

		const summary = await updateFamilyPlan(session.id, {
			...period,
			plannedLiquidIncome: body.plannedLiquidIncome,
			plannedVoucherIncome: body.plannedVoucherIncome,
			notes: body.notes,
			envelopes,
		});
		return NextResponse.json(summary);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "No se pudo actualizar el plan familiar";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

async function readJsonObject(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		throw new Error("El cuerpo de la solicitud no es valido");
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new Error("El cuerpo de la solicitud no es valido");
	}
	return body as Record<string, unknown>;
}

function validateEnvelopePayload(value: unknown) {
	if (!Array.isArray(value))
		throw new Error("Los sobres deben enviarse como lista");
	for (const envelope of value) {
		if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
			throw new Error("Cada sobre debe ser un objeto valido");
		}
		rejectUnknownKeys(
			envelope as Record<string, unknown>,
			envelopeAllowedKeys,
			"Campo no permitido en el sobre",
		);
	}
}

function rejectUnknownKeys(
	body: Record<string, unknown>,
	allowedKeys: Set<string>,
	message: string,
) {
	const unknownKey = Object.keys(body).find((key) => !allowedKeys.has(key));
	if (unknownKey) throw new Error(`${message}: ${unknownKey}`);
}
