// =============================================================================
// Tablecast — AI Shared Helpers (Barrel)
// Re-exports all functions from domain sub-modules.
// Consumers require("../ai/helpers") — Node resolves to this index.js.
// =============================================================================
"use strict";

const { logAiResponse } = require("./logging");
const {
  formatCreaturePromptList,
  formatEntityList,
  cleanText,
  stringifyEntries,
  cleanAiFieldOutput,
  stripAiJsonCodeFences,
  parseJsonArray,
} = require("./formatting");
const { findRelevantRules, fetchCampaignWikiSnippet } = require("./rag");
const {
  buildNpcProfileContext,
  buildNpcRoleplaySystemPrompt,
  ASSIST_ACTIONS_REQUIRING_TEXT,
} = require("./profiles");
const { buildAssistSystemPrompt, buildAssistUserMessage } = require("./assist");
const { loadAiSettings } = require("./settings");
const { formatHistoryOpenAi, buildChatMessages } = require("./messages");
const {
  beginSseResponse,
  writeSseEvent,
  pumpOpenAiCompatibleStream,
  pumpOllamaStream,
  pumpOpenAiCompatibleStreamToCallback,
  pumpOllamaStreamToCallback,
  pumpGeminiStreamToCallback,
  performAiStreamTokens,
  performAiStream,
} = require("./streaming");
const { safeParseJsonResponse, performAiCall } = require("./calls");
const { loadSessionAiContext } = require("./session");
const { streamGenerate } = require("./generation");

module.exports = {
  logAiResponse,
  formatCreaturePromptList,
  formatEntityList,
  cleanText,
  stringifyEntries,
  findRelevantRules,
  buildNpcProfileContext,
  buildNpcRoleplaySystemPrompt,
  cleanAiFieldOutput,
  fetchCampaignWikiSnippet,
  buildAssistSystemPrompt,
  buildAssistUserMessage,
  stripAiJsonCodeFences,
  parseJsonArray,
  loadAiSettings,
  formatHistoryOpenAi,
  buildChatMessages,
  beginSseResponse,
  writeSseEvent,
  pumpOpenAiCompatibleStream,
  pumpOllamaStream,
  pumpOpenAiCompatibleStreamToCallback,
  pumpOllamaStreamToCallback,
  pumpGeminiStreamToCallback,
  performAiStreamTokens,
  performAiStream,
  safeParseJsonResponse,
  performAiCall,
  loadSessionAiContext,
  ASSIST_ACTIONS_REQUIRING_TEXT,
  streamGenerate,
};
