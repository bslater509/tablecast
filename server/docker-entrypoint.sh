#!/bin/sh
set -e

# Fix volume permissions at runtime — volumes are mounted as root even though
# the build-time chown set them to tablecast. Without this, Prisma migrations
# fail with "attempt to write a readonly database" when the DB file is
# owned by root but the app runs as tablecast (read_only: true container).
# Note: requires CAP_CHOWN (added via cap_add in docker-compose).
chown -R tablecast:tablecast /app/server/prisma/data /app/server/uploads /app/server/backups || true

# Validate critical env vars
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL environment variable is not set."
  exit 1
fi

# Run migrations as tablecast user — they need write access to the SQLite DB
# which is owned by tablecast (from the chown above). Running as root won't work
# because cap_drop: [ALL] strips DAC_OVERRIDE from the root user, so root
# without that capability can't write to files owned by tablecast.
su -s /bin/sh tablecast -c "npx prisma migrate deploy"
su -s /bin/sh tablecast -c "npx prisma db seed" || true

# Run the Node.js app as the tablecast user.
# The tablecast user has /sbin/nologin as shell (security), so we must
# explicitly use /bin/sh via -s flag for su to execute commands.
# Requires SETUID + SETGID capabilities (added via cap_add in docker-compose).
exec su -s /bin/sh tablecast -c "exec node src/index.js"
