// =============================================================================
// Tablecast — useConversations Hook (Phase 2)
// Extracted from AiPanel to reduce local state count.
// Provides conversation list CRUD: loading, create, delete, load.
// =============================================================================
import { useState, useCallback } from "react";

/**
 * @param {Object} opts
 * @param {Object} [opts.user] - User object with .id
 * @returns {Object} { conversations, loadingConvs, loadConversationList, createConversation, deleteConversation, loadConversation }
 */
export function useConversations({ user } = {}) {
  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const loadConversationList = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch("/api/ai/conversations", {
        headers: { "x-tablecast-user-id": user?.id || "" },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error("[useConversations] Failed to load:", err);
    } finally {
      setLoadingConvs(false);
    }
  }, [user?.id]);

  /**
   * Create a new conversation.
   * @param {"rules"|"npc"} type
   * @param {number} [npcId] - Required if type === "npc"
   * @returns {Promise<Object|null>} The created conversation or null
   */
  const createConversation = useCallback(async (type, npcId) => {
    try {
      const res = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tablecast-user-id": user?.id || "",
        },
        body: JSON.stringify({
          type,
          npcId: type === "npc" ? npcId || null : null,
        }),
      });
      if (res.ok) {
        const conv = await res.json();
        await loadConversationList();
        return conv;
      }
    } catch (err) {
      console.error("[useConversations] Failed to create:", err);
    }
    return null;
  }, [user?.id, loadConversationList]);

  /**
   * Delete a conversation by ID.
   * @param {number} convId
   */
  const deleteConversation = useCallback(async (convId) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}`, {
        method: "DELETE",
        headers: { "x-tablecast-user-id": user?.id || "" },
      });
      if (res.ok) {
        await loadConversationList();
      }
    } catch (err) {
      console.error("[useConversations] Failed to delete:", err);
    }
  }, [user?.id, loadConversationList]);

  /**
   * Load a full conversation (with messages) by ID.
   * @param {number} convId
   * @returns {Promise<Object|null>} The conversation with messages
   */
  const loadConversation = useCallback(async (convId) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}`, {
        headers: { "x-tablecast-user-id": user?.id || "" },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error("[useConversations] Failed to load conv:", err);
    }
    return null;
  }, [user?.id]);

  return {
    conversations,
    loadingConvs,
    loadConversationList,
    createConversation,
    deleteConversation,
    loadConversation,
  };
}
