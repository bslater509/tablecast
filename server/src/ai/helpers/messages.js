// =============================================================================
// Tablecast — AI Shared Helpers: Messages
// Chat message builders for AI provider API calls
// =============================================================================
"use strict";

// ---------------------------------------------------------------------------
// Message Builders
// ---------------------------------------------------------------------------
function formatHistoryOpenAi(history = []) {
  return history.map(h => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.text
  }));
}

function buildChatMessages(systemPrompt, userMessage, history = []) {
  return [
    { role: "system", content: systemPrompt },
    ...formatHistoryOpenAi(history),
    { role: "user", content: userMessage }
  ];
}

module.exports = {
  formatHistoryOpenAi,
  buildChatMessages,
};
