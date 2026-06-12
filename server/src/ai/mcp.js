// =============================================================================
// Tablecast — MCP SSE Bridge Routes
// SSE transport for MCP server communication
// =============================================================================
"use strict";

const { Router } = require("express");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { createMcpServer } = require("../mcp-server");
const logger = require("../utils/logger");
const { requireDm } = require("../auth");

const router = Router();

// Track active SSE transports by sessionId
const activeTransports = new Map();

// Heartbeat interval handles for SSE connections
const activeHeartbeats = new Map();

// ---------------------------------------------------------------------------
// GET /mcp - SSE connection stream
// ---------------------------------------------------------------------------
router.get("/mcp", requireDm, async (req, res) => {
  try {
    const transport = new SSEServerTransport("/api/ai/mcp/message", res);

    const connectionServer = createMcpServer();
    await connectionServer.connect(transport);

    const {sessionId} = transport;
    const startTime = Date.now();
    activeTransports.set(sessionId, transport);
    logger.info("mcp:sse", "MCP SSE connection established", { sessionId });

    // Heartbeat — log session activity every 60s for debugging
    const heartbeatInterval = setInterval(() => {
      const age = Date.now() - startTime;
      logger.debug("mcp:sse:heartbeat", "MCP SSE session alive", {
        sessionId,
        ageMs: age,
        ageSeconds: Math.round(age / 1000),
      });
    }, 60_000);
    activeHeartbeats.set(sessionId, heartbeatInterval);

    req.on("close", () => {
      logger.info("mcp:sse", "MCP SSE connection closed", { sessionId });
      activeTransports.delete(sessionId);
      const hb = activeHeartbeats.get(sessionId);
      if (hb) {
        clearInterval(hb);
        activeHeartbeats.delete(sessionId);
      }
    });
  } catch (err) {
    logger.error("mcp:sse", "Error setting up MCP SSE transport", { error: err.message });
    if (!res.headersSent) {
      res.status(500).send("Failed to initiate MCP connection");
    }
  }
});

// ---------------------------------------------------------------------------
// POST /mcp/message - JSON-RPC message target
// ---------------------------------------------------------------------------
router.post("/mcp/message", requireDm, async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).send("Missing sessionId query parameter");
  }

  const transport = activeTransports.get(sessionId);
  if (!transport) {
    return res.status(404).send(`Session '${sessionId}' not found or closed`);
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    logger.error("mcp:sse", "Error handling MCP post message", { sessionId, error: err.message });
    if (!res.headersSent) {
      res.status(500).send("Error processing message");
    }
  }
});

function getActiveTransportCount() {
  return activeTransports.size;
}

module.exports = router;
module.exports.getActiveTransportCount = getActiveTransportCount;
