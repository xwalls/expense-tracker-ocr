# syntax=docker/dockerfile:1

# ── base ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (writes engine binary into node_modules)
RUN pnpm prisma generate

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy built app and all node_modules (includes generated Prisma client)
COPY --from=builder --chown=nextjs:nodejs /app/public        ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next         ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules  ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma        ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json  ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/entrypoint.sh ./entrypoint.sh

# Copy MCP server source (runs via tsx at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/src/mcp-server ./src/mcp-server
COPY --from=builder --chown=nextjs:nodejs /app/src/lib        ./src/lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json  ./tsconfig.json

USER nextjs

EXPOSE 3000 3001

ENTRYPOINT ["sh", "./entrypoint.sh"]
