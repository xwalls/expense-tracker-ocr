import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { assertMcpAuthConfigured, validateAuth, resolveUserId } from "./auth";
import { registerTools } from "./tools";

const PORT = Number(process.env.MCP_PORT) || 3001;
const DEFAULT_ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://127.0.0.1:3000",
];
const ALLOWED_ORIGINS = (
	process.env.MCP_ALLOWED_ORIGINS?.split(",") ?? DEFAULT_ALLOWED_ORIGINS
)
	.map((origin) => origin.trim())
	.filter(Boolean);

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): boolean {
	const origin = req.headers.origin;

	res.setHeader("Vary", "Origin");
	res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization, mcp-session-id",
	);
	res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

	if (!origin) return true;

	if (!ALLOWED_ORIGINS.includes(origin)) {
		return false;
	}

	res.setHeader("Access-Control-Allow-Origin", origin);
	return true;
}

/**
 * Creates a fresh McpServer instance with all tools registered.
 * In stateless mode, each request needs its own server+transport pair
 * because McpServer.connect() binds to a single transport and rejects
 * subsequent connect() calls.
 */
function createMcpServerInstance(): McpServer {
	const server = new McpServer({
		name: "expense-tracker-mcp",
		version: "1.0.0",
	});
	registerTools(server);
	return server;
}

// Create HTTP server with auth middleware
const httpServer = createServer(async (req, res) => {
	// CORS headers
	if (!applyCorsHeaders(req, res)) {
		res.writeHead(403, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Origin not allowed" }));
		return;
	}

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	// Only handle /mcp endpoint
	if (req.url !== "/mcp") {
		if (req.url === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ status: "ok", service: "expense-tracker-mcp" }));
			return;
		}
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not found — use /mcp endpoint" }));
		return;
	}

	// Auth check
	if (!validateAuth(req, res)) {
		return;
	}

	// Handle MCP request (stateless — new server+transport per request)
	let mcpServer: McpServer | undefined;
	try {
		mcpServer = createMcpServerInstance();
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
		await mcpServer.connect(transport);
		await transport.handleRequest(req, res);
	} catch (error) {
		console.error("[MCP] Error handling request:", error);
		if (!res.headersSent) {
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Internal server error" }));
		}
	} finally {
		// Clean up: close the per-request server to release resources
		if (mcpServer) {
			await mcpServer.close().catch(() => {});
		}
	}
});

// Graceful shutdown
function shutdown() {
	console.log("[MCP] Shutting down...");
	httpServer.close(() => {
		console.log("[MCP] Server closed");
		process.exit(0);
	});
	// Force close after 5 seconds
	setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
async function main() {
	// Validate MCP auth and user at startup.
	try {
		assertMcpAuthConfigured();
		const userId = await resolveUserId();
		console.log(`[MCP] Resolved user ID: ${userId}`);
	} catch (error) {
		console.error(
			`[MCP] Fatal: ${error instanceof Error ? error.message : error}`,
		);
		process.exit(1);
	}

	httpServer.listen(PORT, () => {
		console.log(
			`[MCP] Expense Tracker MCP server running on http://0.0.0.0:${PORT}/mcp`,
		);
		console.log(`[MCP] Health check: http://0.0.0.0:${PORT}/health`);
		console.log("[MCP] Auth: enabled");
	});
}

main();
