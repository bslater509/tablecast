// =============================================================================
// Tablecast — AI Session Co-Pilot Panel
// Proactive DM suggestions delivered via Socket.io
// Receives copilot:suggestion events and displays them as priority-coded cards
// =============================================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Wifi, WifiOff, BrainCircuit } from "lucide-react";

const MAX_SUGGESTIONS = 10;
const AUTO_DISMISS_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

const PRIORITY_COLORS = {
  high: { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", label: "#ef4444", dot: "#ef4444" },
  medium: { bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.4)", label: "#f59e0b", dot: "#f59e0b" },
  low: { bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.4)", label: "#3b82f6", dot: "#3b82f6" },
};

const TYPE_ICONS = {
  rule: "\uD83D\uDCD6",
  lore: "\uD83D\uDCDC",
  balance: "\u2694\uFE0F",
  effect: "\u23F1\uFE0F",
};

const DEFAULT_ICON = "\uD83D\uDCA1";

export default function CoPilotPanel({ user, socket, encounterId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isCooldown, setIsCooldown] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const nextIdRef = useRef(0);
  const cleanupRef = useRef(null);

  // Handle incoming suggestions from copilot:suggestion event
  const handleSuggestion = useCallback((data) => {
    // Cooldown flag — rate limit active
    if (data?.cooldown) {
      setIsCooldown(true);
      setTimeout(() => setIsCooldown(false), 30000);
      return;
    }

    if (!data?.suggestions || !Array.isArray(data.suggestions)) return;

    const now = Date.now();
    const newItems = data.suggestions.map((s) => ({
      ...s,
      id: nextIdRef.current++,
      timestamp: now,
    }));

    setSuggestions((prev) => {
      const combined = [...newItems, ...prev];
      return combined.slice(0, MAX_SUGGESTIONS);
    });
  }, []);

  // Remove stale suggestions older than AUTO_DISMISS_MS
  const cleanupOld = useCallback(() => {
    const cutoff = Date.now() - AUTO_DISMISS_MS;
    setSuggestions((prev) => prev.filter((s) => s.timestamp > cutoff));
  }, []);

  // Dismiss a single suggestion by id
  const dismiss = useCallback((id) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Toggle expand/collapse for long text
  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Register socket listener and start cleanup interval
  useEffect(() => {
    if (!socket) return;

    socket.on("copilot:suggestion", handleSuggestion);
    cleanupRef.current = setInterval(cleanupOld, CLEANUP_INTERVAL_MS);

    return () => {
      socket.off("copilot:suggestion", handleSuggestion);
      if (cleanupRef.current) {
        clearInterval(cleanupRef.current);
      }
    };
  }, [socket, handleSuggestion, cleanupOld]);

  // Emit a manual copilot check
  const handleCheckChat = useCallback(() => {
    if (socket?.emit) {
      socket.emit("copilot:check", {
        encounterId: encounterId || null,
      });
    }
  }, [socket, encounterId]);

  const styles = {
    container: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--color-bg)",
      overflow: "hidden",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: "1px solid rgba(200, 151, 58, 0.15)",
      background: "rgba(10, 8, 20, 0.85)",
      flexShrink: 0,
    },
    headerLeft: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    headerTitles: {
      display: "flex",
      flexDirection: "column",
    },
    headerTitle: {
      fontSize: "0.95rem",
      fontWeight: 700,
      color: "var(--color-accent)",
      letterSpacing: "0.03em",
    },
    headerSubtitle: {
      fontSize: "0.72rem",
      color: "var(--color-muted)",
      marginTop: "1px",
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: "50%",
      flexShrink: 0,
    },
    cooldownBanner: {
      padding: "6px 16px",
      fontSize: "0.78rem",
      color: "#f59e0b",
      background: "rgba(245, 158, 11, 0.1)",
      borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
      textAlign: "center",
      fontWeight: 600,
      flexShrink: 0,
    },
    scrollArea: {
      flex: 1,
      overflowY: "auto",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },
    emptyState: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      padding: "2rem",
      textAlign: "center",
      color: "var(--color-muted)",
      fontSize: "0.85rem",
      gap: "8px",
    },
    emptyIcon: {
      fontSize: "1.5rem",
      opacity: 0.5,
    },
    card: {
      borderRadius: "8px",
      border: "1px solid",
      padding: "10px 12px",
      cursor: "default",
      transition: "opacity 0.2s",
      flexShrink: 0,
    },
    cardHeader: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: "6px",
    },
    cardIcon: {
      fontSize: "1rem",
      flexShrink: 0,
    },
    cardTitle: {
      flex: 1,
      fontSize: "0.82rem",
      fontWeight: 700,
    },
    dismissBtn: {
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: "2px",
      borderRadius: "3px",
      color: "var(--color-muted)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      opacity: 0.6,
      transition: "opacity 0.15s",
    },
    cardBody: {
      fontSize: "0.8rem",
      color: "var(--color-text)",
      lineHeight: 1.45,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      cursor: "inherit",
    },
    expandToggle: {
      color: "var(--color-muted)",
      fontWeight: 600,
      cursor: "pointer",
      marginLeft: "4px",
      fontSize: "0.75rem",
    },
    footer: {
      padding: "10px 16px",
      borderTop: "1px solid rgba(255, 255, 255, 0.05)",
      flexShrink: 0,
    },
    checkBtn: {
      width: "100%",
      padding: "8px",
      borderRadius: "6px",
      background: "rgba(200, 151, 58, 0.1)",
      border: "1px solid rgba(200, 151, 58, 0.25)",
      color: "var(--color-accent)",
      fontSize: "0.78rem",
      fontWeight: 600,
      cursor: "pointer",
      transition: "background 0.15s",
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <BrainCircuit size={20} color="var(--color-accent)" />
          <div style={styles.headerTitles}>
            <div style={styles.headerTitle}>AI Co-Pilot</div>
            <div style={styles.headerSubtitle}>Proactive DM Assistant</div>
          </div>
        </div>
        <div
          style={{
            ...styles.statusDot,
            background: socket?.connected ? "#22c55e" : "#ef4444",
            boxShadow: socket?.connected
              ? "0 0 6px rgba(34, 197, 94, 0.6)"
              : "0 0 6px rgba(239, 68, 68, 0.4)",
          }}
          aria-label={socket?.connected ? "Connected" : "Disconnected"}
        />
      </div>

      {/* Cooldown Banner */}
      {isCooldown && (
        <div style={styles.cooldownBanner}>Cooldown active</div>
      )}

      {/* Suggestions */}
      <div style={styles.scrollArea}>
        {suggestions.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <BrainCircuit size={24} opacity={0.4} />
            </div>
            <div>Co-Pilot is monitoring the session</div>
          </div>
        ) : (
          suggestions.map((s) => {
            const colors = PRIORITY_COLORS[s.priority] || PRIORITY_COLORS.low;
            const icon = TYPE_ICONS[s.type] || DEFAULT_ICON;
            const isExpanded = expandedIds.has(s.id);
            const needsTruncation = s.text && s.text.length > 150;

            return (
              <div
                key={s.id}
                style={{
                  ...styles.card,
                  background: colors.bg,
                  borderColor: colors.border,
                }}
              >
                <div style={styles.cardHeader}>
                  <span style={styles.cardIcon}>{icon}</span>
                  <span
                    style={{
                      ...styles.cardTitle,
                      color: colors.label,
                    }}
                  >
                    {s.title}
                  </span>
                  <button
                    onClick={() => dismiss(s.id)}
                    style={styles.dismissBtn}
                    aria-label="Dismiss"
                    className="touch-target"
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div
                  style={styles.cardBody}
                  onClick={() => {
                    if (needsTruncation) toggleExpand(s.id);
                  }}
                >
                  {isExpanded || !needsTruncation
                    ? s.text
                    : s.text.slice(0, 150) + "\u2026"}
                  {needsTruncation && (
                    <span style={styles.expandToggle}>
                      {isExpanded ? " Show less" : " Show more"}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer — Manual Check */}
      <div style={styles.footer}>
        <button
          onClick={handleCheckChat}
          style={{
            ...styles.checkBtn,
            opacity: socket?.connected ? 1 : 0.4,
          }}
          disabled={!socket?.connected}
          className="touch-target"
        >
          Check Current Chat
        </button>
      </div>
    </div>
  );
}
