// =============================================================================
// Tablecast — Debug/Health Endpoints
// Provides introspection into server state for AI debugging.
// Endpoints:  GET /api/debug  - comprehensive server health & status
//             GET /api/debug/mcp-logs - recent MCP tool call history
//             GET /api/debug/ai-logs  - recent AI response history
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/debug — Comprehensive server health & status
// ---------------------------------------------------------------------------
router.get("/", async (_req, res) => {
  try {
    const start = Date.now();

    // Basic server info
    const info = {
      service: "tablecast",
      uptime: process.uptime(),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      pid: process.pid,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    };

    // Prisma connectivity
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch { /* db down */ }

    // Entity counts
    const [userCount, charCount, npcCount, monsterCount, mapCount, wikiCount, sessionCount, conversationCount] =
      await Promise.all([
        prisma.user.count().catch(() => 0),
        prisma.character.count().catch(() => 0),
        prisma.npc.count().catch(() => 0),
        prisma.monster.count().catch(() => 0),
        prisma.map.count().catch(() => 0),
        prisma.wikiArticle.count().catch(() => 0),
        prisma.gameSession.count().catch(() => 0),
        prisma.aiConversation.count().catch(() => 0),
      ]);

    // Reference cache status (if available)
    let referenceCache = { loaded: false, itemCount: 0 };
    try {
      const refSearch = require("../utils/referenceSearch");
      const stats = refSearch.getCacheStats ? refSearch.getCacheStats() : {};
      referenceCache = {
        loaded: refSearch.isLoaded !== undefined ? refSearch.isLoaded : "unknown",
        itemCount: stats.totalItems || stats.size || 0,
        categories: stats.categories || [],
      };
    } catch { /* module not available */ }

    // MCP log count
    const mcpLogCount = await prisma.mcpLog.count().catch(() => 0);
    const aiLogCount = await prisma.aiResponseLog.count().catch(() => 0);

    // Active SSE transports count (read from the in-memory map if accessible)
    let activeSseTransports = 0;
    try {
      // Attempt to read from the AI module's activeTransports map
      const aiModule = require("./ai");
      if (aiModule.getActiveTransportCount) {
        activeSseTransports = aiModule.getActiveTransportCount();
      }
    } catch { /* not available */ }

    const responseTime = Date.now() - start;

    res.json({
      status: dbOk ? "ok" : "degraded",
      info,
      database: { connected: dbOk },
      counts: {
        users: userCount,
        characters: charCount,
        npcs: npcCount,
        monsters: monsterCount,
        maps: mapCount,
        wikiArticles: wikiCount,
        gameSessions: sessionCount,
        aiConversations: conversationCount,
        mcpLogEntries: mcpLogCount,
        aiResponseLogs: aiLogCount,
      },
      referenceCache,
      activeSseTransports,
      responseTimeMs: responseTime,
    });
  } catch (err) {
    logger.error("debug", "Failed to gather debug info", { error: err.message });
    res.status(500).json({ error: "Failed to gather debug info." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/debug/mcp-logs — Recent MCP tool call history
// ---------------------------------------------------------------------------
router.get("/mcp-logs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const tool = req.query.tool || undefined;

    const where = tool ? { tool } : {};

    const logs = await prisma.mcpLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({ logs, count: logs.length });
  } catch (err) {
    logger.error("debug", "Failed to fetch MCP logs", { error: err.message });
    res.status(500).json({ error: "Failed to fetch MCP logs." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/debug/ai-logs — Recent AI response history
// ---------------------------------------------------------------------------
router.get("/ai-logs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const operation = req.query.operation || undefined;

    const where = operation ? { operation } : {};

    const logs = await prisma.aiResponseLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({ logs, count: logs.length });
  } catch (err) {
    logger.error("debug", "Failed to fetch AI logs", { error: err.message });
    res.status(500).json({ error: "Failed to fetch AI logs." });
  }
});

module.exports = router;
