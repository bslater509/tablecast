// =============================================================================
// Tablecast - Session Chat History Routes
// Endpoints: GET /api/chat
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const logger = require("../utils/logger");
const { sanitizeText } = require("../utils/sanitize");
const { getRequestUser } = require("../auth");

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/chat?limit=100&before=<id>  list latest persisted chat messages
// Supports offset-based pagination via the `before` cursor (message ID).
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 100;

    const before = typeof req.query.before === "string" ? req.query.before.trim() : null;

    const where = {};
    if (before) {
      const beforeMsg = await prisma.chatMessage.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (beforeMsg) {
        where.createdAt = { lt: beforeMsg.createdAt };
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const formatted = messages.reverse().map(formatChatMessage);

    res.json(formatted);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/chat", { error: err.message });
    res.status(500).json({ error: "Failed to fetch chat history." });
  }
});

function formatChatMessage(message) {
  return {
    id: message.id,
    userId: message.userId,
    sender: message.sender,
    text: sanitizeText(message.text, { maxLength: 2000 }),
    type: message.type,
    timestamp: message.createdAt.getTime(),
    createdAt: message.createdAt,
    rollDetails: parseJson(message.rollDetails),
  };
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = router;
