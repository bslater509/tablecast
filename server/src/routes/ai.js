// =============================================================================
// Tablecast — AI Router (Thin Mount)
// Re-exports all AI sub-modules as a single router + named function exports
// =============================================================================
"use strict";

const { Router } = require("express");

const settingsRouter = require("../ai/settings");
const chatRouter = require("../ai/chat");
const mcpRouter = require("../ai/mcp");
const debugRouter = require("../ai/debug");
const copilotRouter = require("../ai/copilot");
const helpers = require("../ai/helpers");
const { requireDm } = require("../auth");

// Load the generation router with error trapping so a module load failure
// doesn't crash the whole server (degraded mode: newer routes fall back to
// the safety-net registrations below)
let generationRouter;
try {
  generationRouter = require("../ai/generation");
} catch (err) {
  const logger = require("../utils/logger");
  logger.error("ai:generation", "FATAL: failed to load generation router", { error: err.message, stack: err.stack });
  const { Router } = require("express");
  generationRouter = Router(); // empty fallback router
}

const router = Router();

// Mount sub-modules — each defines its own route paths under /api/ai
router.get("/router-test", (req, res) => res.json({ ok: true, from: "routes/ai.js" }));
// Debug endpoint to check generation router state
router.get("/router-debug", (req, res) => {
  res.json({
    genRouterType: typeof generationRouter,
    genRouterRoutes: generationRouter && generationRouter.stack ? generationRouter.stack.map(s => s.route ? `${s.route.path} [${Object.keys(s.route.methods).join(",")}]` : "(sub-router)") : [],
    settingsType: typeof settingsRouter,
    chatType: typeof chatRouter,
    mcpType: typeof mcpRouter,
  });
});
router.use("/", settingsRouter);
router.use("/", generationRouter);
router.use("/", chatRouter);
router.use("/", mcpRouter);
router.use("/", debugRouter);
router.use("/", copilotRouter);

// Safety-net: register routes directly in case generation/index.js failed to load
// (empty fallback router). Only active when the main generation router is empty.
// Using a lazy require so any module load failure is isolated and logged.
if (generationRouter.stack.length === 0) {
  const logger = require("../utils/logger");
  logger.warn("http:ai", "[AI routes] generationRouter is empty — activating safety-net fallback");
  (function registerGenerationSafetyNet() {
  try {
    const {
      handleGenerateHooks,
      handleGenerateNames,
      handleGenerateWikiArticle,
      handleGenerateDescription,
      handleGenerateTravel,
      handleGenerateNpcPhrases,
      handleDetectRollChips,
      handleGenerateImage,
      handleDeployTest,
    } = require("../ai/generation/handlers");

    // Use a sub-router with a flag so we know which path served the request
    const safetyRouter = Router();
    safetyRouter.post("/generate-hooks", requireDm, handleGenerateHooks);
    safetyRouter.post("/generate-names", requireDm, handleGenerateNames);
    safetyRouter.post("/generate-wiki-article", requireDm, handleGenerateWikiArticle);
    safetyRouter.post("/generate-description", requireDm, handleGenerateDescription);
    safetyRouter.post("/generate-travel", requireDm, handleGenerateTravel);
    safetyRouter.post("/generate-npc-phrases", requireDm, handleGenerateNpcPhrases);
    safetyRouter.post("/detect-roll-chips", requireDm, handleDetectRollChips);
    safetyRouter.post("/generate-image", requireDm, handleGenerateImage);
    safetyRouter.post("/deploy-test", handleDeployTest);
    safetyRouter.get("/ping", (req, res) => res.json({ ok: true, ts: Date.now(), via: "safety-net" }));
    router.use("/", safetyRouter);
    const logger = require("../utils/logger");
    logger.info("http:ai", "[AI routes] Safety-net generation routes registered.");
  } catch (err) {
    const logger = require("../utils/logger");
    logger.error("ai:routes", "Failed to register safety-net generation routes", { error: err.message });
  }
  })();
  }

// Named re-exports for socket.js and other consumers
module.exports = {
  router,
  performAiCall: helpers.performAiCall,
  performAiStream: helpers.performAiStream,
  performAiStreamTokens: helpers.performAiStreamTokens,
  findRelevantRules: helpers.findRelevantRules,
  buildNpcProfileContext: helpers.buildNpcProfileContext,
  buildNpcRoleplaySystemPrompt: helpers.buildNpcRoleplaySystemPrompt,
  loadAiSettings: helpers.loadAiSettings,
  logAiResponse: helpers.logAiResponse,
  getActiveTransportCount: mcpRouter.getActiveTransportCount,
};
