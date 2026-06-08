// =============================================================================
// Tablecast  Express + Socket.io Entry Point (Phase 2)
// Backend Engineer: Express routing, static serving, and Socket.io real-time.
// =============================================================================
"use strict";

require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Server: SocketServer } = require("socket.io");
const { registerSocketHandlers } = require("./socket");
const debug = require("./utils/debug");
const log = debug("tablecast:index");

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0"; // Bind to all interfaces so LAN devices can connect

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS  allow the Vite dev server (typically port 5173) during local dev
app.use(
  cors({
    origin: process.env.NODE_ENV === "production"
      ? false // In production the React SPA is served from Express  no CORS needed
      : ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Debug: log incoming API requests when DEBUG=tablecast:http
const httpLog = debug("tablecast:http");
app.use((req, _res, next) => {
  httpLog("%s %s", req.method, req.path);
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
    origin: process.env.NODE_ENV === "production"
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

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Health check  confirms the server is alive
app.get("/api/health", (_req, res) => {
  log("Health check — clients connected: %d", io.engine.clientsCount);
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
  log("Network IPs requested — found %d non-internal IPv4 address(es)", ips.length);
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

app.use("/api/users", usersRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/npcs", npcsRouter);
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

// ---------------------------------------------------------------------------
// Serve map and token image uploads
// ---------------------------------------------------------------------------
const fs = require("fs");
const uploadsPath = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use("/uploads", express.static(uploadsPath));

// Serve 5etools images repository statically. Local dev keeps it at repo root;
// Docker mounts it under server/.
const etoolsImgPaths = [
  path.join(__dirname, "../5etoolsimg"),
  path.join(__dirname, "../../5etoolsimg"),
].filter((dir, index, all) => fs.existsSync(dir) && all.indexOf(dir) === index);

for (const etoolsImgPath of etoolsImgPaths) {
  app.use("/5etoolsimg", express.static(etoolsImgPath));
}

// ---------------------------------------------------------------------------
// Serve the compiled React frontend (built by Vite  client/dist)
// In Docker the files live at /app/client/dist.
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// SPA fallback — return index.html for all unmatched routes so React Router works, but skip API endpoints
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  log("SPA fallback — serving index.html for: %s", req.path);
  res.sendFile(path.join(clientDist, "index.html"));
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
server.listen(PORT, HOST, () => {
  console.log(`[Tablecast]   Server running at http://${HOST}:${PORT}`);
  console.log(`[Tablecast]  Health check:    http://${HOST}:${PORT}/api/health`);
  console.log(`[Tablecast]  Socket.io ready  awaiting connections`);
  log("Debug logging enabled — DEBUG=%s", process.env.DEBUG || "(none)");
  log("Node environment: %s | Port: %d", process.env.NODE_ENV || "development", PORT);

  // Initialize rclone config file from DB
  const { initRcloneConfig } = require("./utils/backup");
  initRcloneConfig()
    .then(() => console.log("[Tablecast] rclone config initialized from database."))
    .catch(err => console.error("[Tablecast] Failed to initialize rclone config from database:", err.message));

  const referenceSyncOnStartup = process.env.REFERENCE_SYNC_ON_STARTUP === "true";
  console.log(`[Tablecast]  Reference sync on startup: ${referenceSyncOnStartup ? "enabled" : "disabled"}`);
  if (referenceSyncOnStartup) {
    const { sync } = require("./utils/referenceSync");
    const { clearCache } = require("./utils/referenceSearch");
    const { clearCache: clearTokenImageCache } = require("./utils/tokenImageLookup");
    console.log(`[Tablecast]  Checking for D&D 5e reference repositories...`);
    sync()
      .then(() => {
        clearCache();
        clearTokenImageCache();
      })
      .catch(err => console.error("[Tablecast] Startup references sync failed:", err.message));
  }
});

// Export for testing
module.exports = { app, server, io };
