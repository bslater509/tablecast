// =============================================================================
// Tablecast — AI Shared Helpers: Generation
// streamGenerate — shared pattern for SSE generation endpoints
// =============================================================================
"use strict";

const logger = require("../../utils/logger");
const { beginSseResponse, writeSseEvent } = require("./streaming");
const { loadAiSettings } = require("./settings");
const { performAiCall } = require("./calls");

// ---------------------------------------------------------------------------
// streamGenerate — shared pattern for SSE generation endpoints
// ---------------------------------------------------------------------------
async function streamGenerate(res, { operation, systemPrompt, userMessage, parser, contextBuilder }) {
  beginSseResponse(res);
  try {
    const context = contextBuilder ? await contextBuilder() : "";
    writeSseEvent(res, { type: "status", text: "Generating..." });
    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      writeSseEvent(res, { type: "error", message: "AI is not configured. Please set up API keys in Settings." });
      writeSseEvent(res, { type: "done" });
      res.end();
      return;
    }

    // Inject context into system prompt
    const fullSystemPrompt = context ? `${systemPrompt}\n\n${context}` : systemPrompt;
    const result = await performAiCall(provider, apiKey, ollamaUrl, activeModel, fullSystemPrompt, userMessage, [], operation);
    const parsed = parser(result);
    writeSseEvent(res, { type: "result", data: parsed });
    writeSseEvent(res, { type: "done" });
  } catch (err) {
    writeSseEvent(res, { type: "error", message: err.message });
    logger.error(`ai:${operation}`, "Generation failed", { error: err.message });
  } finally {
    res.end();
  }
}

module.exports = { streamGenerate };
