// =============================================================================
// Tablecast — AI Shared Helpers: Calls
// HTTP AI call functions: safe JSON parsing and the core performAiCall
// =============================================================================
"use strict";

// eslint-disable-next-line unused-imports/no-unused-vars
const logger = require("../../utils/logger");
const { logAiResponse } = require("./logging");
const { buildChatMessages, formatHistoryOpenAi } = require("./messages");

/** Safely parse an HTTP response as JSON, with a human-readable error on failure */
async function safeParseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    const snippet = text.substring(0, 200).replace(/\n/g, " ").replace(/\r/g, "");
    throw new Error(`AI service returned an unexpected response (${snippet}${text.length > 200 ? "..." : ""}). Check your AI provider settings or try again.`);
  }
}

// ---------------------------------------------------------------------------
// HTTP AI Call Core Function
// ---------------------------------------------------------------------------
async function performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history = [], operation = "unknown") {
  if (!provider) {
    throw new Error("No AI Provider configured.");
  }

  const startTime = Date.now();

  const exec = async () => {
    switch (provider) {
    case "gemini": {
      if (!apiKey) throw new Error("Missing Gemini API Key.");
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

      const contents = [];
      contents.push({
        role: "user",
        parts: [{ text: `System Instruction: ${systemPrompt}` }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood. I will roleplay and provide information according to these instructions." }]
      });

      for (const h of history) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.text }]
        });
      }

      contents.push({
        role: "user",
        parts: [{ text: userMessage }]
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({ contents })
      });

      const data = await safeParseJsonResponse(response);
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) throw new Error("Empty response from Gemini API.");
      return reply;
    }

    case "openai": {
      if (!apiKey) throw new Error("Missing OpenAI API Key.");
      const url = "https://api.openai.com/v1/chat/completions";

      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: ollamaModel || "gpt-4o-mini",
          messages
        })
      });

      const data = await safeParseJsonResponse(response);
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response from OpenAI API.");
      return reply;
    }

    case "anthropic": {
      if (!apiKey) throw new Error("Missing Anthropic API Key.");
      const url = "https://api.anthropic.com/v1/messages";

      const messages = [
        ...formatHistoryOpenAi(history),
        { role: "user", content: userMessage }
      ];

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: ollamaModel || "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          system: systemPrompt,
          messages
        })
      });

      const data = await safeParseJsonResponse(response);
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      const reply = data.content?.[0]?.text;
      if (!reply) throw new Error("Empty response from Anthropic API.");
      return reply;
    }

    case "ollama": {
      const url = `${ollamaUrl || "http://localhost:11434"}/api/chat`;
      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "llama3",
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama responded with status: ${response.status}`);
      }

      const data = await safeParseJsonResponse(response);
      const reply = data.message?.content;
      if (!reply) throw new Error("Empty response from Ollama server.");
      return reply;
    }

    case "lmstudio": {
      let baseUrl = ollamaUrl || "http://localhost:1234";
      if (!baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
        baseUrl = `${baseUrl.replace(/\/+$/, "")}/v1`;
      }
      const url = `${baseUrl}/chat/completions`;
      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "",
          messages
        })
      });

      if (!response.ok) {
        throw new Error(`LM Studio responded with status: ${response.status}`);
      }

      const data = await safeParseJsonResponse(response);
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response from LM Studio.");
      return reply;
    }

    case "opencode": {
      if (!apiKey) throw new Error("Missing OpenCode Zen API Key.");
      const model = ollamaModel || "gpt-5-nano";
      const url = "https://opencode.ai/zen/v1/chat/completions";
      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`OpenCode Zen responded with status: ${response.status}${errText ? ` - ${errText}` : ""}`);
      }

      const data = await safeParseJsonResponse(response);
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response from OpenCode Zen API.");
      return reply;
    }

    default:
      throw new Error(`Unknown AI Provider: ${provider}`);
  }
    };

    try {
      const reply = await exec();
      logAiResponse(operation, userMessage, reply, true, null, Date.now() - startTime).catch(() => {});
      return reply;
    } catch (err) {
      logAiResponse(operation, userMessage, `Error: ${err.message}`, false, err.message, Date.now() - startTime).catch(() => {});
      throw err;
    }
}

module.exports = {
  safeParseJsonResponse,
  performAiCall,
};
