// =============================================================================
// Tablecast — AI Assistant Panel (v2)
// Persisted conversations, streaming with cancel/retry, quick prompts, model
// badge, timestamps, copy button, character context indicator.
// =============================================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, Trash2, Plus, RotateCcw, X, Sparkles, User } from "lucide-react";
import { useAiChat } from "../hooks/useAiChat";
import { useAi } from "../context/AiContext";
import { useConversations } from "../hooks/useConversations";
import { compileMarkdown } from "../utils/markdown";
import AiStreamingIndicator from "./AiStreamingIndicator";

// ---------------------------------------------------------------------------
// Copy Button Component
// ---------------------------------------------------------------------------
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };
  useEffect(() => () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    }, []);
  return (
    <button
      onClick={handleCopy}
      style={styles.copyBtn}
      className="btn-hover-scale"
      title="Copy to clipboard"
      aria-label="Copy message"
    >
      {copied ? <Check size={13} color="var(--color-success)" /> : <Copy size={13} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Quick Action Chips
// ---------------------------------------------------------------------------
const RULES_QUICK_PROMPTS = [
  "How does grappling work?",
  "Explain concentration saves",
  "What are the action economy rules?",
  "Tell me about the Fireball spell",
];

// ---------------------------------------------------------------------------
// Time formatting helper
// ---------------------------------------------------------------------------
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// =============================================================================
// Main AiPanel Component
// =============================================================================
export default function AiPanel({ user }) {
  const [activeTab, setActiveTab] = useState("rules"); // "rules" or "npc"

  // ---- Shared AI Context (settings, NPCs, characters) ----
  const {
    aiSettings,
    npcs, selectedNpcId, selectNpc,
    characters, selectedCharId, selectChar,
  } = useAi();

  // ---- Conversations hook ----
  const {
    conversations, loadingConvs,
    loadConversationList, createConversation, deleteConversation, loadConversation,
  } = useConversations({ user });

  // Refs
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const npcScrollRef = useRef(null);
  const npcInputRef = useRef(null);
  const focusTimeoutRef = useRef(null);

  // --- Rules Chat Hook ---
  const rulesChat = useAiChat({
    user,
    initialMessage: "Hail! I am your D&D Rules Scholar. Ask me any question about spells, combat, actions, items, or general D&D rules, and I will search the library to help you.",
    characterId: selectedCharId ? Number(selectedCharId) : undefined,
    conversationId: undefined,
  });

  // --- NPC Chat Hook ---
  const npcChat = useAiChat({
    user,
    npcId: selectedNpcId ? Number(selectedNpcId) : undefined,
    characterId: selectedCharId ? Number(selectedCharId) : undefined,
    conversationId: undefined,
  });

  // Get the active chat
  const chat = activeTab === "rules" ? rulesChat : npcChat;

  // Track the conversation ID from auto-save
  const [currentRulesConvId, setCurrentRulesConvId] = useState(null);
  const [currentNpcConvId, setCurrentNpcConvId] = useState(null);

  // Update conversation IDs when auto-saved
  useEffect(() => {
    if (rulesChat.conversationId && rulesChat.conversationId !== currentRulesConvId) {
      setCurrentRulesConvId(rulesChat.conversationId);
      loadConversationList();
    }
  }, [rulesChat.conversationId, currentRulesConvId, loadConversationList]);

  useEffect(() => {
    if (npcChat.conversationId && npcChat.conversationId !== currentNpcConvId) {
      setCurrentNpcConvId(npcChat.conversationId);
      loadConversationList();
    }
  }, [npcChat.conversationId, currentNpcConvId, loadConversationList]);

  // --------------- Data Fetching ---------------

  // Load conversations on mount
  useEffect(() => {
    if (user?.id) {
      loadConversationList();
    }
  }, [user?.id, loadConversationList]);

  // Update NPC chat when selected NPC changes
  useEffect(() => {
    if (selectedNpcId) {
      npcChat.setConversationId(undefined);
      npcChat.clearMessages("");
      setCurrentNpcConvId(null);
      loadConversationList();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNpcId]);

  // --------------- Auto-scroll ---------------
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rulesChat.messages, rulesChat.streaming]);

  useEffect(() => {
    if (npcScrollRef.current) {
      npcScrollRef.current.scrollTop = npcScrollRef.current.scrollHeight;
    }
  }, [npcChat.messages, npcChat.streaming]);

  // Auto-focus input after streaming ends
  useEffect(() => {
    if (!chat.streaming) {
      const ref = activeTab === "rules" ? inputRef : npcInputRef;
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      focusTimeoutRef.current = setTimeout(() => ref.current?.focus(), 100);
    }
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, [chat.streaming, activeTab]);

  // --------------- Conversation Management ---------------

  const createNewConversation = useCallback(async (type) => {
    const npcId = type === "npc" ? (selectedNpcId ? Number(selectedNpcId) : null) : null;
    const conv = await createConversation(type, npcId);
    if (conv) {
      if (type === "rules") {
        rulesChat.clearMessages("Hail! I am your D&D Rules Scholar. Ask me any question about spells, combat, actions, items, or general D&D rules, and I will search the library to help you.");
        rulesChat.setConversationId(conv.id);
        setCurrentRulesConvId(conv.id);
      } else {
        const npc = npcs.find((n) => n.id.toString() === selectedNpcId);
        npcChat.clearMessages(npc ? `You are now talking to ${npc.name}. Ask your questions, adventurer.` : "Select an NPC to start roleplaying.");
        npcChat.setConversationId(conv.id);
        setCurrentNpcConvId(conv.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedNpcId, npcs, rulesChat, npcChat, createConversation]);

  const handleDeleteConv = useCallback(async (convId, type) => {
    await deleteConversation(convId);
    if (type === "rules" && currentRulesConvId === convId) {
      rulesChat.clearMessages("Hail! I am your D&D Rules Scholar. Ask me any question about spells, combat, actions, items, or general D&D rules, and I will search the library to help you.");
      setCurrentRulesConvId(null);
    } else if (type === "npc" && currentNpcConvId === convId) {
      const npc = npcs.find((n) => n.id.toString() === selectedNpcId);
      npcChat.clearMessages(npc ? `You are now talking to ${npc.name}.` : "Select an NPC to start roleplaying.");
      setCurrentNpcConvId(null);
    }
  }, [npcs, selectedNpcId, rulesChat, npcChat, currentRulesConvId, currentNpcConvId, deleteConversation]);

  const handleLoadConversation = useCallback(async (conv) => {
    const full = await loadConversation(conv.id);
    if (!full) return;
    if (conv.type === "rules") {
      rulesChat.loadConversation(full);
      setCurrentRulesConvId(full.id);
    } else {
      npcChat.loadConversation(full);
      setCurrentNpcConvId(full.id);
      if (full.npcId) selectNpc(full.npcId.toString());
    }
  }, [rulesChat, npcChat, loadConversation, selectNpc]);

  const currentConvId = activeTab === "rules" ? currentRulesConvId : currentNpcConvId;

  // --------------- Submit handlers ---------------

  const handleRulesSubmit = (e) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim() || isStreaming) return;
    rulesChat.send(input.value, { conversationId: currentRulesConvId });
    input.value = "";
  };

  const handleNpcSubmit = (e) => {
    e.preventDefault();
    const input = npcInputRef.current;
    if (!input || !input.value.trim() || isStreaming || !selectedNpcId) return;
    npcChat.send(input.value, { conversationId: currentNpcConvId, npcId: Number(selectedNpcId) });
    input.value = "";
  };

  const handleQuickPrompt = (prompt) => {
    if (!rulesChat.streaming) {
      rulesChat.send(prompt, { conversationId: currentRulesConvId });
    }
  };

  // --------------- Model badge text ---------------
  const modelBadge = aiSettings
    ? `${aiSettings.provider || "?"}${aiSettings.model ? ` · ${aiSettings.model}` : ""}`
    : "";

  // --------------- Derived ---------------
  const filteredConvs = conversations.filter((c) => c.type === activeTab);

  const activeChat = activeTab === "rules" ? rulesChat : npcChat;
  const activeMessages = activeChat.messages;
  const isStreaming = activeChat.streaming;
  const activeError = activeChat.error;

  // --------------- Render ---------------
  return (
    <div style={styles.container} className="fade-in">
      {/* Tab Selector Nav */}
      <div style={styles.topSection}>
        <div style={styles.tabNav}>
          <button
            onClick={() => setActiveTab("rules")}
            style={{
              ...styles.tabBtn,
              background: activeTab === "rules" ? "var(--color-accent-dim)" : "rgba(255,255,255,0.02)",
              color: activeTab === "rules" ? "var(--color-accent)" : "var(--color-muted)",
              borderColor: activeTab === "rules" ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
            }}
            className="touch-target btn-hover-scale"
          >
            📜 Rules Scholar
          </button>
          <button
            onClick={() => setActiveTab("npc")}
            style={{
              ...styles.tabBtn,
              background: activeTab === "npc" ? "var(--color-accent-dim)" : "rgba(255,255,255,0.02)",
              color: activeTab === "npc" ? "var(--color-accent)" : "var(--color-muted)",
              borderColor: activeTab === "npc" ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
            }}
            className="touch-target btn-hover-scale"
          >
            🗣️ NPC Roleplay
          </button>
        </div>

        {/* Model Badge + Character Context Row */}
        <div style={styles.badgeRow}>
          {modelBadge && (
            <span style={styles.modelBadge} title="Active AI model/provider">
              <Sparkles size={11} /> {modelBadge}
            </span>
          )}
          {characters.length > 0 && (
            <span style={styles.charBadge} title="Character context active">
              <User size={11} /> {characters.find((c) => c.id.toString() === selectedCharId)?.name || "PC"}
            </span>
          )}
        </div>
      </div>

      {/* Rules Scholar View */}
      {activeTab === "rules" && (
        <div style={styles.viewBody}>
          {/* Conversation Header */}
          <div style={styles.headerRow}>
            <span style={styles.panelSubtitle}>
              {filteredConvs.length > 0
                ? `${filteredConvs.length} conversation${filteredConvs.length > 1 ? "s" : ""}`
                : "Ask about D&D rules, spells, or combat"}
            </span>
            <div style={styles.headerActions}>
              <button
                onClick={() => createNewConversation("rules")}
                style={styles.iconBtn}
                className="btn-hover-scale"
                title="New conversation"
                aria-label="New conversation"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Conversation Selector */}
          {filteredConvs.length > 1 && (
            <div style={styles.convSelector}>
              <select
                value={currentConvId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const conv = conversations.find((c) => c.id.toString() === val);
                  if (conv) handleLoadConversation(conv);
                }}
                style={styles.convSelect}
              >
                <option value="">-- Current conversation --</option>
                {filteredConvs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || `Conversation #${c.id}`}
                  </option>
                ))}
              </select>
              {currentConvId && (
                <button
                  onClick={() => handleDeleteConv(currentConvId, "rules")}
                  style={styles.deleteConvBtn}
                  className="btn-hover-scale"
                  title="Delete this conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={styles.scrollArea}>
            {activeMessages.length === 0 && (
              <p style={styles.emptyHint}>Send a message to start a conversation.</p>
            )}
            {activeMessages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || `${msg.role}-${idx}`}
                msg={msg}
                senderName={msg.role === "user" ? user?.username || "You" : "Rules Scholar"}
                onCopy={msg.text}
              />
            ))}
            {/* Loading indicator */}
            {isStreaming && activeMessages[activeMessages.length - 1]?.role !== "assistant" && (
              <div style={{ ...styles.bubble, alignSelf: "flex-start" }}>
                <div style={styles.bubbleHeader}>Rules Scholar</div>
                <AiStreamingIndicator text="Searching archives" />
              </div>
            )}
          </div>

          {/* Error Banner */}
          {activeError && (
            <div style={styles.errorBanner}>
              <span>{activeError}</span>
              <button onClick={() => rulesChat.retry()} style={styles.retryBtn} className="btn-hover-scale">
                <RotateCcw size={13} /> Retry
              </button>
            </div>
          )}

          {/* Quick Prompts */}
          {!isStreaming && activeMessages.length <= 2 && (
            <div style={styles.quickPrompts}>
              {RULES_QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleQuickPrompt(p)}
                  style={styles.quickChip}
                  className="btn-hover-scale"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleRulesSubmit} style={styles.formRow}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask a rule (e.g. 'How does grappling work?')"
              disabled={isStreaming}
              style={{ ...styles.input, opacity: isStreaming ? 0.6 : 1 }}
              className="form-input"
              maxLength={500}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={() => rulesChat.cancel()}
                style={styles.cancelBtn}
                className="touch-target btn-hover-scale"
                title="Cancel generation"
              >
                <X size={16} />
              </button>
            ) : (
              <button
                type="submit"
                style={styles.sendBtn}
                className="touch-target btn-hover-scale"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </form>
        </div>
      )}

      {/* NPC Roleplay View */}
      {activeTab === "npc" && (
        <div style={styles.viewBody}>
          {/* NPC Config + Conv Actions */}
          <div style={styles.npcHeaderConfig} className="glass-panel">
            <div style={styles.npcSelectCol}>
              <label style={styles.selectLabel}>Select NPC Persona</label>
              <select
                value={selectedNpcId}
                onChange={(e) => {
                  selectNpc(e.target.value);
                  const selected = npcs.find((n) => n.id.toString() === e.target.value);
                  if (selected) {
                    npcChat.clearMessages(`You are now talking to ${selected.name}. Ask your questions, adventurer.`);
                    setCurrentNpcConvId(null);
                  }
                }}
                style={styles.select}
              >
                {npcs.length === 0 && <option value="">No NPC templates found</option>}
                {npcs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} {n.race ? `(${n.race})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.npcHeaderActions}>
              <button
                onClick={() => createNewConversation("npc")}
                style={styles.iconBtn}
                className="btn-hover-scale"
                title="New conversation"
                aria-label="New conversation"
              >
                <Plus size={14} />
              </button>
              {currentNpcConvId && (
                <button
                  onClick={() => handleDeleteConv(currentNpcConvId, "npc")}
                  style={{ ...styles.iconBtn, color: "var(--color-danger)" }}
                  className="btn-hover-scale"
                  title="Delete conversation"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={npcScrollRef} style={styles.scrollArea}>
            {activeMessages.map((msg, idx) => {
              const selectedNpc = npcs.find((n) => n.id.toString() === selectedNpcId);
              const senderName = msg.role === "user" ? user?.username || "You" : (selectedNpc?.name || "NPC");
              const npcAvatar = msg.role === "assistant" && selectedNpc?.imageUrl ? selectedNpc.imageUrl : "";
              return (
                <div
                  key={msg.id || `${msg.role}-${idx}`}
                  style={{
                    ...styles.bubble,
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    background: msg.role === "user" ? "rgba(200, 151, 58, 0.1)" : "rgba(255, 255, 255, 0.04)",
                    borderColor: msg.role === "user" ? "rgba(200, 151, 58, 0.3)" : "rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <div style={styles.bubbleTopRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      {npcAvatar && (
                        <img
                          src={npcAvatar}
                          alt={senderName}
                          style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid var(--color-accent)", objectFit: "cover" }}
                        />
                      )}
                      <div style={styles.bubbleHeader}>{senderName}</div>
                    </div>
                    <div style={styles.bubbleTopRight}>
                      <span style={styles.timestamp}>{formatTime(msg.timestamp || msg.createdAt)}</span>
                      {msg.role === "assistant" && <CopyButton text={msg.text} />}
                    </div>
                  </div>
                  <div
                    className="wiki-content"
                    style={styles.bubbleText}
                    dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
                  />
                </div>
              );
            })}
            {isStreaming && activeMessages[activeMessages.length - 1]?.role !== "assistant" && (
              <div style={{ ...styles.bubble, alignSelf: "flex-start" }}>
                <div style={styles.bubbleHeader}>
                  {npcs.find((n) => n.id.toString() === selectedNpcId)?.name || "NPC"}
                </div>
                <AiStreamingIndicator text="NPC is thinking" />
              </div>
            )}
          </div>

          {/* Error Banner */}
          {activeError && (
            <div style={styles.errorBanner}>
              <span>{activeError}</span>
              <button onClick={() => npcChat.retry()} style={styles.retryBtn} className="btn-hover-scale">
                <RotateCcw size={13} /> Retry
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleNpcSubmit} style={styles.formRow}>
            <input
              ref={npcInputRef}
              type="text"
              placeholder={selectedNpcId ? `Talk to ${npcs.find((n) => n.id.toString() === selectedNpcId)?.name || "NPC"}...` : "Select an NPC template first"}
              disabled={!selectedNpcId || isStreaming}
              style={{ ...styles.input, opacity: !selectedNpcId || isStreaming ? 0.6 : 1 }}
              className="form-input"
              maxLength={500}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={() => npcChat.cancel()}
                style={styles.cancelBtn}
                className="touch-target btn-hover-scale"
                title="Cancel generation"
              >
                <X size={16} />
              </button>
            ) : (
              <button
                type="submit"
                style={styles.sendBtn}
                className="touch-target btn-hover-scale"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble Sub-component
// ---------------------------------------------------------------------------
function MessageBubble({ msg, senderName, onCopy }) {
  return (
    <div
      style={{
        ...styles.bubble,
        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
        background: msg.role === "user" ? "rgba(200, 151, 58, 0.1)" : "rgba(255, 255, 255, 0.04)",
        borderColor: msg.role === "user" ? "rgba(200, 151, 58, 0.3)" : "rgba(255, 255, 255, 0.06)",
      }}
    >
      <div style={styles.bubbleTopRow}>
        <div style={styles.bubbleHeader}>{senderName}</div>
        <div style={styles.bubbleTopRight}>
          <span style={styles.timestamp}>{formatTime(msg.timestamp || msg.createdAt)}</span>
          {msg.role === "assistant" && <CopyButton text={onCopy} />}
        </div>
      </div>
      <div
        className="wiki-content"
        style={styles.bubbleText}
        dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "0.5rem 0.75rem",
    gap: "0.4rem",
    background: "var(--color-bg)",
  },
  topSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    flexShrink: 0,
  },
  tabNav: {
    display: "flex",
    gap: "0.4rem",
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: "0.5rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: "6px",
    fontSize: "0.85rem",
    fontWeight: "600",
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.2s",
  },
  badgeRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap",
    padding: "0.1rem 0.15rem",
  },
  modelBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.65rem",
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    borderRadius: "999px",
    padding: "0.1rem 0.5rem",
    whiteSpace: "nowrap",
  },
  charBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "999px",
    padding: "0.1rem 0.5rem",
    whiteSpace: "nowrap",
  },
  viewBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    overflow: "hidden",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.1rem 0.25rem",
    flexShrink: 0,
  },
  panelSubtitle: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
  },
  headerActions: {
    display: "flex",
    gap: "0.3rem",
    alignItems: "center",
  },
  iconBtn: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    padding: "0.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    minHeight: 28,
  },
  convSelector: {
    display: "flex",
    gap: "0.3rem",
    alignItems: "center",
    flexShrink: 0,
  },
  convSelect: {
    flex: 1,
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--color-text)",
    padding: "0.3rem 0.4rem",
    fontSize: "0.75rem",
    outline: "none",
  },
  deleteConvBtn: {
    background: "rgba(255,50,50,0.08)",
    border: "1px solid rgba(255,50,50,0.2)",
    borderRadius: "4px",
    color: "var(--color-danger)",
    cursor: "pointer",
    padding: "0.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    minHeight: 28,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "0.25rem",
    background: "rgba(0, 0, 0, 0.15)",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.02)",
  },
  emptyHint: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.8rem",
    padding: "2rem 0.5rem",
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    padding: "0.45rem 0.7rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
  },
  bubbleTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.1rem",
  },
  bubbleTopRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  bubbleHeader: {
    fontSize: "0.7rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
  },
  timestamp: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    opacity: 0.7,
  },
  bubbleText: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
    lineHeight: 1.45,
  },
  loadingPlaceholder: {
    fontSize: "0.8rem",
    fontStyle: "italic",
    color: "var(--color-muted)",
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    background: "rgba(255,50,50,0.08)",
    border: "1px solid rgba(255,50,50,0.2)",
    borderRadius: "6px",
    padding: "0.4rem 0.6rem",
    fontSize: "0.75rem",
    color: "var(--color-danger)",
    flexShrink: 0,
  },
  retryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "4px",
    padding: "0.2rem 0.5rem",
    fontSize: "0.7rem",
    color: "var(--color-text)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  quickPrompts: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.3rem",
    flexShrink: 0,
  },
  quickChip: {
    background: "rgba(200, 151, 58, 0.06)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    borderRadius: "999px",
    padding: "0.25rem 0.6rem",
    fontSize: "0.7rem",
    color: "var(--color-accent)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },
  copyBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.15rem",
    borderRadius: "3px",
    transition: "all 0.2s",
    opacity: 0.6,
  },
  npcHeaderConfig: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    padding: "0.5rem 0.65rem",
    borderRadius: "8px",
    gap: "0.75rem",
    flexShrink: 0,
  },
  npcSelectCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  npcHeaderActions: {
    display: "flex",
    gap: "0.25rem",
    alignItems: "center",
    paddingBottom: "0.1rem",
  },
  selectLabel: {
    fontSize: "0.6rem",
    textTransform: "uppercase",
    fontWeight: "bold",
    color: "var(--color-accent)",
    letterSpacing: "0.03em",
  },
  select: {
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "6px",
    color: "var(--color-text)",
    padding: "0.4rem",
    fontSize: "0.8rem",
    outline: "none",
    width: "100%",
  },
  formRow: {
    display: "flex",
    gap: "0.4rem",
    flexShrink: 0,
    paddingTop: "0.15rem",
  },
  input: {
    flex: 1,
    padding: "0.65rem 0.95rem",
    fontSize: "0.9rem",
    borderRadius: "6px",
    border: "1px solid rgba(200,151,58,0.2)",
    background: "rgba(0,0,0,0.3)",
    color: "var(--color-text)",
    outline: "none",
  },
  sendBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: "6px",
    border: "none",
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    color: "var(--color-bg)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.2s",
  },
  cancelBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: "6px",
    border: "1px solid rgba(255,50,50,0.3)",
    background: "rgba(255,50,50,0.1)",
    color: "var(--color-danger)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
};
