# =============================================================================
# Stage 1: Build the React Frontend
# =============================================================================
FROM node:20-alpine AS client-builder

WORKDIR /build/client

# Install client dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client source and build
COPY client/ ./
RUN npm run build

# =============================================================================
# Stage 2: Runtime — Node.js + Express + rclone
# Uses node:20-slim (Debian-based) so apt-get is available for rclone
# =============================================================================
FROM node:20-slim AS runtime

# Install rclone, openssl (required by Prisma's schema engine), git and ca-certificates via apt-get
RUN apt-get update && \
    apt-get install -y --no-install-recommends rclone openssl git ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Server dependencies ──────────────────────────────────────────────────────
COPY server/package*.json ./server/
COPY server/prisma/ ./server/prisma/
RUN cd server && npm ci && npx prisma generate && npm prune --omit=dev

# ── Server source ─────────────────────────────────────────────────────────────
COPY server/ ./server/

# ── Copy built React frontend into location Express will serve ─────────────
COPY --from=client-builder /build/client/dist ./client/dist

# ── Create directories that will be mounted as volumes ────────────────────────
RUN mkdir -p /app/server/prisma/data \
             /app/server/uploads \
             /app/server/backups

# Run Prisma migrations then start the server
WORKDIR /app/server

EXPOSE 3001

# Use entrypoint so migrations always run before the server starts
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
