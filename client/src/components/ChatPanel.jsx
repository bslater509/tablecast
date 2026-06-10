// =============================================================================
// Tablecast — WhatsApp-style Chat Panel
// Full-featured session chat with message ownership bubbles, grouping,
// date separators, status indicators, emoji picker, and smooth animations.
// =============================================================================
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Sparkles, Copy, Check, Send, Plus, Smile, ChevronDown } from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useDiceBox } from "../context/DiceBoxContext";
import { ChatPanelSkeleton } from "./PanelSkeleton";
import { compileMarkdown } from "../utils/markdown";
import AiStreamingIndicator from "./AiStreamingIndicator";
import { isOwnMessage } from "../utils/authHeaders";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupMessages(messages, user) {
  const groups = [];
  let currentGroup = null;

  for (const msg of messages) {
    const isSystem = msg.type === "system" && msg.sender === "System";
    const isMine = !isSystem && isOwnMessage(msg, user);
    const sender = msg.sender || "Unknown";
    const msgTime = Number(msg.timestamp) || 0;

    const shouldStartNew =
      !currentGroup ||
      currentGroup.isSystem !== isSystem ||
      currentGroup.sender !== sender ||
      msgTime - currentGroup.lastTimestamp > 120000;

    if (shouldStartNew) {
      currentGroup = {
        id: genGroupId(),
        messages: [],
        sender,
        isMine,
        isSystem,
        lastTimestamp: msgTime,
      };
      groups.push(currentGroup);
    }

    currentGroup.messages.push(msg);
    currentGroup.lastTimestamp = msgTime;
  }

  return groups;
}

let groupIdCounter = 0;
function genGroupId() {
  return `grp_${Date.now()}_${++groupIdCounter}`;
}

const SENDER_COLORS = [
  "#c8973a", "#6fcf97", "#56ccf2", "#eb5757",
  "#bb6bd9", "#f2994a", "#27ae60", "#2d9cdb",
  "#f2c94c", "#9b51e0", "#219653", "#e8636b",
];

function getSenderColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

function getSenderInitial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

function parseDiceNotation(text) {
  const clean = text.replace(/^\/(roll|r)\s+/i, "").trim();
  const regex = /^(\d+)?d(\d+)(?:\s*([+-])\s*(\d+))?$/i;
  const match = clean.match(regex);
  if (!match) return null;
  const qty = match[1] ? parseInt(match[1]) : 1;
  const sides = parseInt(match[2]);
  const sign = match[3] || "+";
  const modifierVal = match[4] ? parseInt(match[4]) : 0;
  const modifier = sign === "-" ? -modifierVal : modifierVal;
  return { qty, sides, modifier };
}

function formatTime(timestamp) {
  return new Date(Number(timestamp)).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(timestamp) {
  const date = new Date(Number(timestamp));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function getDateKey(timestamp) {
  const d = new Date(Number(timestamp));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function mergeMessages(...messageLists) {
  const byId = new Map();
  for (const list of messageLists) {
    for (const msg of list) {
      if (msg?.id) byId.set(msg.id, msg);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = Number(a.timestamp) || 0;
    const bTime = Number(b.timestamp) || 0;
    return aTime - bTime;
  });
}

let tempIdCounter = 0;
function genTempId() {
  return `tmp_${Date.now()}_${++tempIdCounter}`;
}

// ---------------------------------------------------------------------------
// EMOJI PICKER
// ---------------------------------------------------------------------------
const EMOJI_LIST = [
  "😀","😂","🤣","😊","😎","🤩","😢","😱",
  "🔥","⭐","👍","🎉","❤️","💀","👋","💪",
  "🎲","⚔️","🛡️","🧙","🐉","📖","💬","🗡️",
  "🏹","🪄","💎","👑","🍺","🏰","🌲","✨",
];

function EmojiPicker({ onSelect, visible }) {
  if (!visible) return null;
  return (
    <div className="emoji-picker fade-in">
      {EMOJI_LIST.map((emoji) => (
        <button
          key={emoji}
          className="emoji-picker-btn"
          onClick={() => onSelect(emoji)}
          type="button"
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COPY BUTTON (for AI messages)
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
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);
  return (
    <button
      onClick={handleCopy}
      style={{
        background: "transparent",
        border: "none",
        color: copied ? "var(--color-success)" : "var(--color-muted)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.2rem",
        borderRadius: "4px",
        transition: "color 0.2s",
      }}
      className="btn-hover-scale"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// DATE SEPARATOR
// ---------------------------------------------------------------------------
function DateSeparator({ timestamp }) {
  return (
    <div className="date-separator">
      <span className="date-separator-inner">{formatDateLabel(timestamp)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MESSAGE BUBBLE — Renders a single chat message with WhatsApp-style layout
// ---------------------------------------------------------------------------
function MessageBubble({ msg, isMine, isGroupStart, isGroupEnd, status, npcs }) {
  const msgTime = formatTime(msg.timestamp);
  const isRoll = msg.type === "roll" && msg.rollDetails;
  const isAi = msg.sender === "D&D AI Assistant";
  const isNpc = msg.type === "npc";
  const isSystem = msg.type === "system" && msg.sender === "System";
  const isPlain = !isRoll && !isAi && !isNpc && !isSystem;

  // System messages: centered, no bubble
  if (isSystem) {
    return (
      <div
        className="msg-enter"
        style={{
          display: "flex",
          justifyContent: "center",
          margin: "0.4rem 0",
        }}
      >
        <span
          style={{
            fontSize: "0.72rem",
            color: "var(--color-muted)",
            fontStyle: "italic",
            textAlign: "center",
            background: "rgba(200,151,58,0.06)",
            padding: "0.2rem 0.8rem",
            borderRadius: "999px",
            maxWidth: "85%",
          }}
        >
          {msg.text}
        </span>
      </div>
    );
  }

  // Bubble color
  const bgColor = isMine ? "var(--color-accent)" : "rgba(255,255,255,0.06)";
  const textColor = isMine ? "var(--color-bg)" : "var(--color-text)";

  // —— Plain text bubble ——
  if (isPlain) {
    return (
      <div
        className={`chat-bubble-wrapper ${isMine ? "mine" : "theirs"} msg-enter`}
        style={{
          "--bubble-bg": bgColor,
          background: bgColor,
          color: textColor,
          borderRadius: "1rem",
          padding: "0.45rem 0.85rem",
          marginBottom: isGroupEnd ? "0.15rem" : "0.08rem",
          borderBottomLeftRadius: isMine ? "1rem" : isGroupEnd ? "0.35rem" : "0.35rem",
          borderBottomRightRadius: !isMine ? "1rem" : isGroupEnd ? "0.35rem" : "0.35rem",
        }}
      >
        {/* Sender name for theirs (only on first msg of group) */}
        {!isMine && isGroupStart && (
          <div
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              color: getSenderColor(msg.sender),
              marginBottom: "0.15rem",
            }}
          >
            {msg.sender}
          </div>
        )}

        {/* Message text — mine: plain text | theirs: markdown */}
        {isMine ? (
          <div
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.4,
              color: textColor,
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.text}
          </div>
        ) : (
          <div
            className="wiki-content"
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.4,
              color: textColor,
            }}
            dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
          />
        )}

        {/* Timestamp + status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.2rem",
            marginTop: "0.15rem",
          }}
        >
          <span
            style={{
              fontSize: "0.6rem",
              color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)",
              lineHeight: 1,
            }}
          >
            {msgTime}
          </span>
          {isMine && status && (
            <span
              style={{
                fontSize: "0.6rem",
                lineHeight: 1,
                color: status === "failed" ? "var(--color-danger)" : status === "sent" ? (isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)") : "var(--color-muted)",
              }}
            >
              {status === "failed" ? "⚠️" : status === "sent" ? "✓✓" : "✓"}
            </span>
          )}
        </div>

        {/* Tail */}
        <div className="bubble-tail" />
      </div>
    );
  }

  // —— Roll card ——
  if (isRoll) {
    const rd = msg.rollDetails;
    return (
      <div
        className={`chat-bubble-wrapper ${isMine ? "mine" : "theirs"} msg-enter`}
        style={{
          "--bubble-bg": bgColor,
          background: bgColor,
          color: textColor,
          borderRadius: "1rem",
          padding: "0.6rem 0.85rem",
          marginBottom: "0.15rem",
        }}
      >
        {/* Sender name for theirs */}
        {!isMine && isGroupStart && (
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: getSenderColor(msg.sender), marginBottom: "0.2rem" }}>
            {msg.sender}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(200,151,58,0.15)", paddingBottom: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "1rem" }}>{rd.isAttack ? "⚔️" : "🎲"}</span>
            <span style={{ fontSize: "0.85rem", fontWeight: "bold", color: isMine ? textColor : "var(--color-accent)" }}>
              {rd.rollName}
            </span>
          </div>
          <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
            {msgTime}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.7rem", marginTop: "0.2rem" }}>
          <span style={{ fontWeight: 700, color: isMine ? textColor : "var(--color-accent)" }}>
            {msg.sender}
          </span>
          <span style={{ fontFamily: "monospace", color: isMine ? "rgba(15,14,23,0.6)" : "var(--color-muted)" }}>
            {rd.formula}
          </span>
        </div>

        {rd.status === "rolling" ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0", background: "rgba(0,0,0,0.1)", borderRadius: "6px", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "1rem", fontStyle: "italic", color: isMine ? textColor : "var(--color-accent)" }} className="text-pulse">
              🎲 Rolling...
            </span>
          </div>
        ) : rd.isAttack ? (
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "0.4rem 0", background: "rgba(0,0,0,0.1)", borderRadius: "6px", marginTop: "0.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "0.55rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                To Hit
              </span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.2, color: isMine ? textColor : "var(--color-accent)" }}>
                {rd.toHitTotal}
              </span>
              <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
                1d20({rd.toHitRoll}) {rd.toHitMod >= 0 ? `+` : ``}{rd.toHitMod}
              </span>
            </div>
            <div style={{ width: "1px", height: "36px", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "0.55rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                Damage
              </span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.2, color: isMine ? textColor : "var(--color-danger)" }}>
                {rd.damageTotal}
              </span>
              <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
                {rd.damageDice}({rd.damageRolls.join("+")}) {rd.damageMod >= 0 ? `+` : ``}{rd.damageMod}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0", background: "rgba(0,0,0,0.1)", borderRadius: "6px", marginTop: "0.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.2, color: isMine ? textColor : "var(--color-accent)" }}>
                {rd.total}
              </span>
              <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
                Rolled: {rd.rolls.join(", ")} {rd.modifier >= 0 ? `+` : ``}{rd.modifier}
              </span>
            </div>
          </div>
        )}

        {/* Tail */}
        <div className="bubble-tail" />
      </div>
    );
  }

  // —— AI message ——
  if (isAi) {
    return (
      <div
        className={`chat-bubble-wrapper theirs msg-enter`}
        style={{
          "--bubble-bg": "rgba(200,151,58,0.07)",
          background: "rgba(200,151,58,0.07)",
          color: "var(--color-text)",
          border: "1px solid rgba(200,151,58,0.25)",
          borderRadius: "1rem",
          padding: "0.65rem 0.85rem",
          marginBottom: "0.15rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(200,151,58,0.12)", paddingBottom: "0.25rem", marginBottom: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
            <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--color-accent)" }}>
              D&D AI Scholar
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.6rem", color: "var(--color-muted)" }}>{msgTime}</span>
            <CopyButton text={msg.text} />
          </div>
        </div>
        <div
          className="wiki-content"
          style={{ fontSize: "0.9rem", color: "var(--color-text)", lineHeight: 1.45 }}
          dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
        />
        {msg.text === "_Thinking…" && (
          <AiStreamingIndicator text="Thinking" />
        )}
        <div className="bubble-tail" />
      </div>
    );
  }

  // —— NPC message ——
  if (isNpc) {
    const matchedNpc = npcs?.find((n) => n.name.toLowerCase() === msg.sender.toLowerCase());
    const npcAvatar = matchedNpc?.imageUrl || matchedNpc?.largeImageUrl || "";
    return (
      <div
        className={`chat-bubble-wrapper theirs msg-enter`}
        style={{
          "--bubble-bg": "rgba(245,235,215,0.04)",
          background: "rgba(245,235,215,0.04)",
          color: "var(--color-text)",
          borderLeft: "4px solid var(--color-accent)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          borderRadius: "0.35rem 1rem 1rem 0.35rem",
          padding: "0.65rem 0.85rem",
          marginBottom: "0.15rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.25rem", marginBottom: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {npcAvatar ? (
              <img src={npcAvatar} alt={msg.sender} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--color-accent)" }} />
            ) : (
              <span style={{ fontSize: "0.9rem" }}>🗣️</span>
            )}
            <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--color-accent)", fontFamily: "Georgia, serif" }}>
              {msg.sender}
            </span>
          </div>
          <span style={{ fontSize: "0.6rem", color: "var(--color-muted)" }}>{msgTime}</span>
        </div>
        <div
          className="wiki-content"
          style={{ fontSize: "0.9rem", color: "var(--color-text)", fontFamily: "Georgia, serif", fontStyle: "italic", lineHeight: 1.5 }}
          dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
        />
        <div className="bubble-tail" />
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// TYPING INDICATOR - WhatsApp-style animated dots
// ---------------------------------------------------------------------------
function TypingIndicator({ user }) {
  if (!user) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "0.4rem",
        padding: "0.2rem 0",
        marginTop: "0.15rem",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          borderRadius: "1rem 1rem 1rem 0.35rem",
          padding: "0.5rem 0.75rem",
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
        }}
      >
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
        <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
      </div>
      <span style={{ fontSize: "0.68rem", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
        {user}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCROLL-TO-BOTTOM FAB
// ---------------------------------------------------------------------------
function ScrollToBottomFAB({ onClick, count }) {
  return (
    <button className="scroll-fab fade-in" onClick={onClick} type="button" aria-label="Scroll to bottom">
      <ChevronDown size={20} />
      {count > 0 && <span className="scroll-fab-badge">{count > 9 ? "9+" : count}</span>}
    </button>
  );
}

// ===========================================================================
// MAIN CHATPANEL COMPONENT
// ===========================================================================
export default function ChatPanel({ user, isPopout = false }) {
  const { socket, isConnected, reconnectCount } = useSocket();
  const { rollDice } = useDiceBox();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [username, setUsername] = useState(user?.username || "");
  const [hasSetName, setHasSetName] = useState(!!user);
  const [typingUser, setTypingUser] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [npcs, setNpcs] = useState([]);
  const [messageStatus, setMessageStatus] = useState({}); // { msgId: 'sending' | 'sent' }
  const [oldestMsgId, setOldestMsgId] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const scrollRef = useRef(null);
  const typingTimeout = useRef(null);
  const pendingAcksRef = useRef({});
  const initialLoadRef = useRef(true);
  const inputRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }
    };
  }, []);

  // Fetch NPCs for avatar matching
  useEffect(() => {
    let cancelled = false;
    async function fetchNpcs() {
      try {
        const res = await fetch("/api/npcs");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setNpcs(data);
        }
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch NPCs in ChatPanel:", err);
      }
    }
    fetchNpcs();
    return () => { cancelled = true; };
  }, []);

  // Sync user prop
  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setHasSetName(true);
    }
  }, [user]);

  // Load message history
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const res = await fetch("/api/chat?limit=150");
        if (!res.ok) throw new Error("Failed to load chat history");
        const data = await res.json();
        if (!cancelled) {
          setHasMore(data.length >= 150);
          if (data.length > 0) setOldestMsgId(data[0].id);
          setMessages((prev) => mergeMessages(data, prev));
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, []);

  const loadEarlierMessages = useCallback(async () => {
    if (!oldestMsgId || loadingMoreRef.current || !hasMore) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/chat?limit=150&before=${oldestMsgId}`);
      if (!res.ok) throw new Error("Failed to load earlier chat messages");
      const data = await res.json();
      setMessages((prev) => mergeMessages(data, prev));
      if (data.length > 0) setOldestMsgId(data[0].id);
      setHasMore(data.length >= 150);
    } catch (err) {
      console.error("Failed to load earlier chat messages:", err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, oldestMsgId]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    function onMessage(msg) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return mergeMessages(prev, [msg]);
      });
    }

    function onMessageUpdate(update) {
      setMessages((prev) =>
        prev.map((m) => (m.id === update.id ? { ...m, text: update.text } : m))
      );
    }

    function onTyping(payload) {
      setTypingUser(payload.sender);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTypingUser(null), 2000);
    }

    socket.on("chat:message", onMessage);
    socket.on("chat:message:update", onMessageUpdate);
    socket.on("chat:typing", onTyping);

    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:message:update", onMessageUpdate);
      socket.off("chat:typing", onTyping);
    };
  }, [socket]);

  // Socket reconnect resync — refetch recent chat messages
  useEffect(() => {
    if (!reconnectCount) return;
    let cancelled = false;
    async function resync() {
      try {
        const res = await fetch("/api/chat?limit=50");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setMessages((prev) => mergeMessages(data, prev));
        }
      } catch (err) {
        console.error("[ChatPanel] Resync failed:", err);
      }
    }
    resync();
    return () => { cancelled = true; };
  }, [reconnectCount]);

  // Auto-scroll + unread counting
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      el.scrollTop = el.scrollHeight;
      return;
    }

    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      setUnreadCount((prev) => prev + 1);
    }
  }, [messages.length, messages[messages.length - 1]?.text?.length]);

  // Scroll handler
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsNearBottom(nearBottom);
    if (nearBottom) setUnreadCount(0);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnreadCount(0);
    setIsNearBottom(true);
  }, []);

  // Group messages
  const groupedMessages = useMemo(() => groupMessages(messages, user), [messages, user]);

  // Send message
  async function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !socket || !isConnected) return;

    const text = draft.trim();

    // —— Dice roll handling ——
    if (text.startsWith("/roll ") || text.startsWith("/r ") || /^\/roll$/i.test(text) || /^\/r$/i.test(text)) {
      const parsedText = /^\/roll$/i.test(text) || /^\/r$/i.test(text) ? "/roll 1d20" : text;
      const parsed = parseDiceNotation(parsedText);
      if (parsed) {
        const { qty, sides, modifier } = parsed;
        const modSign = modifier >= 0 ? "+" : "";
        const formattedModifier = modifier !== 0 ? ` ${modSign} ${Math.abs(modifier)}` : "";

        let allRolls = [];
        let rollSum = 0;
        try {
          const result = await rollDice([`${qty}d${sides}`], {
            theme: user?.diceTheme || "default",
            color: user?.diceColor || "#7c3aed",
          });
          allRolls = result.allRolls;
          rollSum = result.total;
        } catch (err) {
          console.error("[ChatPanel] rollDice failed:", err);
          return;
        }

        const total = rollSum + modifier;
        const tempId = genTempId();
        const optimisticMsg = {
          id: tempId,
          userId: user?.id,
          sender: username || "Anonymous",
          text: `rolled ${qty}d${sides}${formattedModifier}! Total: ${total}`,
          timestamp: Date.now(),
          type: "roll",
          rollDetails: {
            rollName: "Chat Roll",
            formula: `${qty}d${sides}${modifier !== 0 ? (modifier > 0 ? " + " + modifier : " - " + Math.abs(modifier)) : ""}`,
            rolls: allRolls,
            modifier: modifier,
            total: total,
            isAttack: false,
            status: "rolled",
            diceTheme: user?.diceTheme || "default",
            diceColor: user?.diceColor || "#7c3aed",
          },
        };
        setMessages((prev) => [...prev, optimisticMsg]);
        setMessageStatus((prev) => ({ ...prev, [tempId]: "sending" }));
        setDraft("");

        const ackTimeout = setTimeout(() => {
          setMessageStatus(prev => prev[tempId] === "sending" ? { ...prev, [tempId]: "failed" } : prev);
        }, 10000);

        socket.emit("chat:send", {
          userId: user?.id,
          sender: username || "Anonymous",
          text: `rolled ${qty}d${sides}${formattedModifier}! Total: ${total}`,
          type: "roll",
          rollDetails: optimisticMsg.rollDetails,
        }, (ack) => {
          clearTimeout(ackTimeout);
          setMessageStatus((prev) => {
            const next = { ...prev };
            delete next[tempId];
            next[ack.id] = "sent";
            return next;
          });
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: ack.id } : m)));
        });
        return;
      }
    }

    // —— Plain text message ——
    const tempId = genTempId();
    const optimisticMsg = {
      id: tempId,
      userId: user?.id,
      sender: username || "Anonymous",
      text,
      timestamp: Date.now(),
      type: "user",
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setMessageStatus((prev) => ({ ...prev, [tempId]: "sending" }));
    setDraft("");
    setShowEmoji(false);

    const ackTimeout = setTimeout(() => {
      setMessageStatus(prev => prev[tempId] === "sending" ? { ...prev, [tempId]: "failed" } : prev);
    }, 10000);

    socket.emit("chat:send", { userId: user?.id, sender: username || "Anonymous", text }, (ack) => {
      clearTimeout(ackTimeout);
      setMessageStatus((prev) => {
        const next = { ...prev };
        delete next[tempId];
        next[ack.id] = "sent";
        return next;
      });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: ack.id } : m)));
    });
  }

  // Typing indicator
  function handleInputChange(e) {
    setDraft(e.target.value);
    if (socket && hasSetName && e.target.value.trim()) {
      socket.emit("chat:typing", { sender: username || "Anonymous" });
    }
  }

  // Emoji select
  function handleEmojiSelect(emoji) {
    setDraft((prev) => prev + emoji);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }

  // Handle key events for quick send
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  }

  // ---- Name entry screen (for anonymous users) ----
  if (!hasSetName) {
    return (
      <div style={styles.nameOverlay}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) setHasSetName(true);
          }}
          style={styles.nameForm}
        >
          <h2 style={styles.nameTitle}>🏰 Enter the Tavern</h2>
          <p style={styles.nameSub}>Choose a name for the chat</p>
          <input
            id="username-input"
            type="text"
            placeholder="Your character name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.nameInput}
            autoFocus
            maxLength={24}
          />
          <button
            id="join-chat-btn"
            type="submit"
            style={{
              ...styles.nameBtn,
              opacity: username.trim() ? 1 : 0.4,
            }}
            disabled={!username.trim()}
          >
            Join Session
          </button>
        </form>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div
        style={{
          ...styles.wrapper,
          height: isPopout ? "100vh" : "100%",
          maxHeight: isPopout ? "100dvh" : "100%",
        }}
      >
        <ChatPanelSkeleton />
      </div>
    );
  }

  // ---- Chat UI ----
  return (
    <div
      style={{
        ...styles.wrapper,
        height: isPopout ? "100vh" : "100%",
        maxHeight: isPopout ? "100dvh" : "100%",
      }}
    >
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>💬 Tablecast</h1>
          <span style={styles.badge}>{username}</span>
          {!isPopout && user?.role === "DM" && (
            <button
              onClick={() =>
                window.open(
                  "/#/dm/popout/chat",
                  "_blank",
                  "width=600,height=800,resizable=yes,scrollbars=yes"
                )
              }
              style={{
                background: "none",
                border: "none",
                color: "var(--color-accent)",
                fontSize: "1.15rem",
                cursor: "pointer",
                marginLeft: "0.65rem",
                display: "inline-flex",
                alignItems: "center",
                padding: 0,
              }}
              className="touch-target btn-hover-scale"
              title="Pop out Chat"
              aria-label="Pop out Chat"
            >
              {/* External link icon as SVG */}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}
        </div>
        <span
          id="connection-status"
          style={{
            ...styles.dot,
            background: isConnected ? "var(--color-success)" : "var(--color-danger)",
          }}
          title={isConnected ? "Connected" : "Disconnected"}
          role="status"
          aria-live="polite"
          aria-label={isConnected ? "Connected to server" : "Disconnected from server"}
        />
      </header>

      {/* Messages area */}
      {/* TODO: Virtualize long chat histories using react-window or similar for performance */}
      <div
        id="chat-messages"
        ref={scrollRef}
        onScroll={handleScroll}
        style={styles.messages}
      >
        {hasMore && messages.length > 0 && (
          <button
            type="button"
            onClick={loadEarlierMessages}
            disabled={loadingMore}
            style={{
              alignSelf: "center",
              margin: "0.25rem 0 0.75rem",
              padding: "0.5rem 0.85rem",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--color-accent)",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: loadingMore ? "wait" : "pointer",
              opacity: loadingMore ? 0.7 : 1,
            }}
          >
            {loadingMore ? "Loading earlier messages..." : "Load earlier messages..."}
          </button>
        )}

        {messages.length === 0 && (
          <p style={styles.emptyHint}>
            No messages yet 💬 say something to test the connection!
          </p>
        )}

        {groupedMessages.map((group, gi) => {
          const prevGroup = gi > 0 ? groupedMessages[gi - 1] : null;
          const prevDate = prevGroup ? getDateKey(prevGroup.messages[prevGroup.messages.length - 1]?.timestamp) : null;
          const currDate = getDateKey(group.messages[0]?.timestamp);

          return (
            <div key={group.id}>
              {prevDate !== currDate && (
                <DateSeparator timestamp={group.messages[0]?.timestamp} />
              )}

              {/* Group wrapper */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: group.isSystem ? "center" : group.isMine ? "flex-end" : "flex-start",
                  marginBottom: group.isSystem ? "0.2rem" : "0.35rem",
                }}
              >
                {group.messages.map((msg, mi) => {
                  const isGroupStart = mi === 0;
                  const isGroupEnd = mi === group.messages.length - 1;

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: "0.4rem",
                        flexDirection: group.isMine ? "row-reverse" : "row",
                      }}
                    >
                      {/* Avatar column — only for theirs, only on last msg */}
                      {!group.isMine && !group.isSystem && isGroupEnd && (
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            minWidth: 28,
                            borderRadius: "50%",
                            background: getSenderColor(group.sender),
                            color: "#0f0e17",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            flexShrink: 0,
                            marginBottom: "0.1rem",
                          }}
                          title={group.sender}
                        >
                          {getSenderInitial(group.sender)}
                        </div>
                      )}
                      {/* Spacer for theirs non-last messages to keep alignment */}
                      {!group.isMine && !group.isSystem && !isGroupEnd && (
                        <div style={{ width: 28, minWidth: 28, flexShrink: 0 }} />
                      )}

                      {/* The message bubble */}
                      <MessageBubble
                        msg={msg}
                        isMine={group.isMine}
                        isGroupStart={isGroupStart}
                        isGroupEnd={isGroupEnd}
                        status={messageStatus[msg.id]}
                        npcs={npcs}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUser && <TypingIndicator user={typingUser} />}
      </div>

      {/* Scroll-to-bottom FAB */}
      {!isNearBottom && (
        <ScrollToBottomFAB onClick={scrollToBottom} count={unreadCount} />
      )}

      {/* Emoji picker */}
      <EmojiPicker onSelect={handleEmojiSelect} visible={showEmoji} />

      {/* Input bar */}
      <form id="chat-form" onSubmit={sendMessage} className="chat-input-bar">
        {/* Attachment button (future: dice, images) */}
        <button
          type="button"
          className="chat-icon-btn"
          title="More options"
          aria-label="More options"
          style={{ color: "var(--color-muted)" }}
        >
          <Plus size={20} />
        </button>

        {/* Input pill */}
        <div className="chat-input-pill">
          <input
            ref={inputRef}
            id="chat-input"
            type="text"
            className="chat-input-field"
            placeholder="Type a message..."
            value={draft}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            maxLength={500}
            autoComplete="off"
          />
          {/* Emoji toggle */}
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => setShowEmoji((prev) => !prev)}
            title="Emoji"
            aria-label="Toggle emoji picker"
            style={{
              color: showEmoji ? "var(--color-accent)" : "var(--color-muted)",
            }}
          >
            <Smile size={18} />
          </button>
        </div>

        {/* Send button */}
        <button
          id="chat-send-btn"
          type="submit"
          className="chat-send-btn"
          disabled={!draft.trim()}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

// ===========================================================================
// Inline styles (remaining layout/structural styles)
// ===========================================================================
const styles = {
  /* Name entry overlay */
  nameOverlay: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    background: "linear-gradient(135deg, var(--color-bg) 0%, var(--color-surface) 100%)",
  },
  nameForm: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(200,151,58,0.3)",
    borderRadius: "1rem",
    padding: "2rem",
    maxWidth: "360px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  nameTitle: {
    color: "var(--color-accent)",
    fontSize: "1.75rem",
    marginBottom: "0.25rem",
  },
  nameSub: {
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginBottom: "1.25rem",
  },
  nameInput: {
    width: "100%",
    padding: "0.75rem 1rem",
    fontSize: "1rem",
    borderRadius: "0.5rem",
    border: "1px solid rgba(200,151,58,0.3)",
    background: "rgba(0,0,0,0.3)",
    color: "var(--color-text)",
    outline: "none",
    marginBottom: "1rem",
  },
  nameBtn: {
    width: "100%",
    padding: "0.75rem",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "0.5rem",
    border: "none",
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    color: "var(--color-bg)",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },

  /* Chat layout */
  wrapper: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    maxHeight: "100dvh",
    background: "linear-gradient(135deg, var(--color-bg) 0%, var(--color-surface) 100%)",
    position: "relative",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.65rem 1rem",
    borderBottom: "1px solid rgba(200,151,58,0.12)",
    background: "rgba(0,0,0,0.2)",
    flexShrink: 0,
    zIndex: 5,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
  },
  title: {
    fontSize: "1.1rem",
    color: "var(--color-accent)",
    fontWeight: 700,
  },
  badge: {
    fontSize: "0.65rem",
    color: "var(--color-bg)",
    background: "rgba(200,151,58,0.85)",
    padding: "0.1rem 0.45rem",
    borderRadius: "999px",
    fontWeight: 600,
    letterSpacing: "0.03em",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
    boxShadow: "0 0 6px currentColor",
  },

  /* Messages area */
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "0.5rem 0.75rem",
    display: "flex",
    flexDirection: "column",
  },
  emptyHint: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
};
