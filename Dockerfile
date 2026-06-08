# =============================================================================
# Stage 1: Build the React Frontend
# =============================================================================
FROM node:22-alpine AS client-builder

WORKDIR /build/client

# Install client dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client source and build
COPY client/ ./
RUN npm run build

# =============================================================================
# Stage 2: Runtime — Node.js + Express + rclone
# Uses node:22-slim (Debian-based) so apt-get is available for rclone
# =============================================================================
FROM node:22-slim AS runtime

# Install rclone (backups), openssl (Prisma schema engine), curl (5etools HTTP fetches), and ca-certificates
RUN apt-get update && \
    apt-get install -y --no-install-recommends rclone openssl curl ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Server dependencies ──────────────────────────────────────────────────────
COPY server/package*.json ./server/
RUN cd server && npm ci
COPY server/prisma/ ./server/prisma/
RUN cd server && npx prisma generate && npm prune --omit=dev

# ── Server source ─────────────────────────────────────────────────────────────
COPY server/ ./server/

# ── Copy built React frontend into location Express will serve ─────────────
COPY --from=client-builder /build/client/dist ./client/dist

# ── Create directories that will be mounted as volumes ────────────────────────
RUN mkdir -p /app/server/prisma/data \
              /app/server/uploads \
              /app/server/backups

COPY server/docker-entrypoint.sh /app/server/docker-entrypoint.sh
RUN chmod +x /app/server/docker-entrypoint.sh

# Run Prisma migrations then start the server
WORKDIR /app/server

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get({host:'localhost',port:3001,path:'/api/health',timeout:5000},r=>process.exit(r.statusCode!==200?1:0)).on('error',()=>process.exit(1))"

EXPOSE 3001

CMD ["/app/server/docker-entrypoint.sh"]
