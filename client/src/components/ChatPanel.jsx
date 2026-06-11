// =============================================================================
// Tablecast — WhatsApp-style Chat Panel
// Full-featured session chat with message ownership bubbles, grouping,
// date separators, status indicators, emoji picker, and smooth animations.
// =============================================================================
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Send, Plus, Smile } from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useDiceBox } from "../context/DiceBoxContext";
import { ChatPanelSkeleton } from "./PanelSkeleton";
import {
  groupMessages, getSenderColor, getSenderInitial, parseDiceNotation,
  getDateKey, mergeMessages, genTempId,
} from "./chat/chatUtils";
import { chatStyles } from "./chat/chatStyles";
import DateSeparator from "./chat/DateSeparator";
import MessageBubble from "./chat/MessageBubble";
import TypingIndicator from "./chat/TypingIndicator";
import ScrollToBottomFAB from "./chat/ScrollToBottomFAB";
import EmojiPicker from "./chat/EmojiPicker";

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
      <div style={chatStyles.nameOverlay}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) setHasSetName(true);
          }}
          style={chatStyles.nameForm}
        >
          <h2 style={chatStyles.nameTitle}>🏰 Enter the Tavern</h2>
          <p style={chatStyles.nameSub}>Choose a name for the chat</p>
          <input
            id="username-input"
            type="text"
            placeholder="Your character name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={chatStyles.nameInput}
            autoFocus
            maxLength={24}
          />
          <button
            id="join-chat-btn"
            type="submit"
            style={{
              ...chatStyles.nameBtn,
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
          ...chatStyles.wrapper,
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
        ...chatStyles.wrapper,
        height: isPopout ? "100vh" : "100%",
        maxHeight: isPopout ? "100dvh" : "100%",
      }}
    >
      {/* Header */}
      <header style={chatStyles.header}>
        <div style={chatStyles.headerLeft}>
          <h1 style={chatStyles.title}>💬 Tablecast</h1>
          <span style={chatStyles.badge}>{username}</span>
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
            ...chatStyles.dot,
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
        style={chatStyles.messages}
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
          <p style={chatStyles.emptyHint}>
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
