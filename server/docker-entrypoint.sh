#!/bin/sh
set -e

# Validate critical env vars
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL environment variable is not set."
  exit 1
fi

npx prisma migrate deploy
npx prisma db seed || true
exec node src/index.js
