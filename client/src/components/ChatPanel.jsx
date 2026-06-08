// =============================================================================
// Tablecast  Chat Panel (Phase 2  Real-Time Verification)
// A simple global chat to prove Socket.io is working end-to-end.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { ExternalLink, Sparkles, Copy, Check } from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true,
});

function compileMarkdown(text) {
  if (!text) return "";
  try {
    return DOMPurify.sanitize(marked.parse(text));
  } catch (e) {
    console.error("[ChatPanel] Markdown parsing failed:", e);
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
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={styles.copyBtn}
      className="btn-hover-scale"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
    </button>
  );
}

export default function ChatPanel({ user, isPopout = false }) {
  const { socket, isConnected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [username, setUsername] = useState(user?.username || "");
  const [hasSetName, setHasSetName] = useState(!!user);
  const [typingUser, setTypingUser] = useState(null);
  const scrollRef = useRef(null);
  const typingTimeout = useRef(null);
  const [npcs, setNpcs] = useState([]);

  // Fetch NPCs for avatar matching
  useEffect(() => {
    async function fetchNpcs() {
      try {
        const res = await fetch("/api/npcs");
        if (res.ok) {
          const data = await res.json();
          setNpcs(data);
        }
      } catch (err) {
        console.error("Failed to fetch NPCs in ChatPanel:", err);
      }
    }
    fetchNpcs();
  }, []);

  // Sync user prop if set externally
  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setHasSetName(true);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await fetch("/api/chat?limit=150");
        if (!res.ok) throw new Error("Failed to load chat history");
        const data = await res.json();
        if (!cancelled) {
          setMessages((prev) => mergeMessages(data, prev));
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for completed dice rolls to update UI
  useEffect(() => {
    function handleRollComplete(e) {
      const { messageId } = e.detail;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, rollDetails: { ...m.rollDetails, status: "done" } }
            : m
        )
      );
    }
    window.addEventListener("dice:roll:complete", handleRollComplete);
    return () => window.removeEventListener("dice:roll:complete", handleRollComplete);
  }, []);

  //  Listen for incoming chat messages 
  useEffect(() => {
    if (!socket) return;

    function onMessage(msg) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;

        return mergeMessages(prev, [msg]);
      });
    }

    function onTyping(payload) {
      setTypingUser(payload.sender);
      // Clear after 2 seconds
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTypingUser(null), 2000);
    }

    socket.on("chat:message", onMessage);
    socket.on("chat:typing", onTyping);

    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:typing", onTyping);
    };
  }, [socket]);

  //  Auto-scroll to latest message 
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  function parseDiceCommand(text) {
    const clean = text.replace(/^\/(roll|r)\s+/i, "").trim();
    const regex = /^(\d+)?d(\d+)(?:\s*([+-])\s*(\d+))?$/i;
    const match = clean.match(regex);
    if (!match) return null;

    const qty = match[1] ? parseInt(match[1]) : 1;
    const sides = parseInt(match[2]);
    const sign = match[3] || "+";
    const modifierVal = match[4] ? parseInt(match[4]) : 0;
    const modifier = sign === "-" ? -modifierVal : modifierVal;

    const rolls = [];
    for (let i = 0; i < qty; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + modifier;

    return { qty, sides, modifier, rolls, total };
  }

  //  Send a message 
  function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !socket) return;

    const text = draft.trim();
    if (text.startsWith("/roll ") || text.startsWith("/r ") || text.toLowerCase() === "/roll" || text.toLowerCase() === "/r") {
      const parsedText = (text.toLowerCase() === "/roll" || text.toLowerCase() === "/r") ? "/roll 1d20" : text;
      const parsed = parseDiceCommand(parsedText);
      if (parsed) {
        const modSign = parsed.modifier >= 0 ? "+" : "";
        const formattedModifier = parsed.modifier !== 0 ? ` ${modSign} ${Math.abs(parsed.modifier)}` : "";
        
        socket.emit("chat:send", {
          userId: user?.id,
          sender: username || "Anonymous",
          text: `rolled ${parsed.qty}d${parsed.sides}${formattedModifier}! Total: ${parsed.total}`,
          type: "roll",
          rollDetails: {
            rollName: "Chat Roll",
            formula: `${parsed.qty}d${parsed.sides}${parsed.modifier !== 0 ? (parsed.modifier > 0 ? ' + ' + parsed.modifier : ' - ' + Math.abs(parsed.modifier)) : ''}`,
            rolls: parsed.rolls,
            modifier: parsed.modifier,
            total: parsed.total,
            isAttack: false,
            status: "rolling",
            diceTheme: user?.diceTheme || "default",
            diceColor: user?.diceColor || "#7c3aed",
            dice3d: [`${parsed.qty}d${parsed.sides}@${parsed.rolls.join(",")}`],
          },
        });
        setDraft("");
        return;
      }
    }

    socket.emit("chat:send", { userId: user?.id, sender: username || "Anonymous", text: draft });
    setDraft("");
  }

  //  Typing indicator 
  function handleInputChange(e) {
    setDraft(e.target.value);
    if (socket && hasSetName) {
      socket.emit("chat:typing", { sender: username || "Anonymous" });
    }
  }

  //  Username entry screen 
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
          <h2 style={styles.nameTitle}> Enter the Tavern</h2>
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

  //  Chat UI 
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
          <h1 style={styles.title}> Tablecast</h1>
          <span style={styles.badge}>{username}</span>
          {!isPopout && user?.role === "DM" && (
            <button
              onClick={() => window.open("/#/dm/popout/chat", "_blank", "width=600,height=800,resizable=yes,scrollbars=yes")}
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
              <ExternalLink size={17} />
            </button>
          )}
        </div>
        <span
          id="connection-status"
          style={{
            ...styles.dot,
            background: isConnected ? "#6fcf97" : "#eb5757",
          }}
          title={isConnected ? "Connected" : "Disconnected"}
        />
      </header>

      {/* Messages */}
      <div id="chat-messages" ref={scrollRef} style={styles.messages}>
        {messages.length === 0 && (
          <p style={styles.emptyHint}>
            No messages yet  say something to test the connection! 
          </p>
        )}
        {messages.map((msg) => {
          if (msg.type === "roll" && msg.rollDetails) {
            const rd = msg.rollDetails;
            return (
              <div
                key={msg.id}
                style={{
                  ...styles.bubble,
                  ...styles.rollBubble,
                }}
                className="gold-border-glow fade-in"
              >
                <div style={styles.rollHeader}>
                  <div style={styles.rollHeaderLeft}>
                    <span style={styles.rollIcon}>{rd.isAttack ? "⚔️" : "🎲"}</span>
                    <span style={styles.rollName}>{rd.rollName}</span>
                  </div>
                  <span style={styles.time}>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div style={styles.rollInfoRow}>
                  <span style={styles.senderText}>{msg.sender}</span>
                  <span style={styles.rollFormula}>{rd.formula}</span>
                </div>

                {rd.status === "rolling" ? (
                  <div style={styles.rollBodySingle}>
                    <div style={styles.rollBlock} className="text-pulse">
                      <span style={{ ...styles.rollLabel, fontSize: "1.1rem", fontStyle: "italic", color: "var(--color-accent)" }}>
                        🎲 Rolling...
                      </span>
                    </div>
                  </div>
                ) : rd.isAttack ? (
                  <div style={styles.rollBody}>
                    <div style={styles.rollBlock}>
                      <span style={styles.rollLabel}>To Hit</span>
                      <span style={{ ...styles.rollTotal, color: "var(--color-accent)" }}>
                        {rd.toHitTotal}
                      </span>
                      <span style={styles.rollDetailText}>
                        1d20({rd.toHitRoll}) {rd.toHitMod >= 0 ? `+` : ``}{rd.toHitMod}
                      </span>
                    </div>

                    <div style={styles.rollDivider} />

                    <div style={styles.rollBlock}>
                      <span style={styles.rollLabel}>Damage</span>
                      <span style={{ ...styles.rollTotal, color: "var(--color-danger)" }}>
                        {rd.damageTotal}
                      </span>
                      <span style={styles.rollDetailText}>
                        {rd.damageDice}({rd.damageRolls.join("+")}) {rd.damageMod >= 0 ? `+` : ``}{rd.damageMod}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={styles.rollBodySingle}>
                    <div style={styles.rollBlock}>
                      <span style={styles.rollTotalSingle}>
                        {rd.total}
                      </span>
                      <span style={styles.rollDetailText}>
                        Rolled: {rd.rolls.join(", ")} {rd.modifier >= 0 ? `+` : ``}{rd.modifier}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          const isAi = msg.sender === "D&D AI Assistant";
          const isNpc = msg.type === "npc";

          // If AI Assistant message
          if (isAi) {
            return (
              <div
                key={msg.id}
                style={styles.aiBubble}
                className="gold-border-glow fade-in"
              >
                <div style={styles.aiHeader}>
                  <div style={styles.aiTitleRow}>
                    <Sparkles size={14} style={{ color: "var(--color-accent)", marginRight: "0.25rem" }} />
                    <span style={styles.aiTitle}>D&D AI Scholar</span>
                  </div>
                  <div style={styles.aiActions}>
                    <span style={styles.time}>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <CopyButton text={msg.text} />
                  </div>
                </div>
                <div 
                  className="wiki-content"
                  style={styles.aiText}
                  dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
                />
              </div>
            );
          }

          // If NPC message
          if (isNpc) {
            const matchedNpc = npcs.find(n => n.name.toLowerCase() === msg.sender.toLowerCase());
            const npcAvatar = matchedNpc?.imageUrl || matchedNpc?.largeImageUrl || "";
            return (
              <div
                key={msg.id}
                style={styles.npcBubble}
                className="fade-in"
              >
                <div style={styles.npcHeader}>
                  <div style={styles.npcTitleRow}>
                    {npcAvatar ? (
                      <img
                        src={npcAvatar}
                        alt={msg.sender}
                        style={styles.npcAvatar}
                      />
                    ) : (
                      <span style={styles.npcAvatarPlaceholder}>🗣️</span>
                    )}
                    <span style={styles.npcTitle}>{msg.sender}</span>
                  </div>
                  <span style={styles.time}>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div 
                  className="wiki-content"
                  style={styles.npcText}
                  dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
                />
              </div>
            );
          }

          // Standard system message (not AI)
          const isSystem = msg.type === "system";

          return (
            <div
              key={msg.id}
              style={{
                ...styles.bubble,
                ...(isSystem ? styles.systemBubble : {}),
              }}
              className="fade-in"
            >
              <span style={styles.sender}>
                {msg.sender}
                <span style={styles.time}>
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
              <div 
                className="wiki-content"
                style={styles.text}
                dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
              />
            </div>
          );
        })}
        {typingUser && (
          <p style={styles.typingIndicator}>
            {typingUser} is typing
            <span style={styles.dots}>
              <span style={styles.dotAnim}>.</span>
              <span style={{ ...styles.dotAnim, animationDelay: "0.2s" }}>.</span>
              <span style={{ ...styles.dotAnim, animationDelay: "0.4s" }}>.</span>
            </span>
          </p>
        )}
      </div>

      {/* Input */}
      <form id="chat-form" onSubmit={sendMessage} style={styles.form}>
        <input
          id="chat-input"
          type="text"
          placeholder="Send a message"
          value={draft}
          onChange={handleInputChange}
          style={styles.input}
          maxLength={500}
          autoComplete="off"
        />
        <button
          id="chat-send-btn"
          type="submit"
          style={{
            ...styles.sendBtn,
            opacity: draft.trim() ? 1 : 0.4,
          }}
          disabled={!draft.trim()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function mergeMessages(...messageLists) {
  const byId = new Map();
  for (const list of messageLists) {
    for (const message of list) {
      if (message?.id) byId.set(message.id, message);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = Number(a.timestamp) || 0;
    const bTime = Number(b.timestamp) || 0;
    return aTime - bTime;
  });
}

// ---------------------------------------------------------------------------
// Inline styles  Agent 3 will migrate these to the design system later
// ---------------------------------------------------------------------------
const styles = {
  /* Name entry overlay */
  nameOverlay: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    background: "linear-gradient(135deg, #0f0e17 0%, #1a1830 100%)",
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
    color: "#c8973a",
    fontSize: "1.75rem",
    marginBottom: "0.25rem",
  },
  nameSub: {
    color: "#a7a9be",
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
    color: "#fffffe",
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
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    color: "#0f0e17",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },

  /* Chat layout */
  wrapper: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    maxHeight: "100dvh",
    background: "linear-gradient(135deg, #0f0e17 0%, #1a1830 100%)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid rgba(200,151,58,0.15)",
    background: "rgba(0,0,0,0.25)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  title: {
    fontSize: "1.25rem",
    color: "#c8973a",
    fontWeight: 700,
  },
  badge: {
    fontSize: "0.7rem",
    color: "#0f0e17",
    background: "rgba(200,151,58,0.85)",
    padding: "0.15rem 0.5rem",
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

  /* Messages */
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  emptyHint: {
    textAlign: "center",
    color: "#a7a9be",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
  bubble: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "0.75rem",
    padding: "0.6rem 0.85rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    maxWidth: "85%",
  },
  systemBubble: {
    alignSelf: "center",
    background: "rgba(200,151,58,0.08)",
    border: "1px solid rgba(200,151,58,0.15)",
    fontStyle: "italic",
    maxWidth: "90%",
    textAlign: "center",
  },
  sender: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#c8973a",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  time: {
    fontWeight: 400,
    color: "#a7a9be",
    fontSize: "0.65rem",
  },
  text: {
    fontSize: "0.9rem",
    color: "#fffffe",
    lineHeight: 1.45,
  },
  typingIndicator: {
    fontSize: "0.75rem",
    color: "#a7a9be",
    fontStyle: "italic",
    paddingLeft: "0.25rem",
  },
  dots: { marginLeft: "2px" },
  dotAnim: {
    display: "inline-block",
    animation: "blink 1s infinite",
  },

  /* Input bar */
  form: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.75rem 1rem",
    borderTop: "1px solid rgba(200,151,58,0.15)",
    background: "rgba(0,0,0,0.25)",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: "0.7rem 1rem",
    fontSize: "0.95rem",
    borderRadius: "0.5rem",
    border: "1px solid rgba(200,151,58,0.2)",
    background: "rgba(0,0,0,0.3)",
    color: "#fffffe",
    outline: "none",
  },
  sendBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: "0.5rem",
    border: "none",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    color: "#0f0e17",
    fontSize: "1.2rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.2s",
  },

  /* Roll Card styles */
  rollBubble: {
    background: "rgba(200, 151, 58, 0.04)",
    border: "1px solid rgba(200, 151, 58, 0.35)",
    borderRadius: "0.75rem",
    padding: "0.75rem 1rem",
    maxWidth: "90%",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  rollHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(200, 151, 58, 0.15)",
    paddingBottom: "0.25rem",
  },
  rollHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  rollIcon: {
    fontSize: "1rem",
  },
  rollName: {
    fontSize: "0.9rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
  },
  rollInfoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "0.75rem",
  },
  senderText: {
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  rollFormula: {
    fontFamily: "monospace",
    color: "var(--color-muted)",
  },
  rollBody: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    padding: "0.4rem 0",
    background: "rgba(0, 0, 0, 0.15)",
    borderRadius: "6px",
    marginTop: "0.25rem",
  },
  rollBodySingle: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0.5rem 0",
    background: "rgba(0, 0, 0, 0.15)",
    borderRadius: "6px",
    marginTop: "0.25rem",
  },
  rollBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  rollLabel: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    textTransform: "uppercase",
    fontWeight: 700,
    letterSpacing: "0.05em",
  },
  rollTotal: {
    fontSize: "1.6rem",
    fontWeight: 800,
    lineHeight: 1.2,
  },
  rollTotalSingle: {
    fontSize: "1.7rem",
    fontWeight: 800,
    color: "var(--color-accent)",
    lineHeight: 1.2,
  },
  rollDetailText: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
  },
  rollDivider: {
    width: "1px",
    height: "36px",
    background: "rgba(255, 255, 255, 0.08)",
  },
  /* AI Bubble styles */
  aiBubble: {
    alignSelf: "flex-start",
    background: "rgba(200, 151, 58, 0.07)",
    border: "1px solid rgba(200, 151, 58, 0.35)",
    borderRadius: "0.75rem",
    padding: "0.75rem 1rem",
    maxWidth: "85%",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    boxShadow: "0 0 12px rgba(200, 151, 58, 0.08)",
  },
  aiHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(200, 151, 58, 0.15)",
    paddingBottom: "0.25rem",
    marginBottom: "0.25rem",
  },
  aiTitleRow: {
    display: "flex",
    alignItems: "center",
  },
  aiTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    fontFamily: "var(--font-body)",
    letterSpacing: "0.03em",
  },
  aiActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  copyBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.2rem",
    borderRadius: "4px",
    transition: "all 0.2s",
  },
  aiText: {
    fontSize: "0.9rem",
    color: "#fffffe",
    lineHeight: 1.45,
  },

  /* NPC Scroll Bubble */
  npcBubble: {
    alignSelf: "flex-start",
    background: "rgba(245, 235, 215, 0.04)",
    borderLeft: "4px solid var(--color-accent)",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
    borderRight: "1px solid rgba(255, 255, 255, 0.05)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "0.35rem 0.75rem 0.75rem 0.35rem",
    padding: "0.75rem 1rem",
    maxWidth: "85%",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
  },
  npcHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    paddingBottom: "0.25rem",
    marginBottom: "0.25rem",
  },
  npcTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  npcAvatar: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid var(--color-accent)",
  },
  npcAvatarPlaceholder: {
    fontSize: "0.95rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
  },
  npcTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    fontFamily: "Georgia, serif",
    letterSpacing: "0.02em",
  },
  npcText: {
    fontSize: "0.9rem",
    color: "#e2d6b5",
    fontFamily: "Georgia, serif",
    fontStyle: "italic",
    lineHeight: 1.5,
  },
};
