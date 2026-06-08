// =============================================================================
// Tablecast — ConversationList (WhatsApp-style contact list)
// Shows all available conversations: Session Chat, Rules Scholar, NPC Roleplay.
// =============================================================================
import { useMemo } from "react";
import { Search, Plus, MessageCircle } from "lucide-react";
import { useSocket } from "../context/SocketContext";

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------
function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - Number(ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(Number(ts));
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Deterministic avatar color
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  "#c8973a", "#6fcf97", "#56ccf2", "#eb5757",
  "#bb6bd9", "#f2994a", "#27ae60", "#2d9cdb",
];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ---------------------------------------------------------------------------
// Conversation Item
// ---------------------------------------------------------------------------
function ConversationItem({ conv, onSelect }) {
  const avatarEl = conv.type === "session" ? (
    <div style={{
      ...styles.avatar, background: "var(--color-accent)",
      fontSize: "1.2rem", color: "var(--color-bg)",
    }}>
      <MessageCircle size={20} />
    </div>
  ) : conv.type === "rules" ? (
    <div style={{
      ...styles.avatar, background: hashColor("Rules Scholar"),
      fontSize: "1.1rem",
    }}>
      📚
    </div>
  ) : conv.avatarUrl ? (
    <img src={conv.avatarUrl} alt="" style={styles.avatarImg} />
  ) : (
    <div style={{
      ...styles.avatar, background: hashColor(conv.name),
      fontSize: "0.9rem", fontWeight: 700, color: "var(--color-bg)",
    }}>
      {(conv.name || "?").charAt(0).toUpperCase()}
    </div>
  );

  return (
    <button
      onClick={() => onSelect(conv)}
      style={styles.item}
      className="conv-item"
      type="button"
    >
      {avatarEl}
      <div style={styles.itemContent}>
        <div style={styles.itemTop}>
          <span style={styles.itemName}>{conv.name}</span>
          <span style={styles.itemTime}>{relativeTime(conv.timestamp)}</span>
        </div>
        <div style={styles.itemBottom}>
          <span style={styles.itemPreview}>
            {conv.lastMessage || (conv.type === "rules"
              ? "Ask a D&D rules question..."
              : conv.type === "npc"
              ? "Start a conversation..."
              : "No messages yet")}
          </span>
          {conv.unread > 0 && (
            <span style={styles.unreadBadge}>
              {conv.unread > 9 ? "9+" : conv.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// NPC Picker Modal
// ---------------------------------------------------------------------------
function NpcPicker({ npcs, onSelect, onClose, loading }) {
  return (
    <div style={styles.npcOverlay} onClick={onClose}>
      <div
        style={styles.npcSheet}
        className="slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.npcSheetHeader}>
          <span style={styles.npcSheetTitle}>Select an NPC</span>
          <button onClick={onClose} style={styles.npcSheetClose} type="button">
            ✕
          </button>
        </div>
        <div style={styles.npcList}>
          {loading ? (
            <p style={styles.npcEmpty}>Loading NPCs...</p>
          ) : npcs.length === 0 ? (
            <p style={styles.npcEmpty}>No NPCs found. Create some in the NPC panel first.</p>
          ) : (
            npcs.map((npc) => (
              <button
                key={npc.id}
                onClick={() => onSelect(npc)}
                style={styles.npcItem}
                className="conv-item"
                type="button"
              >
                {npc.imageUrl ? (
                  <img src={npc.imageUrl} alt={npc.name} style={styles.npcAvatarImg} />
                ) : (
                  <div style={{ ...styles.avatar, background: hashColor(npc.name), fontSize: "0.9rem", fontWeight: 700, color: "var(--color-bg)" }}>
                    {(npc.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ textAlign: "left", minWidth: 0 }}>
                  <div style={styles.npcItemName}>{npc.name}</div>
                  <div style={styles.npcItemSub}>
                    {npc.race} {npc.class} · LV {npc.level}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main ConversationList Component
// =============================================================================
export default function ConversationList({
  conversations,
  onSelect,
  onNewNpc,
  searchQuery,
  onSearchChange,
  npcs,
  npcPickerOpen,
  onNpcPickerSelect,
  onNpcPickerClose,
  loading,
}) {
  const { isConnected } = useSocket();

  const filtered = useMemo(() => {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.name.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.headerTitle}>Messages</h1>
          <span
            style={{
              ...styles.dot,
              background: isConnected ? "var(--color-success)" : "var(--color-danger)",
            }}
            title={isConnected ? "Connected" : "Disconnected"}
          />
        </div>
      </header>

      {/* Search */}
      <div style={styles.searchContainer}>
        <Search size={16} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={styles.searchInput}
          autoComplete="off"
        />
      </div>

      {/* Conversation list */}
      <div style={styles.list}>
        {loading ? (
          <p style={styles.emptyState}>Loading conversations...</p>
        ) : filtered.length === 0 ? (
          <p style={styles.emptyState}>
            {searchQuery ? "No conversations match your search." : "No conversations yet."}
          </p>
        ) : (
          filtered.map((conv) => (
            <ConversationItem key={conv.id} conv={conv} onSelect={onSelect} />
          ))
        )}
      </div>

      {/* New NPC Chat button */}
      <button
        onClick={onNewNpc}
        style={styles.newBtn}
        className="touch-target btn-hover-scale"
        type="button"
      >
        <Plus size={18} />
        <span>New NPC Chat</span>
      </button>

      {/* NPC Picker */}
      {npcPickerOpen && (
        <NpcPicker
          npcs={npcs}
          onSelect={onNpcPickerSelect}
          onClose={onNpcPickerClose}
          loading={loading}
        />
      )}
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
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid rgba(200,151,58,0.12)",
    background: "rgba(0,0,0,0.2)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
  },
  headerTitle: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
    boxShadow: "0 0 6px currentColor",
  },
  searchContainer: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    margin: "0.5rem 0.75rem",
    padding: "0.5rem 0.75rem",
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(200,151,58,0.08)",
    borderRadius: "999px",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    fontFamily: "var(--font-body)",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "0.25rem 0",
  },
  emptyState: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    padding: "2rem 1rem",
  },

  // Conversation item
  item: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    width: "100%",
    padding: "0.65rem 0.85rem",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--color-text)",
    transition: "background 0.12s ease",
  },
  avatar: {
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarImg: {
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  itemTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  itemName: {
    fontSize: "0.9rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  itemTime: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  itemBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  itemPreview: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
    minWidth: 0,
  },
  unreadBadge: {
    background: "var(--color-accent)",
    color: "var(--color-bg)",
    fontSize: "0.6rem",
    fontWeight: 700,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    flexShrink: 0,
  },

  // New NPC button
  newBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.4rem",
    padding: "0.65rem",
    margin: "0.5rem 0.75rem",
    borderRadius: "999px",
    border: "1px solid rgba(200,151,58,0.2)",
    background: "rgba(200,151,58,0.06)",
    color: "var(--color-accent)",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.15s ease",
  },

  // NPC Picker
  npcOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 2000,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  npcSheet: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "70vh",
    background: "var(--color-surface)",
    borderTopLeftRadius: "1rem",
    borderTopRightRadius: "1rem",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
  },
  npcSheetHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: "0.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  npcSheetTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  npcSheetClose: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: "0.25rem",
  },
  npcList: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  npcEmpty: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    padding: "2rem",
  },
  npcItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.6rem 0.5rem",
    background: "transparent",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--color-text)",
    transition: "background 0.12s ease",
    width: "100%",
  },
  npcAvatarImg: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
    border: "1px solid var(--color-accent)",
  },
  npcItemName: {
    fontSize: "0.9rem",
    fontWeight: 600,
  },
  npcItemSub: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
    marginTop: "0.1rem",
  },
};
