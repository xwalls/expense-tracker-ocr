import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateAuth, resolveUserId } from "./auth";
import { registerTools } from "./tools";

const PORT = Number(process.env.MCP_PORT) || 3001;

// Create MCP server
const mcpServer = new McpServer({
  name: "expense-tracker-mcp",
  version: "1.0.0",
});

// Register all tools
registerTools(mcpServer);

// Create HTTP server with auth middleware
const httpServer = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

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

  // Handle MCP request (stateless — new transport per request)
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("[MCP] Error handling request:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
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
  // Validate user exists at startup
  try {
    const userId = await resolveUserId();
    console.log(`[MCP] Resolved user ID: ${userId}`);
  } catch (error) {
    console.error(`[MCP] Fatal: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  httpServer.listen(PORT, () => {
    console.log(`[MCP] Expense Tracker MCP server running on http://0.0.0.0:${PORT}/mcp`);
    console.log(`[MCP] Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`[MCP] Auth: ${process.env.MCP_AUTH_TOKEN ? "enabled" : "DISABLED (dev mode)"}`);
  });
}

main();
