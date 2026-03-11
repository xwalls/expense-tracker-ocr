#!/bin/sh
set -e

echo "==> Running Prisma db push (sync schema)..."
npx prisma db push --skip-generate

echo "==> Running Prisma db seed (initial data)..."
npx prisma db seed || echo "Warning: seed failed (may already be seeded)"

echo "==> Starting application..."
exec pnpm start
