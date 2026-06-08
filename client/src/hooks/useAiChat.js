// =============================================================================
// Tablecast — useAiChat Hook
// Shared state management hook for AI chat conversations.
// Provides messages, streaming state, send/cancel/retry/clear actions.
// Used by AiPanel, and can be adopted by ChatPanel for AI interactions.
// =============================================================================

import { useState, useRef, useCallback } from "react";
import { streamAiChat } from "../utils/aiStream";

/**
 * @param {Object} opts
 * @param {Object} [opts.user]           - User object with .id
 * @param {string} [opts.initialMessage] - Optional initial assistant message
 * @param {number} [opts.npcId]          - NPC ID for roleplay
 * @param {number} [opts.characterId]    - Character ID for context
 * @param {number} [opts.conversationId] - Existing conversation ID to load
 * @returns {Object} { messages, streaming, error, send, cancel, retry, clearMessages, setMessages }
 */
export function useAiChat({
  user,
  initialMessage = "",
  npcId,
  characterId,
  conversationId: initialConversationId,
} = {}) {
  const [messages, setMessages] = useState(
    initialMessage
      ? [{ role: "assistant", text: initialMessage }]
      : []
  );
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(initialConversationId || null);

  // Ref to store the last sent message for retry
  const lastQueryRef = useRef(null);
  // Ref to the cancel function
  const cancelRef = useRef(null);
  // Ref to track if streaming was intentionally cancelled
  const cancelledRef = useRef(false);

  const send = useCallback(
    async (text, overrides = {}) => {
      if (!text?.trim() || streaming) return;

      const query = text.trim();
      lastQueryRef.current = query;
      cancelledRef.current = false;

      // Add user message
      const userMsg = { role: "user", text: query };
      setMessages((prev) => [...prev, userMsg]);

      setStreaming(true);
      setError(null);

      let assistantStarted = false;
      let accumulated = "";

      const controller = new AbortController();
      cancelRef.current = () => controller.abort();

      try {
        const fullText = await streamAiChat({
          userId: user?.id,
          message: query,
          history: [], // we send fresh history via the server-side accumulation
          npcId: overrides.npcId ?? npcId,
          characterId: overrides.characterId ?? characterId,
          conversationId: overrides.conversationId ?? conversationId,
          stream: true,
          signal: controller.signal,
          onToken: (token) => {
            if (cancelledRef.current) return;
            accumulated += token;
            setMessages((prev) => {
              if (!assistantStarted) {
                assistantStarted = true;
                return [...prev, { role: "assistant", text: accumulated }];
              }
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", text: accumulated };
              return copy;
            });
          },
        });

        // If server returned a conversationId from auto-save, track it
        if (fullText && typeof fullText === "object" && fullText.conversationId) {
          setConversationId(fullText.conversationId);
        }
      } catch (err) {
        if (err.name === "AbortError" || cancelledRef.current) return;

        const errorText = err.message || "Connection lost.";
        setError(errorText);

        setMessages((prev) => {
          if (!assistantStarted) {
            return [...prev, { role: "assistant", text: `Error: ${errorText}` }];
          }
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = {
            role: "assistant",
            text: accumulated
              ? `${accumulated}\n\n*Error: ${errorText}*`
              : `Error: ${errorText}`,
          };
          return copy;
        });
      } finally {
        setStreaming(false);
        cancelRef.current = null;
      }
    },
    [user, streaming, npcId, characterId, conversationId]
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setStreaming(false);
  }, []);

  const retry = useCallback(async () => {
    if (!lastQueryRef.current) return;
    // Remove the last user + assistant messages (if any)
    setMessages((prev) => {
      // Remove last assistant message if it was an error
      const copy = [...prev];
      if (copy.length >= 2 && copy[copy.length - 1].role === "assistant") {
        copy.pop(); // remove assistant error/partial
      }
      if (copy.length >= 1 && copy[copy.length - 1].role === "user") {
        copy.pop(); // remove the user message that triggered the error
      }
      return copy;
    });
    await send(lastQueryRef.current);
  }, [send]);

  const clearMessages = useCallback(
    (newInitialMessage = "") => {
      setMessages(
        newInitialMessage
          ? [{ role: "assistant", text: newInitialMessage }]
          : []
      );
      setError(null);
      lastQueryRef.current = null;
    },
    []
  );

  const loadConversation = useCallback((conv) => {
    setConversationId(conv.id);
    setMessages(
      conv.messages?.map((m) => ({ role: m.role, text: m.text })) || []
    );
    setError(null);
  }, []);

  return {
    messages,
    setMessages,
    streaming,
    error,
    conversationId,
    setConversationId,
    send,
    cancel,
    retry,
    clearMessages,
    loadConversation,
    lastQueryRef,
  };
}
