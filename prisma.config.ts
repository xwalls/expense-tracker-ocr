import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

function loadDotEnv(path: string) {
	if (!existsSync(path)) return;

	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (!match) continue;

		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) continue;
		process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
	}
}

loadDotEnv(resolve(process.cwd(), ".env"));

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		seed: "tsx scripts/seed.ts",
	},
	engine: "classic",
	datasource: {
		url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/unused",
		directUrl: process.env.DIRECT_URL,
	},
});
