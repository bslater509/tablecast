// =============================================================================
// Tablecast - Session Chat History Routes
// Endpoints: GET /api/chat
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const logger = require("../utils/logger");

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/chat?limit=100  list latest persisted chat messages
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 100;

    const messages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json(messages.reverse().map(formatChatMessage));
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
    text: message.text,
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
