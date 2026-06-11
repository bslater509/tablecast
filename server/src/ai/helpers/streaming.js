// =============================================================================
// Tablecast — AI Shared Helpers: Streaming
// SSE helpers, stream pump functions, and streaming AI calls
// =============================================================================
"use strict";

const logger = require("../../utils/logger");
const { buildChatMessages } = require("./messages");
const { performAiCall } = require("./calls");

// ---------------------------------------------------------------------------
// SSE Helpers
// ---------------------------------------------------------------------------
function beginSseResponse(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

function writeSseEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Stream Pump Helpers
// ---------------------------------------------------------------------------
async function pumpOpenAiCompatibleStream(upstream, res) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Upstream responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Upstream returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        logger.warn("ai", "Failed to parse SSE data line", { payload });
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }

      const token = parsed.choices?.[0]?.delta?.content;
      if (token) {
        receivedContent = true;
        writeSseEvent(res, { type: "token", text: token });
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty streaming response from upstream.");
  }
}

async function pumpOllamaStream(upstream, res) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Ollama responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Ollama returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        logger.warn("ai", "Failed to parse Ollama stream line", { line: trimmed });
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error || "Ollama streaming error.");
      }

      const token = parsed.message?.content;
      if (token) {
        receivedContent = true;
        writeSseEvent(res, { type: "token", text: token });
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty response from Ollama server.");
  }
}

/**
 * Pump a streaming OpenAI-compatible response to an onToken callback.
 */
async function pumpOpenAiCompatibleStreamToCallback(upstream, onToken) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Upstream responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Upstream returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }

      const choice = parsed.choices?.[0];
      const content = choice?.delta?.content || choice?.text || "";
      if (content) {
        receivedContent = true;
        onToken(content);
      }
    }
  }

  if (!receivedContent) {
    throw new Error("AI returned an empty response.");
  }
}

/**
 * Pump a streaming Ollama response to an onToken callback.
 */
async function pumpOllamaStreamToCallback(upstream, onToken) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Upstream responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Ollama returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (parsed.done) {
        if (!receivedContent && parsed.message?.content) {
          onToken(parsed.message.content);
          receivedContent = true;
        }
        break;
      }

      const content = parsed.message?.content || "";
      if (content) {
        receivedContent = true;
        onToken(content);
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty response from Ollama server.");
  }
}

/**
 * Pump a streaming Gemini SSE response to an onToken callback.
 * Gemini uses SSE format: data: {"candidates":[{"content":{"parts":[{"text":"token"}]}}]}
 */
async function pumpGeminiStreamToCallback(upstream, onToken) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Gemini responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Gemini returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      // Gemini sometimes sends bare JSON arrays as end markers
      if (payload.startsWith("[")) continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }

      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        receivedContent = true;
        onToken(text);
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty response from Gemini API.");
  }
}

// ---------------------------------------------------------------------------
// Streaming AI call that yields tokens via onToken callback
// ---------------------------------------------------------------------------
async function performAiStreamTokens(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history, onToken, signal) {
  if (!provider) {
    throw new Error("No AI Provider configured.");
  }

  const messages = buildChatMessages(systemPrompt, userMessage, history);

  switch (provider) {
    case "lmstudio": {
      let baseUrl = ollamaUrl || "http://localhost:1234";
      if (!baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
        baseUrl = baseUrl.replace(/\/+$/, "") + "/v1";
      }
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "",
          messages,
          stream: true
        }),
        signal
      });
      await pumpOpenAiCompatibleStreamToCallback(response, onToken);
      return;
    }

    case "ollama": {
      const response = await fetch(`${ollamaUrl || "http://localhost:11434"}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "llama3",
          messages,
          stream: true
        }),
        signal
      });
      await pumpOllamaStreamToCallback(response, onToken);
      return;
    }

    case "opencode": {
      if (!apiKey) throw new Error("Missing OpenCode Zen API Key.");
      const model = ollamaModel || "gpt-5-nano";
      const response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true
        }),
        signal
      });
      await pumpOpenAiCompatibleStreamToCallback(response, onToken);
      return;
    }

    case "openai": {
      if (!apiKey) throw new Error("Missing OpenAI API Key.");
      const url = "https://api.openai.com/v1/chat/completions";
      const messages = buildChatMessages(systemPrompt, userMessage, history);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, stream: true }),
        signal
      });
      await pumpOpenAiCompatibleStreamToCallback(response, onToken);
      return;
    }

    case "gemini": {
      if (!apiKey) throw new Error("Missing Gemini API Key.");
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse";

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
      contents.push({ role: "user", parts: [{ text: userMessage }] });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({ contents }),
        signal
      });
      await pumpGeminiStreamToCallback(response, onToken);
      return;
    }

    case "anthropic":
    case "openrouter": {
      throw new Error(
        `Streaming not supported for provider "${provider}". Use stream: false or switch to Ollama/LM Studio/OpenCode for streaming support.`
      );
    }

    default: {
      const reply = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history);
      onToken(reply);
    }
  }
}

async function performAiStream(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history, res, signal) {
  const onToken = (text) => writeSseEvent(res, { type: "token", text });
  await performAiStreamTokens(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history, onToken, signal);
}

module.exports = {
  beginSseResponse,
  writeSseEvent,
  pumpOpenAiCompatibleStream,
  pumpOllamaStream,
  pumpOpenAiCompatibleStreamToCallback,
  pumpOllamaStreamToCallback,
  pumpGeminiStreamToCallback,
  performAiStreamTokens,
  performAiStream,
};
