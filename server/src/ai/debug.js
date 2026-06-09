// =============================================================================
// Tablecast — AI Debug Route
// AI subsystem health and statistics
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const logger = require("../utils/logger");
const { requireDm } = require("../auth");
const { loadAiSettings } = require("./helpers");
const { getActiveTransportCount } = require("./mcp");

const router = Router();

// ---------------------------------------------------------------------------
// GET /debug - AI subsystem debug info (DM only)
// ---------------------------------------------------------------------------
router.get("/debug", requireDm, async (req, res) => {
  try {
    const settings = await loadAiSettings();

    // Response log stats
    const [totalLogs, errorLogs, recentOperations] = await Promise.all([
      prisma.aiResponseLog.count().catch(() => 0),
      prisma.aiResponseLog.count({ where: { parsedOk: false } }).catch(() => 0),
      prisma.aiResponseLog
        .findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { operation: true, parsedOk: true, createdAt: true } })
        .catch(() => []),
    ]);

    // Conversation stats
    const [conversationCount, messageCount] = await Promise.all([
      prisma.aiConversation.count().catch(() => 0),
      prisma.aiMessage.count().catch(() => 0),
    ]);

    res.json({
      configuration: {
        provider: settings.provider || "not configured",
        model: settings.provider === "opencode" ? settings.model : settings.ollamaModel || "not set",
        hasApiKey: !!settings.apiKey,
        ollamaUrl: settings.ollamaUrl,
      },
      responseLog: {
        totalEntries: totalLogs,
        parseErrors: errorLogs,
        recentOperations,
      },
      conversations: {
        total: conversationCount,
        totalMessages: messageCount,
      },
      activeSseTransports: getActiveTransportCount(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("ai:debug", "Failed to gather AI debug info", { error: err.message });
    res.status(500).json({ error: "Failed to gather AI debug info." });
  }
});

module.exports = router;
