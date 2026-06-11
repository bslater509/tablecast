// =============================================================================
// Tablecast — AI Shared Helpers: Logging
// AI Response Audit Logger
// =============================================================================
"use strict";

const prisma = require("../../prisma");
const logger = require("../../utils/logger");

// ---------------------------------------------------------------------------
// AI Response Audit Logger
// ---------------------------------------------------------------------------
async function logAiResponse(operation, prompt, rawReply, parsedOk, errorMsg, durationMs) {
  try {
    await prisma.aiResponseLog.create({
      data: {
        operation,
        prompt: String(prompt).slice(0, 5000),
        rawReply: String(rawReply).slice(0, 10000),
        parsedOk,
        errorMsg: errorMsg ? String(errorMsg).slice(0, 500) : null,
        durationMs: durationMs || null,
      },
    });
  } catch (logErr) {
    logger.error("ai:log", "Failed to persist AI response log", { error: logErr.message });
  }
}

module.exports = { logAiResponse };
