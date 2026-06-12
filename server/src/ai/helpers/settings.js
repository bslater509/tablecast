// =============================================================================
// Tablecast — AI Shared Helpers: Settings
// AI settings loader from app_settings table
// =============================================================================
"use strict";

const prisma = require("../../prisma");
// eslint-disable-next-line unused-imports/no-unused-vars
const logger = require("../../utils/logger");

// ---------------------------------------------------------------------------
// Settings Loader
// ---------------------------------------------------------------------------
async function loadAiSettings() {
  const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel", "ai.model", "ai.imagePromptStyle"];
  const records = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

  let provider = "";
  let apiKey = "";
  let ollamaUrl = "http://localhost:11434";
  let ollamaModel = "llama3";
  let model = "gpt-5-nano";
  let imagePromptStyle = "";

  for (const r of records) {
    if (r.key === "ai.provider") provider = r.value;
    if (r.key === "ai.apiKey") apiKey = r.value;
    if (r.key === "ai.ollamaUrl") ollamaUrl = r.value;
    if (r.key === "ai.ollamaModel") ollamaModel = r.value;
    if (r.key === "ai.model") model = r.value;
    if (r.key === "ai.imagePromptStyle") imagePromptStyle = r.value;
  }

  return { provider, apiKey, ollamaUrl, ollamaModel, model, imagePromptStyle };
}

module.exports = { loadAiSettings };
