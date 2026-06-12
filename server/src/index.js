// =============================================================================
// Tablecast  Express + Socket.io Entry Point (Phase 2)
// Backend Engineer: Express routing, static serving, and Socket.io real-time.
// =============================================================================
"use strict";

require("dotenv").config();
const http = require("http");
const https = require("https");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const morgan = require("morgan");
const { Server: SocketServer } = require("socket.io");
const { registerSocketHandlers } = require("./socket");
const logger = require("./utils/logger");

// Validate critical environment variable
if (!process.env.DATABASE_URL) {
  logger.error("server", "FATAL: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0"; // Bind to all interfaces so LAN devices can connect

// ---------------------------------------------------------------------------
// Request ID middleware — adds a unique ID to every request for log tracing
// ---------------------------------------------------------------------------
app.use((req, _res, next) => {
  req.id = crypto.randomUUID().slice(0, 8);
  next();
});

// ---------------------------------------------------------------------------
// Morgan HTTP request logging  structured JSON output
// ---------------------------------------------------------------------------
const morganFormat =
  ':remote-addr ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms';

app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => {
        // Parse morgan's output and re-emit as structured JSON
        const parts = message.trim().split(" ");
        const method = parts[1]?.replace(/"/g, "") || "?";
        const url = parts[2] || "?";
        const status = parseInt(parts[parts.length - 3], 10);
        const responseTime = parts[parts.length - 1]?.replace("ms", "") || "?";

        logger.info("http", `${method} ${url} -> ${status}`, {
          method,
          url,
          status,
          responseTimeMs: responseTime,
        });
      },
    },
  })
);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS  allow the Vite dev server (typically port 5173) during local dev
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? false // In production the React SPA is served from Express  no CORS needed
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));

const rateLimit = require("express-rate-limit");

// API rate limiting — generous limits since this runs on a trusted LAN
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 500, // 500 requests per minute per IP (trusted LAN — multiple panels poll simultaneously)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Legacy debug-log incoming API requests (kept for backwards compat)
const debug = require("./utils/debug");
const httpLog = debug("tablecast:http");
app.use((req, _res, next) => {
  httpLog("%s %s [reqId=%s]", req.method, req.path, req.id);
  next();
});

// ---------------------------------------------------------------------------
// HTTP server  shared between Express & Socket.io
// ---------------------------------------------------------------------------
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Socket.io  initialised on the same HTTP server
// ---------------------------------------------------------------------------
const io = new SocketServer(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? false
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Graceful reconnection defaults
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// Register all real-time event handlers
registerSocketHandlers(io);

// Share the socket server with routes and MCP tools via app.locals
app.set("io", io);

// ---------------------------------------------------------------------------
// HTTPS server (optional) — provides a secure context for PWA Service Workers
// Uses a self-signed cert generated at container startup (docker-entrypoint.sh)
// ---------------------------------------------------------------------------
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || "/tmp/server.key";
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || "/tmp/server.crt";
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH),
    };
    const httpsServer = https.createServer(httpsOptions, app);
    // Attach Socket.io to the HTTPS server too so WebSocket works over TLS
    io.attach(httpsServer);
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      logger.info("server", "HTTPS server started (PWA support)", {
        port: HTTPS_PORT,
        host: HOST,
      });
    });
  } catch (err) {
    logger.warn("server", "Failed to start HTTPS server", {
      error: err.message,
    });
  }
} else {
  logger.info("server", "SSL cert not found — HTTPS server disabled (PWA will only work on localhost)");
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Health check  confirms the server is alive
// Deployment verification 
let deployInfo = { version: "v1-original" };
try {
  deployInfo = require("./deploy-verify.js");
} catch (e) {
  deployInfo = { version: "v1-fallback", error: e.message };
}

app.get("/api/deploy-version", (_req, res) => {
  res.json(deployInfo);
});

app.get("/api/health", (_req, res) => {
  logger.info("health", "Health check", { clients: io.engine.clientsCount });
  res.json({
    status: "ok",
    service: "tablecast",
    timestamp: new Date().toISOString(),
    sockets: io.engine.clientsCount,
  });
});

// Endpoint to fetch host's network IPs for LAN player connection
app.get("/api/network-ip", (_req, res) => {
  const os = require("os");
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  logger.info("network", "Network IPs requested", { count: ips.length });
  res.json({ ips });
});

// CRUD route modules (Phase 3)
const usersRouter = require("./routes/users");
const charactersRouter = require("./routes/characters");
const npcsRouter = require("./routes/npcs");
const monstersRouter = require("./routes/monsters");
const wikiRouter = require("./routes/wiki");
const mapsRouter = require("./routes/maps");
const encountersRouter = require("./routes/encounters");
const backupRouter = require("./routes/backup");
const referenceRouter = require("./routes/reference");
const { router: aiRouter } = require("./routes/ai");
const rollsRouter = require("./routes/rolls");
const chatRouter = require("./routes/chat");
const sessionsRouter = require("./routes/sessions");
const shopsRouter = require("./routes/shops");
const debugRouter = require("./routes/debug");
const authRouter = require("./routes/auth");
const encounterTemplatesRouter = require("./routes/encounter-templates");
const lootRouter = require("./routes/loot");

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/characters", charactersRouter);

// Short/Long Rest endpoint — mounted on the same prefix to capture /:id/rest
const restRouter = require("./routes/rest");
app.use("/api/characters", restRouter);

// Level-Up endpoint — mounted on the same prefix to capture /:id/level-up
const levelupRouter = require("./routes/levelup");
app.use("/api/characters", levelupRouter);

// Heroes public listing (for login screen) — separate mount at /api/heroes
const { heroesRouter } = require("./routes/characters");
if (heroesRouter) app.use("/api/heroes", heroesRouter);
app.use("/api/npcs", npcsRouter);
app.use("/api/npcs", require("./routes/dialogue"));
app.use("/api/monsters", monstersRouter);
app.use("/api/wiki", wikiRouter);
app.use("/api/maps", mapsRouter);
app.use("/api/encounters", encountersRouter);
app.use("/api/backup", backupRouter);
app.use("/api/reference", referenceRouter);
app.use("/api/ai", aiRouter);
app.use("/api/rolls", rollsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/debug", debugRouter);
app.use("/api/parties", require("./routes/parties"));
app.use("/api/shops", shopsRouter);
app.use("/api/soundtracks", require("./routes/soundtracks"));
app.use("/api/calendar", require("./routes/calendar"));
app.use("/api/handouts", require("./routes/handouts"));
app.use("/api/quests", require("./routes/quests"));
app.use("/api/homebrew", require("./routes/homebrew"));
app.use("/api/encounter-templates", encounterTemplatesRouter);
app.use("/api/features", require("./routes/features"));
app.use("/api/loot", lootRouter);
app.use("/api/dashboard", require("./routes/dashboard"));

// ---------------------------------------------------------------------------
// Serve map, token, and AI-generated image uploads
// ---------------------------------------------------------------------------
const uploadsPath = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
const aiGeneratedPath = path.join(uploadsPath, "ai-generated");
if (!fs.existsSync(aiGeneratedPath)) {
  fs.mkdirSync(aiGeneratedPath, { recursive: true });
}

// Generate placeholder map image if it doesn't exist
const placeholderPath = path.join(uploadsPath, "placeholder_map.png");
if (!fs.existsSync(placeholderPath)) {
  try {
    // Simple 400x400 dark grid PNG
    const width = 400, height = 400;
    const pixels = [];
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(width * 4);
      for (let x = 0; x < width; x++) {
        const off = x * 4;
        // Dark background
        row[off] = 30; row[off+1] = 28; row[off+2] = 40; row[off+3] = 255;
        // Grid lines every 50px
        if (x % 50 < 2 || y % 50 < 2) {
          row[off] = 60; row[off+1] = 55; row[off+2] = 80;
        }
        // Gold crosshair in center
        const cx = width / 2, cy = height / 2;
        if (Math.abs(x - cx) < 3 || Math.abs(y - cy) < 3) {
          row[off] = 200; row[off+1] = 151; row[off+2] = 58;
        }
      }
      pixels.push(row);
    }

    // Build PNG manually (no dependencies needed)
    const pngChunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const c = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(require("zlib").crc32(c) >>> 0);
      return Buffer.concat([len, c, crc]);
    }

    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;  // bit depth
    ihdrData[9] = 6;  // RGBA
    ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
    const ihdr = pngChunk("IHDR", ihdrData);

    const raw = Buffer.concat(pixels.map(r => Buffer.concat([Buffer.from([0]), r])));
    const idat = pngChunk("IDAT", require("zlib").deflateSync(raw));
    const iend = pngChunk("IEND", Buffer.alloc(0));

    fs.writeFileSync(placeholderPath, Buffer.concat([sig, ihdr, idat, iend]));
    logger.info("http", "Generated placeholder map image", { path: placeholderPath });
  } catch (err) {
    logger.warn("http", "Failed to generate placeholder map image", { error: err.message });
  }
}

app.use("/uploads", express.static(uploadsPath));

// 5etools images are now served directly from 5e.tools website via https://5e.tools/img/...
// No local static mount needed.

// ---------------------------------------------------------------------------
// Serve the compiled React frontend (built by Vite  client/dist)
// In Docker the files live at /app/client/dist.
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// SPA fallback — return index.html for all unmatched routes so React Router
// works, but skip API endpoints
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  logger.debug("spa", "SPA fallback", { path: req.path });
  res.sendFile(path.join(clientDist, "index.html"));
});

// ---------------------------------------------------------------------------
// Centralized Express Error Handler
// ---------------------------------------------------------------------------
class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 404 catch-all for unknown API routes
app.use("/api/*", (_req, _res, next) => {
  next(new AppError(404, "Route not found"));
});

// Error middleware
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  const code = err.code || (status === 500 ? "INTERNAL_ERROR" : undefined);

  logger.error("http:error", `${status} ${req.method} ${req.path}`, {
    reqId: req.id,
    status,
    error: message,
    stack: status >= 500 ? err.stack : undefined,
  });

  if (!res.headersSent) {
    res.status(status).json({ error: message, code });
  }
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
server.listen(PORT, HOST, () => {
  const startupMsg = `Server running at http://${HOST}:${PORT}`;
  logger.info("app:startup", `[Tablecast]  ${startupMsg}`);
  logger.info("app:startup", `[Tablecast]  Health check:    http://${HOST}:${PORT}/api/health`);
  logger.info("app:startup", `[Tablecast]  Socket.io ready  awaiting connections`);

  const hasHttps = fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH);
  logger.info("server", "Server started", {
    port: PORT,
    host: HOST,
    httpsPort: hasHttps ? HTTPS_PORT : undefined,
    env: process.env.NODE_ENV || "development",
    debug: process.env.DEBUG || "(none)",
    logLevel: process.env.LOG_LEVEL || "info",
    healthEndpoint: `http://${HOST}:${PORT}/api/health`,
    pwaEndpoint: hasHttps ? `https://${HOST}:${HTTPS_PORT}` : "(HTTPS disabled — PWA works on localhost only)",
  });

  // Initialize rclone config file from DB
  const { initRcloneConfig } = require("./utils/backup");
  initRcloneConfig()
    .then(() => logger.info("backup", "rclone config initialized from database"))
    .catch((err) =>
      logger.error("backup", "Failed to initialize rclone config", {
        error: err.message,
      })
    );

  const referenceSyncOnStartup = process.env.REFERENCE_SYNC_ON_STARTUP === "true";
  logger.info("reference", "Reference cache refresh on startup", { enabled: referenceSyncOnStartup });
  if (referenceSyncOnStartup) {
    const { sync } = require("./utils/referenceSync");
    const { clearCache } = require("./utils/referenceSearch");
    const { clearCache: clearTokenImageCache } = require("./utils/tokenImageLookup");
    logger.info("reference", "Refreshing 5etools data cache on startup...");
    sync()
      .then(() => {
        clearCache();
        clearTokenImageCache();
        logger.info("reference", "Startup cache refresh completed");
      })
      .catch((err) =>
        logger.error("reference", "Startup cache refresh failed", {
          error: err.message,
        })
      );
  }
});

// Export for testing
module.exports = { app, server, io, AppError };
