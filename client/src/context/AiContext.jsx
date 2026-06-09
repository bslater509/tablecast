// =============================================================================
// Tablecast — AI Context (Phase 2)
// Unified state provider for AI configuration, NPC list, and character list.
// Eliminates redundant fetches and stale cross-component state across
// AiPanel, AiChatView, MessageHub, and AiAssistButton.
// =============================================================================
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AiContext = createContext(null);

/**
 * AiProvider — wraps the app to provide shared AI state:
 * - aiSettings (provider, model, apiKey masked)
 * - modelList
 * - loading / error state
 * - refreshSettings(), testConnection()
 * - npcs, selectedNpcId, selectNpc
 * - characters, selectedCharId, selectChar
 */
export function AiProvider({ children, user }) {
  // ---- AI Settings ----
  const [aiSettings, setAiSettings] = useState(null);
  const [modelList, setModelList] = useState([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState(null);

  // ---- NPCs ----
  const [npcs, setNpcs] = useState([]);
  const [selectedNpcId, setSelectedNpcId] = useState("");
  const [npcsLoading, setNpcsLoading] = useState(false);

  // ---- Characters ----
  const [characters, setCharacters] = useState([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  const [charsLoading, setCharsLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/ai/settings");
      if (res.ok) {
        const data = await res.json();
        setAiSettings(data);
      } else {
        setSettingsError("Failed to load AI settings");
      }
    } catch (err) {
      setSettingsError(err.message || "Failed to load AI settings");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/models");
      if (res.ok) {
        setModelList(await res.json());
      }
    } catch {
      // models are non-critical
    }
  }, []);

  const testConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const data = await res.json();
      return data;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, []);

  // ---------------------------------------------------------------------------
  // NPCs
  // ---------------------------------------------------------------------------
  const loadNpcs = useCallback(async () => {
    setNpcsLoading(true);
    try {
      const res = await fetch("/api/npcs");
      if (res.ok) {
        const data = await res.json();
        setNpcs(data);
        if (data.length > 0 && !selectedNpcId) {
          setSelectedNpcId(data[0].id.toString());
        }
      }
    } catch (err) {
      console.error("[AiContext] Failed to load NPCs:", err);
    } finally {
      setNpcsLoading(false);
    }
  }, [selectedNpcId]);

  // ---------------------------------------------------------------------------
  // Characters
  // ---------------------------------------------------------------------------
  const loadCharacters = useCallback(async (userId) => {
    if (!userId) return;
    setCharsLoading(true);
    try {
      const res = await fetch(`/api/characters?userId=${userId}`, {
        headers: { "x-tablecast-user-id": String(userId) },
      });
      if (res.ok) {
        const data = await res.json();
        setCharacters(data || []);
        if (data?.length > 0 && !selectedCharId) {
          setSelectedCharId(data[0].id.toString());
        }
      }
    } catch (err) {
      console.error("[AiContext] Failed to load characters:", err);
    } finally {
      setCharsLoading(false);
    }
  }, [selectedCharId]);

  // ---------------------------------------------------------------------------
  // Initial loads
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadSettings();
    loadModels();
  }, [loadSettings, loadModels]);

  useEffect(() => {
    loadNpcs();
  }, [loadNpcs]);

  useEffect(() => {
    if (user?.id) {
      loadCharacters(user.id);
    }
  }, [user?.id, loadCharacters]);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------
  const value = {
    // Settings
    aiSettings,
    modelList,
    settingsLoading,
    settingsError,
    refreshSettings: loadSettings,
    testConnection,

    // NPCs
    npcs,
    npcsLoading,
    selectedNpcId,
    selectNpc: setSelectedNpcId,

    // Characters
    characters,
    charsLoading,
    selectedCharId,
    selectChar: setSelectedCharId,
  };

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

/**
 * useAi — hook to consume AI context.
 * Must be used inside an <AiProvider>.
 */
export function useAi() {
  const ctx = useContext(AiContext);
  if (!ctx) {
    throw new Error("useAi() must be used inside an <AiProvider>.");
  }
  return ctx;
}
