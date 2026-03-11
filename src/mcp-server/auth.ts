import { prisma } from "@/lib/prisma";
import { IncomingMessage, ServerResponse } from "node:http";

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const MCP_USER_EMAIL = process.env.MCP_USER_EMAIL;

let resolvedUserId: string | null = null;

export async function resolveUserId(): Promise<string> {
  if (resolvedUserId) return resolvedUserId;

  if (!MCP_USER_EMAIL) {
    throw new Error("MCP_USER_EMAIL is required — set it to the email of the user the MCP agent acts on behalf of");
  }

  const user = await prisma.user.findUnique({ where: { email: MCP_USER_EMAIL } });
  if (!user) {
    throw new Error(`User not found for email: ${MCP_USER_EMAIL}`);
  }

  resolvedUserId = user.id;
  return resolvedUserId;
}

export function validateAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!MCP_AUTH_TOKEN) {
    console.warn("[MCP] WARNING: MCP_AUTH_TOKEN not set — accepting all requests (dev mode)");
    return true;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized — missing Bearer token" }));
    return false;
  }

  const token = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  if (token.length !== MCP_AUTH_TOKEN.length || !timingSafeEqual(token, MCP_AUTH_TOKEN)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized — invalid token" }));
    return false;
  }

  return true;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
