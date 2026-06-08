// =============================================================================
// Tablecast — AiChatView
// Reusable AI chat interface for Rules Scholar and NPC Roleplay conversations.
// Uses the same useAiChat hook as AiPanel but in a focused chat view.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send, User, Sparkles } from "lucide-react";
import { useAiChat } from "../hooks/useAiChat";
import { useSocket } from "../context/SocketContext";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Copy, Check } from "lucide-react";

marked.setOptions({ gfm: true, breaks: true });

function compileMarkdown(text) {
  if (!text) return "";
  try {
    return DOMPurify.sanitize(marked.parse(text));
  } catch (e) {
    console.error("[AiChatView] Markdown failed:", e);
    return text;
  }
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button onClick={handleCopy} style={styles.copyBtn} className="btn-hover-scale" title="Copy">
      {copied ? <Check size={13} color="var(--color-success)" /> : <Copy size={13} />}
    </button>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Chat bubble for AI chat messages
// ---------------------------------------------------------------------------
function ChatBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="chat-bubble-wrapper msg-enter"
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "82%",
        wordWrap: "break-word",
        overflowWrap: "break-word",
        marginBottom: "0.3rem",
      }}
    >
      <div
        style={{
          background: isUser ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
          color: isUser ? "var(--color-bg)" : "var(--color-text)",
          borderRadius: isUser ? "1rem 1rem 0.35rem 1rem" : "1rem 1rem 1rem 0.35rem",
          padding: "0.5rem 0.85rem",
          position: "relative",
          fontSize: "0.9rem",
          lineHeight: 1.45,
        }}
      >
        {/* Sender label */}
        <div style={{ fontSize: "0.65rem", fontWeight: 700, color: isUser ? "rgba(15,14,23,0.5)" : "var(--color-accent)", marginBottom: "0.15rem" }}>
          {isUser ? "You" : "Scholar"}
        </div>

        {/* Message content */}
        <div
          className="wiki-content"
          style={{ color: "inherit" }}
          dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
        />

        {/* Timestamp + copy */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.3rem", marginTop: "0.2rem" }}>
          <span style={{ fontSize: "0.6rem", color: isUser ? "rgba(15,14,23,0.4)" : "var(--color-muted)" }}>
            {formatTime(msg.createdAt || msg.timestamp)}
          </span>
          {!isUser && <CopyButton text={msg.text} />}
        </div>

        {/* Tail */}
        <div
          className="bubble-tail"
          style={{
            [isUser ? "right" : "left"]: "-7px",
            [isUser ? "borderLeftColor" : "borderRightColor"]: isUser ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
            [isUser ? "borderRight" : "borderLeft"]: 0,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick action chips for Rules Scholar
// ---------------------------------------------------------------------------
const RULES_QUICK_PROMPTS = [
  "How does grappling work?",
  "Explain concentration saves",
  "What are the action economy rules?",
  "Tell me about the Fireball spell",
];

function QuickChips({ onSelect, visible }) {
  if (!visible) return null;
  return (
    <div style={styles.chipsContainer}>
      <p style={styles.chipsLabel}>Try asking:</p>
      <div style={styles.chipsRow}>
        {RULES_QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            style={styles.chip}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main AiChatView Component
// =============================================================================
export default function AiChatView({
  user,
  type,           // "rules" | "npc"
  npcId,          // for NPC roleplay
  conversationId, // optional existing conversation ID
  npcData,        // NPC object { name, imageUrl, ... }
  onBack,
}) {
  const { isConnected } = useSocket();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [draft, setDraft] = useState("");

  const isRules = type === "rules";

  const chat = useAiChat({
    user,
    initialMessage: isRules
      ? "Hail! I am your D&D Rules Scholar. Ask me any question about spells, combat, actions, items, or general D&D rules, and I will search the library to help you."
      : undefined,
    npcId: isRules ? undefined : npcId,
    conversationId,
  });

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length]);

  // Send message
  function handleSend(e) {
    e.preventDefault();
    if (!draft.trim() || chat.streaming) return;
    chat.send(draft.trim());
    setDraft("");
  }

  // Quick chip select
  function handleChip(text) {
    chat.send(text);
  }

  // Header title
  const headerTitle = isRules
    ? "Rules Scholar"
    : npcData?.name || `NPC Chat`;

  const headerAvatar = isRules ? (
    <div style={styles.headerAvatar}>
      <Sparkles size={18} />
    </div>
  ) : npcData?.imageUrl ? (
    <img src={npcData.imageUrl} alt="" style={styles.headerAvatarImg} />
  ) : (
    <div style={styles.headerAvatar}>
      <User size={18} />
    </div>
  );

  // Determine if we should show quick chips
  const showChips = isRules && chat.messages.length <= 1 && !chat.streaming;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backBtn} className="touch-target" type="button" aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        {headerAvatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.headerTitle}>{headerTitle}</div>
          <div style={styles.headerSub}>
            {isRules ? "Rules Scholar" : npcData?.race ? `${npcData.race} ${npcData.class}` : "NPC Roleplay"}
            <span
              style={{
                ...styles.miniDot,
                background: isConnected ? "var(--color-success)" : "var(--color-danger)",
                display: "inline-block",
                marginLeft: "0.4rem",
              }}
            />
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} style={styles.messages}>
        {chat.messages.map((msg, i) => (
          <ChatBubble key={i} msg={msg} />
        ))}

        {/* Loading / streaming indicator */}
        {chat.streaming && !chat.messages[chat.messages.length - 1]?.text && (
          <div style={{ display: "flex", gap: "0.3rem", padding: "0.5rem 0.75rem", alignSelf: "flex-start", background: "rgba(255,255,255,0.06)", borderRadius: "1rem" }}>
            <span className="typing-dot" />
            <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
            <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
          </div>
        )}

        {/* Quick chips */}
        <QuickChips onSelect={handleChip} visible={showChips} />
      </div>

      {/* Error display */}
      {chat.error && (
        <div style={styles.errorBar}>
          <span>{chat.error}</span>
          {chat.messages.length > 1 && (
            <button onClick={chat.retry} style={styles.retryBtn} type="button">Retry</button>
          )}
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={handleSend} className="chat-input-bar" style={{ borderTop: "1px solid rgba(200,151,58,0.1)" }}>
        <div className="chat-input-pill">
          <input
            ref={inputRef}
            type="text"
            className="chat-input-field"
            placeholder={isRules ? "Ask a D&D rules question..." : "Speak to the NPC..."}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!draft.trim() || chat.streaming}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

// ===========================================================================
// Styles
// ===========================================================================
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "linear-gradient(135deg, var(--color-bg) 0%, var(--color-surface) 100%)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.6rem 0.75rem",
    borderBottom: "1px solid rgba(200,151,58,0.12)",
    background: "rgba(0,0,0,0.2)",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-accent)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "var(--color-accent-dim)",
    border: "1px solid var(--color-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-accent)",
    flexShrink: 0,
    overflow: "hidden",
  },
  headerAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    objectFit: "cover",
  },
  headerTitle: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "var(--color-text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  headerSub: {
    fontSize: "0.68rem",
    color: "var(--color-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    verticalAlign: "middle",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
  },
  copyBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.15rem",
    borderRadius: "4px",
  },
  chipsContainer: {
    marginTop: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    alignItems: "center",
  },
  chipsLabel: {
    fontSize: "0.72rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  chipsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem",
    justifyContent: "center",
  },
  chip: {
    padding: "0.35rem 0.65rem",
    borderRadius: "999px",
    border: "1px solid rgba(200,151,58,0.15)",
    background: "rgba(200,151,58,0.06)",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 600,
    transition: "background 0.12s ease",
  },
  errorBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "0.4rem 0.75rem",
    background: "rgba(235,87,87,0.08)",
    borderTop: "1px solid rgba(235,87,87,0.2)",
    color: "var(--color-danger)",
    fontSize: "0.75rem",
    flexShrink: 0,
  },
  retryBtn: {
    background: "rgba(235,87,87,0.15)",
    border: "1px solid rgba(235,87,87,0.3)",
    borderRadius: "4px",
    color: "var(--color-danger)",
    padding: "0.25rem 0.5rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
};
