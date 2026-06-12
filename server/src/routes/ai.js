// =============================================================================
// Tablecast — AI Router (Thin Mount)
// Re-exports all AI sub-modules as a single router + named function exports
// =============================================================================
"use strict";

const { Router } = require("express");

const settingsRouter = require("../ai/settings");
const generationRouter = require("../ai/generation");
const chatRouter = require("../ai/chat");
const mcpRouter = require("../ai/mcp");
const debugRouter = require("../ai/debug");
const helpers = require("../ai/helpers");

// HACK: generation/index.js isn't deploying via Docker. Re-add routes here.
const { requireDm } = require("../auth");
const {
  handleGenerateHooks,
  handleGenerateNames,
  handleGenerateWikiArticle,
  handleGenerateDescription,
  handleGenerateTravel,
  handleGenerateNpcPhrases,
  handleDetectRollChips,
} = require("../ai/generation/handlers");

const router = Router();

// Mount sub-modules — each defines its own route paths under /api/ai
router.get("/router-test", (req, res) => res.json({ ok: true, from: "routes/ai.js" }));
// Debug endpoint to check generation router state
router.get("/router-debug", (req, res) => {
  res.json({
    genRouterType: typeof generationRouter,
    genRouterRoutes: generationRouter && generationRouter.stack ? generationRouter.stack.map(s => s.route ? s.route.path + ' [' + Object.keys(s.route.methods).join(',') + ']' : '(sub-router)') : [],
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

// HACK: Missing generation routes (Docker deploy skips server/src/ai/ for some reason)
router.post("/generate-hooks", requireDm, handleGenerateHooks);
router.post("/generate-names", requireDm, handleGenerateNames);
router.post("/generate-wiki-article", requireDm, handleGenerateWikiArticle);
router.post("/generate-description", requireDm, handleGenerateDescription);
router.post("/generate-travel", requireDm, handleGenerateTravel);
router.post("/generate-npc-phrases", requireDm, handleGenerateNpcPhrases);
router.post("/detect-roll-chips", requireDm, handleDetectRollChips);

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
