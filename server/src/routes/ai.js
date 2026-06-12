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
