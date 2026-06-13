#!/bin/sh
set -e

# Fix volume permissions at runtime — volumes are mounted as root even though
# the build-time chown set them to tablecast. Without this, Prisma migrations
# fail with "attempt to write a readonly database" when the DB file is
# owned by root but the app runs as tablecast (read_only: true container).
# Note: requires CAP_CHOWN (added via cap_add in docker-compose).
chown -R tablecast:tablecast /app/server/prisma/data /app/server/uploads /app/server/backups /tmp || true

# Generate self-signed SSL certificate for PWA HTTPS support
# The cert is stored in /tmp (writable in read_only: true container) and
# persists across container restarts but not rebuilds (tmpfs is ephemeral).
if [ ! -f /tmp/server.crt ] || [ ! -f /tmp/server.key ]; then
  echo "[Entrypoint] Generating self-signed SSL certificate for PWA HTTPS..."
  # Write OpenSSL config with SAN for localhost — covers both DM machine and LAN
  cat > /tmp/openssl-pwa.cnf << 'EOF'
[req]
distinguished_name = req_dn
x509_extensions = v3_ext
prompt = no

[req_dn]
CN = Tablecast
O  = Tablecast
C  = US

[v3_ext]
subjectAltName = DNS:localhost,IP:127.0.0.1
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /tmp/server.key -out /tmp/server.crt \
    -config /tmp/openssl-pwa.cnf 2>/dev/null

  rm -f /tmp/openssl-pwa.cnf
  chown tablecast:tablecast /tmp/server.key /tmp/server.crt || true
  echo "[Entrypoint] SSL certificate generated: /tmp/server.crt"
else
  echo "[Entrypoint] SSL certificate already exists, reusing"
fi

# Validate critical env vars
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL environment variable is not set."
  exit 1
fi

# Run migrations as tablecast user — they need write access to the SQLite DB
# which is owned by tablecast (from the chown above). Running as root won't work
# because cap_drop: [ALL] strips DAC_OVERRIDE from the root user, so root
# without that capability can't write to files owned by tablecast.
# Note: HOME=/tmp because the tablecast user's home dir (/app) is read-only
# in a read_only: true container, and npx needs a writable cache dir.
su -s /bin/sh tablecast -c "HOME=/tmp npx prisma migrate deploy"
su -s /bin/sh tablecast -c "HOME=/tmp npx prisma db seed" || true

# Seed the soundboard with free CC0 audio tracks from Kenney (idempotent — skips if already populated)
su -s /bin/sh tablecast -c "HOME=/tmp node scripts/seed-sounds.js" || true

# Run the Node.js app as the tablecast user.
# The tablecast user has /sbin/nologin as shell (security), so we must
# explicitly use /bin/sh via -s flag for su to execute commands.
# Requires SETUID + SETGID capabilities (added via cap_add in docker-compose).
exec su -s /bin/sh tablecast -c "exec node src/index.js"
