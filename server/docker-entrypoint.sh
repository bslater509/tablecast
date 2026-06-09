#!/bin/sh
set -e

# Fix volume permissions at runtime — volumes are mounted as root even though
# the build-time chown set them to tablecast. Without this, Prisma migrations
# fail with "attempt to write a readonly database" when the DB file is
# owned by root but the app runs as tablecast (read_only: true container).
# Note: requires CAP_CHOWN (added via cap_add in docker-compose).
chown -R tablecast:tablecast /app/server/prisma/data /app/server/uploads /app/server/backups 2>/dev/null || true

# Validate critical env vars
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL environment variable is not set."
  exit 1
fi

# The tablecast user has /sbin/nologin as shell (security), so we must
# explicitly use /bin/sh via -s flag for su to execute commands.
exec su -s /bin/sh tablecast -c "npx prisma migrate deploy && npx prisma db seed || true && exec node src/index.js"
