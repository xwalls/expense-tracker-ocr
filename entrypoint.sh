#!/bin/sh
set -e

echo "==> Running Prisma migrations..."
DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx prisma migrate deploy

echo "==> Running Prisma db seed (initial data)..."
npx prisma db seed || echo "Warning: seed failed (may already be seeded)"

# Start MCP server in background (if MCP_USER_EMAIL is configured)
if [ -n "$MCP_USER_EMAIL" ]; then
  echo "==> Starting MCP server on port ${MCP_PORT:-3001}..."
  node --import tsx src/mcp-server/index.ts &
  MCP_PID=$!
  echo "==> MCP server started (PID: $MCP_PID)"
else
  echo "==> MCP server skipped (MCP_USER_EMAIL not set)"
fi

echo "==> Starting Next.js application..."
exec pnpm start
