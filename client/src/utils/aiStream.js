// =============================================================================
// Tablecast — AI Stream Utility
// Shared SSE streaming client for AI chat, used by AiPanel and potentially
// other components. Provides cancel/retry support via AbortController.
// =============================================================================

import { getAuthHeaders } from "./authHeaders";

/**
 * Stream an AI chat response from the server.
 *
 * @param {Object} opts
 * @param {Object} opts.user        - User object (with .id, .isCharacter) for auth headers
 * @param {string} opts.message     - The user's message
 * @param {Array}  opts.history     - Previous messages [{ role, text }]
 * @param {number} [opts.npcId]     - NPC ID for roleplay
 * @param {number} [opts.characterId] - Character ID for context
 * @param {number} [opts.conversationId] - Conversation ID for auto-save
 * @param {boolean} [opts.stream=true] - Whether to stream
 * @param {AbortSignal} [opts.signal]   - AbortController signal for cancellation
 * @param {Function} opts.onToken   - Callback(token: string) for each token
 * @returns {Promise<string>} The full accumulated response text
 */
export async function streamAiChat({
  user,
  message,
  history = [],
  npcId,
  characterId,
  conversationId,
  stream = true,
  signal,
  onToken,
}) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: getAuthHeaders(user, "application/json"),
    body: JSON.stringify({
      message,
      npcId,
      characterId,
      conversationId,
      history,
      stream,
    }),
    signal,
  });

  const contentType = res.headers.get("content-type") || "";

  // Non-streaming response
  if (!contentType.includes("text/event-stream")) {
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed (${res.status})`);
    }
    const data = await res.json();
    if (data.reply) {
      onToken(data.reply);
    }
    return { text: data.reply || "", conversationId: data.conversationId };
  }

  // Streaming response (SSE)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to start AI stream (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let receivedToken = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;

      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      if (event.type === "token" && event.text) {
        receivedToken = true;
        fullText += event.text;
        onToken(event.text);
      } else if (event.type === "error") {
        throw new Error(event.message || "Failed to query AI assistant.");
      }
      // "context", "done" events are consumed silently
    }
  }

  if (!receivedToken) {
    throw new Error("AI returned an empty response.");
  }

  return { text: fullText, conversationId: opts.conversationId };
}

/**
 * Creates an abortable AI stream. Returns { promise, cancel }.
 * Useful for components that want cancel/retry without managing
 * AbortController directly.
 */
export function createAiChatStream(opts) {
  const controller = new AbortController();
  const promise = streamAiChat({ ...opts, signal: controller.signal });
  return {
    promise,
    cancel: () => controller.abort(),
  };
}
