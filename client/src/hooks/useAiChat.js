// =============================================================================
// Tablecast — useAiChat Hook
// Shared state management hook for AI chat conversations.
// Provides messages, streaming state, send/cancel/retry/clear actions.
// Used by AiPanel, and can be adopted by ChatPanel for AI interactions.
// =============================================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { streamAiChat } from "../utils/aiStream";
import { getJsonAuthHeaders } from "../utils/authHeaders";

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
  // Ref to track if component is mounted
  const mountedRef = useRef(true);
  // Ref to the current AbortController
  const controllerRef = useRef(null);
  // Ref to keep messages in sync for multi-turn context (used in send callback)
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Cleanup on unmount — abort in-flight request and prevent state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, []);

  // Load conversation messages when initialConversationId is provided
  useEffect(() => {
    if (!initialConversationId) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/ai/conversations/${initialConversationId}`, {
          headers: getJsonAuthHeaders(user),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.messages) {
          setMessages(data.messages.map(m => ({ role: m.role, text: m.text, createdAt: m.createdAt, timestamp: m.createdAt })));
        }
      } catch (err) {
        console.error("[useAiChat] Failed to load conversation:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [initialConversationId, user?.id]);

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
      controllerRef.current = controller;
      cancelRef.current = () => controller.abort();

      try {
        // Build multi-turn context from current messages (excluding the system message)
        const history = messagesRef.current
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, text: m.text }));

        const result = await streamAiChat({
          user,
          message: query,
          history,
          npcId: overrides.npcId ?? npcId,
          characterId: overrides.characterId ?? characterId,
          conversationId: overrides.conversationId ?? conversationId,
          stream: true,
          signal: controller.signal,
          onToken: (token) => {
            if (!mountedRef.current || cancelledRef.current) return;
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

        if (!mountedRef.current) return;

        // If server returned a conversationId from auto-save, track it
        if (result?.conversationId) {
          setConversationId(result.conversationId);
        }

        // Attach rollChips to the last assistant message if present
        if (result?.rollChips && result.rollChips.length > 0) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, rollChips: result.rollChips };
            }
            return copy;
          });
        }
      } catch (err) {
        if (err.name === "AbortError" || !mountedRef.current || cancelledRef.current) return;

        const errorText = err.message || "Connection lost.";
        if (!mountedRef.current) return;
        setError(errorText);

        if (mountedRef.current) {
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
        }
      } finally {
        if (mountedRef.current) {
          setStreaming(false);
        }
        cancelRef.current = null;
        controllerRef.current = null;
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
