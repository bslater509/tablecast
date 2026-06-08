// =============================================================================
// Tablecast — MessageHub
// WhatsApp-style conversation hub that manages the contact list and routes
// to the appropriate chat view (Session Chat, Rules Scholar, NPC Roleplay).
// =============================================================================
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useSocket } from "../context/SocketContext";
import ConversationList from "./ConversationList";
import AiChatView from "./AiChatView";
import ChatPanel from "./ChatPanel";

function truncate(text, max = 80) {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
}

function lastMsgPreview(msg) {
  if (!msg) return "";
  const text = msg.text || "";
  const prefix = msg.sender ? `${msg.sender}: ` : "";
  return truncate(prefix + text);
}

function lastMsgTimestamp(msg) {
  if (!msg) return null;
  return Number(msg.timestamp) || null;
}

// =============================================================================
// Session Chat Screen (wraps ChatPanel with back button)
// =============================================================================
function SessionChatScreen({ user, onBack }) {
  return (
    <div style={{ position: "relative", height: "100%" }}>
      {/* Back button floating over ChatPanel header */}
      <button
        onClick={onBack}
        style={{
          position: "absolute",
          top: "0.5rem",
          left: "0.4rem",
          zIndex: 20,
          background: "rgba(0,0,0,0.45)",
          border: "none",
          borderRadius: "50%",
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "var(--color-accent)",
          backdropFilter: "blur(4px)",
        }}
        className="touch-target btn-hover-scale"
        type="button"
        aria-label="Back to messages"
      >
        <ArrowLeft size={20} />
      </button>
      <ChatPanel user={user} isPopout={false} />
    </div>
  );
}

// =============================================================================
// Main MessageHub Component
// =============================================================================
export default function MessageHub({ user }) {
  const { socket, isConnected } = useSocket();
  const [npcs, setNpcs] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Active conversation state (null = show list)
  const [activeView, setActiveView] = useState(null); // "session" | "rules" | "npc"
  const [activeNpcId, setActiveNpcId] = useState(null);
  const [activeNpcData, setActiveNpcData] = useState(null);
  const [activeConvId, setActiveConvId] = useState(null);

  // NPC picker
  const [showNpcPicker, setShowNpcPicker] = useState(false);

  // Session chat tracking
  const [lastSessionMsg, setLastSessionMsg] = useState(null);
  const [sessionUnread, setSessionUnread] = useState(0);
  const viewRef = useRef(activeView);
  viewRef.current = activeView;

  // ---- Fetch data ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Load NPCs
        const npcRes = await fetch("/api/npcs");
        const npcData = npcRes.ok ? await npcRes.json() : [];
        if (cancelled) return;
        const npcMap = {};
        npcData.forEach((n) => { npcMap[n.id] = n; });
        setNpcs(npcData);

        // Load last session chat message
        const chatRes = await fetch("/api/chat?limit=1");
        const chatData = chatRes.ok ? await chatRes.json() : [];
        const lastMsg = chatData[chatData.length - 1] || null;
        if (cancelled) return;
        setLastSessionMsg(lastMsg);

        // Load AI conversations
        const convRes = await fetch("/api/ai/conversations", {
          headers: { "x-tablecast-user-id": user?.id || "" },
        });
        const convData = convRes.ok ? await convRes.json() : [];
        if (cancelled) return;

        // Build conversation list items
        const items = [];

        // 1. Session chat (always first)
        items.push({
          id: "session",
          type: "session",
          name: "Session Chat",
          lastMessage: lastMsgPreview(lastMsg),
          timestamp: lastMsgTimestamp(lastMsg),
          unread: 0,
        });

        // 2. Rules Scholar conversations
        const rulesConvs = convData.filter((c) => c.type === "rules");
        if (rulesConvs.length > 0) {
          rulesConvs.forEach((c) => {
            const msgs = c.messages || [];
            const last = msgs[msgs.length - 1];
            items.push({
              id: `rules_${c.id}`,
              type: "rules",
              name: "Rules Scholar",
              lastMessage: last ? truncate(last.text) : "Ask a D&D rules question...",
              timestamp: last ? new Date(last.createdAt || c.updatedAt).getTime() : null,
              unread: 0,
              conversationId: c.id,
            });
          });
        } else {
          // Always show Rules Scholar as an option
          items.push({
            id: "rules",
            type: "rules",
            name: "Rules Scholar",
            lastMessage: "Ask a D&D rules question...",
            timestamp: null,
            unread: 0,
          });
        }

        // 3. NPC roleplay conversations
        const npcConvs = convData.filter((c) => c.type === "npc");
        npcConvs.forEach((c) => {
          const npcInfo = npcMap[c.npcId] || {};
          const msgs = c.messages || [];
          const last = msgs[msgs.length - 1];
          items.push({
            id: `npc_${c.npcId}_${c.id}`,
            type: "npc",
            name: npcInfo.name || `NPC #${c.npcId}`,
            avatarUrl: npcInfo.imageUrl || npcInfo.largeImageUrl || "",
            lastMessage: last ? truncate(last.text) : "Start a conversation...",
            timestamp: last ? new Date(last.createdAt || c.updatedAt).getTime() : null,
            unread: 0,
            conversationId: c.id,
            npcId: c.npcId,
          });
        });

        // Sort: session first, then by timestamp descending
        items.sort((a, b) => {
          if (a.id === "session") return -1;
          if (b.id === "session") return 1;
          const ta = a.timestamp || 0;
          const tb = b.timestamp || 0;
          return tb - ta;
        });

        if (!cancelled) {
          setConversations(items);
        }
      } catch (err) {
        console.error("[MessageHub] Failed to load conversations:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ---- Track session chat unread ----
  useEffect(() => {
    if (!socket) return;

    function onMessage(msg) {
      setLastSessionMsg(msg);
      if (viewRef.current !== "session") {
        setSessionUnread((prev) => prev + 1);
      }
    }

    socket.on("chat:message", onMessage);
    return () => socket.off("chat:message", onMessage);
  }, [socket]);

  // Update conversation list when session unread changes
  useEffect(() => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.type === "session") {
          return {
            ...c,
            unread: sessionUnread,
            lastMessage: lastMsgPreview(lastSessionMsg),
            timestamp: lastMsgTimestamp(lastSessionMsg),
          };
        }
        return c;
      })
    );
  }, [sessionUnread, lastSessionMsg]);

  // ---- NPC picker callbacks ----
  const handleNpcPickerSelect = useCallback((npc) => {
    setShowNpcPicker(false);
    setActiveView("npc");
    setActiveNpcId(npc.id);
    setActiveNpcData(npc);
    setActiveConvId(null); // new conversation
  }, []);

  const handleNewNpc = useCallback(() => {
    setShowNpcPicker(true);
  }, []);

  // ---- Conversation select ----
  const handleSelectConversation = useCallback((conv) => {
    if (conv.type === "session") {
      setActiveView("session");
      setSessionUnread(0);
    } else if (conv.type === "rules") {
      setActiveView("rules");
      setActiveConvId(conv.conversationId || null);
    } else if (conv.type === "npc") {
      setActiveView("npc");
      setActiveNpcId(conv.npcId);
      setActiveConvId(conv.conversationId || null);
      // Look up NPC data
      const npcData = npcs.find((n) => n.id === conv.npcId);
      setActiveNpcData(npcData || null);
    }
  }, [npcs]);

  // ---- Back to list ----
  const handleBack = useCallback(() => {
    setActiveView(null);
    setActiveNpcId(null);
    setActiveNpcData(null);
    setActiveConvId(null);
  }, []);

  // ---- Render ----
  // Session Chat
  if (activeView === "session") {
    return <SessionChatScreen user={user} onBack={handleBack} />;
  }

  // Rules Scholar
  if (activeView === "rules") {
    return (
      <AiChatView
        user={user}
        type="rules"
        conversationId={activeConvId}
        onBack={handleBack}
      />
    );
  }

  // NPC Roleplay
  if (activeView === "npc") {
    return (
      <AiChatView
        user={user}
        type="npc"
        npcId={activeNpcId}
        conversationId={activeConvId}
        npcData={activeNpcData}
        onBack={handleBack}
      />
    );
  }

  // Default: Conversation list
  return (
    <ConversationList
      conversations={conversations}
      onSelect={handleSelectConversation}
      onNewNpc={handleNewNpc}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      npcs={npcs}
      npcPickerOpen={showNpcPicker}
      onNpcPickerSelect={handleNpcPickerSelect}
      onNpcPickerClose={() => setShowNpcPicker(false)}
      loading={loading}
    />
  );
}
