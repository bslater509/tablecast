// =============================================================================
// Tablecast  Quest / Journal Log Panel (Section 3.3)
// DM quest CRUD with objective builder, reward config, character assignment,
// and quest chain support. Player read-only view of assigned visible quests
// with progress tracking and notification badges.
// =============================================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  ChevronRight,
  CheckCircle,
  Circle,
  Target,
  MapPin,
  Users,
  Sword,
  Package,
  MessageCircle,
  Hammer,
  X,
  Eye,
  EyeOff,
  ListTodo,
  Save,
  UserCheck,
  Trophy,
  List,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

// ── Constants ──

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active", color: "#22c55e" },
  { value: "COMPLETED", label: "Completed", color: "#3b82f6" },
  { value: "FAILED", label: "Failed", color: "#ef4444" },
];

const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]));

const OBJECTIVE_TYPES = [
  { value: "KILL", label: "Kill", icon: Sword },
  { value: "FETCH", label: "Fetch", icon: Package },
  { value: "ESCORT", label: "Escort", icon: MapPin },
  { value: "EXPLORE", label: "Explore", icon: Target },
  { value: "TALK", label: "Talk", icon: MessageCircle },
  { value: "CRAFT", label: "Craft", icon: Hammer },
];

const OBJ_TYPE_NAMES = Object.fromEntries(OBJECTIVE_TYPES.map((t) => [t.value, t.label]));

// ── Helpers ──

function parseArr(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObj(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getStatusStyle(status) {
  return STATUS_MAP[status] || { color: "#6b7280", label: status };
}

// ── Styles ──

const s = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRadius: "16px",
    padding: "1rem",
    overflow: "hidden",
    gap: "0.75rem",
  },

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  headerTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-text)",
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
    display: "inline-block",
    marginLeft: "0.25rem",
    animation: "pulse 1.5s infinite",
  },

  // Status filter
  statusFilter: {
    display: "flex",
    gap: "0.25rem",
    flexShrink: 0,
    overflowX: "auto",
  },
  statusFilterBtn: {
    padding: "0.25rem 0.6rem",
    fontSize: "0.68rem",
    fontWeight: 600,
    borderRadius: "9999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "var(--color-muted)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: "30px",
    transition: "all 0.15s",
  },
  statusFilterActive: {
    borderColor: "var(--color-accent)",
    color: "var(--color-accent)",
    background: "rgba(200,151,58,0.1)",
  },

  // Tab bar (DM)
  tabBar: {
    display: "flex",
    gap: "0.25rem",
    flexShrink: 0,
  },
  tabBtn: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.35rem 0.7rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "var(--color-muted)",
    cursor: "pointer",
    minHeight: "36px",
    transition: "all 0.15s",
  },
  tabBtnActive: {
    borderColor: "rgba(200,151,58,0.3)",
    color: "var(--color-accent)",
    background: "rgba(200,151,58,0.08)",
  },

  // Layout
  layout: {
    flex: 1,
    display: "flex",
    gap: "0.75rem",
    overflow: "hidden",
  },
  sidebar: {
    width: "260px",
    minWidth: "200px",
    flexShrink: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    paddingRight: "0.25rem",
  },
  detailPanel: {
    flex: 1,
    overflowY: "auto",
    paddingLeft: "0.75rem",
    borderLeft: "1px solid rgba(255,255,255,0.06)",
  },

  // Error
  errorBox: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    background: "rgba(235, 87, 87, 0.1)",
    border: "1px solid rgba(235, 87, 87, 0.25)",
    color: "var(--color-danger)",
    fontSize: "0.78rem",
    fontWeight: 500,
    flexShrink: 0,
  },

  // Loading
  loadingContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: "0.5rem",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
  },
  spinner: {
    width: 20,
    height: 20,
    border: "2px solid rgba(255,255,255,0.1)",
    borderTop: "2px solid var(--color-accent)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },

  // Empty state
  emptyState: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.82rem",
    padding: "2rem 1rem",
  },

  // Quest card
  questCard: {
    padding: "0.65rem",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.06)",
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  questCardSelected: {
    borderColor: "rgba(200,151,58,0.35)",
    background: "rgba(200,151,58,0.06)",
  },
  questCardTitle: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "var(--color-text)",
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  questCardMeta: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    display: "flex",
    gap: "0.4rem",
    alignItems: "center",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.1rem 0.45rem",
    fontSize: "0.6rem",
    fontWeight: 600,
    borderRadius: "9999px",
    textTransform: "uppercase",
    letterSpacing: "0.3px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  progressBar: {
    height: "3px",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "2px",
    overflow: "hidden",
    marginTop: "0.15rem",
  },
  progressFill: {
    height: "100%",
    borderRadius: "2px",
    transition: "width 0.3s",
  },

  // Detail
  detailTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-text)",
    margin: 0,
    lineHeight: 1.3,
  },
  detailDesc: {
    fontSize: "0.82rem",
    lineHeight: 1.6,
    color: "var(--color-muted)",
    whiteSpace: "pre-wrap",
    margin: 0,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    alignItems: "center",
    fontSize: "0.72rem",
    color: "var(--color-muted)",
  },
  sectionTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--color-text)",
    margin: "0.5rem 0 0.25rem 0",
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  },

  // Objective item
  objectiveItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.4rem",
    padding: "0.4rem 0.5rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.04)",
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    transition: "all 0.15s",
    minHeight: "38px",
    marginBottom: "0.25rem",
  },
  objectiveItemDone: {
    opacity: 0.5,
  },
  objectiveDesc: {
    fontSize: "0.8rem",
    color: "var(--color-text)",
    lineHeight: 1.4,
  },
  objectiveDescDone: {
    textDecoration: "line-through",
    color: "var(--color-muted)",
  },
  objectiveType: {
    fontSize: "0.62rem",
    color: "var(--color-accent)",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.3px",
  },
  objectiveProgress: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
  },

  // Rewards pill
  rewardPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.2rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 500,
    borderRadius: "8px",
    background: "rgba(251, 191, 36, 0.08)",
    border: "1px solid rgba(251, 191, 36, 0.15)",
    color: "#fbbf24",
  },
  rewardXp: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.2rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 500,
    borderRadius: "8px",
    background: "rgba(99, 102, 241, 0.08)",
    border: "1px solid rgba(99, 102, 241, 0.15)",
    color: "#818cf8",
  },
  rewardItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.2rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 500,
    borderRadius: "8px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "var(--color-text)",
  },

  // Detail actions
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.4rem 0.7rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    borderRadius: "8px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-text)",
    cursor: "pointer",
    minHeight: "38px",
    transition: "all 0.2s",
  },
  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.35rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "8px",
    cursor: "pointer",
    minHeight: "34px",
    transition: "all 0.15s",
    border: "1px solid transparent",
  },
  editBtn: {
    background: "rgba(200,151,58,0.1)",
    borderColor: "rgba(200,151,58,0.25)",
    color: "var(--color-accent)",
  },
  deleteBtn: {
    background: "rgba(235,87,87,0.1)",
    borderColor: "rgba(235,87,87,0.25)",
    color: "var(--color-danger)",
  },
  assignBtn: {
    background: "rgba(99, 102, 241, 0.1)",
    borderColor: "rgba(99, 102, 241, 0.25)",
    color: "#818cf8",
  },

  // Editor
  editorBody: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  label: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-text)",
    marginBottom: "0.2rem",
  },
  input: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    fontSize: "0.82rem",
    outline: "none",
    minHeight: "38px",
    boxSizing: "border-box",
    width: "100%",
  },
  textarea: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    fontSize: "0.8rem",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: 1.5,
    boxSizing: "border-box",
    minHeight: "72px",
    width: "100%",
  },
  select: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    fontSize: "0.82rem",
    outline: "none",
    minHeight: "38px",
    cursor: "pointer",
    width: "100%",
  },
  fieldRow: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.3rem",
    padding: "0.45rem 0.85rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    minHeight: "38px",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
    color: "#fffffe",
  },
  btnGhost: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-text)",
  },
  btnDanger: {
    background: "rgba(235,87,87,0.1)",
    border: "1px solid rgba(235,87,87,0.25)",
    color: "var(--color-danger)",
  },
  btnSmall: {
    padding: "0.3rem 0.55rem",
    fontSize: "0.7rem",
    minHeight: "30px",
  },

  // Objective editor
  objectivesList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  rewardsGrid: {
    display: "flex",
    gap: "0.75rem",
    flexWrap: "wrap",
  },

  // Assign section
  assignSection: {
    marginBottom: "0.75rem",
    padding: "0.5rem",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  charTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.15rem 0.4rem",
    fontSize: "0.72rem",
    borderRadius: "4px",
    background: "rgba(99,102,241,0.15)",
    color: "var(--color-text)",
  },

  // Player card
  playerCard: {
    padding: "0.75rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.02)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  playerCardTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--color-text)",
    margin: 0,
  },
  questChainNote: {
    fontSize: "0.7rem",
    color: "var(--color-accent)",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },

  // Detail header row
  detailHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
    flexWrap: "wrap",
    marginBottom: "0.5rem",
  },
  detailActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    flexWrap: "wrap",
  },
  editorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  cancelBtn: {
    padding: "0.4rem 0.75rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    borderRadius: "8px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "var(--color-text)",
    cursor: "pointer",
    minHeight: "38px",
    transition: "all 0.2s",
  },
  saveBtn: {
    padding: "0.4rem 1rem",
    fontSize: "0.78rem",
    fontWeight: 700,
    borderRadius: "8px",
    background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
    border: "none",
    color: "#fffffe",
    cursor: "pointer",
    minHeight: "38px",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  },
};

// ═════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════

function QuestCard({ quest, isSelected, onClick }) {
  const objectives = parseArr(quest.objectives);
  const completed = objectives.filter((o) => o.isComplete).length;
  const total = objectives.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const statusInfo = getStatusStyle(quest.status);

  return (
    <div
      onClick={onClick}
      style={{
        ...s.questCard,
        ...(isSelected ? s.questCardSelected : {}),
      }}
      className="touch-target"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <span style={s.questCardTitle}>{quest.title}</span>
      </div>
      <div style={s.questCardMeta}>
        <span
          style={{
            ...s.statusBadge,
            background: `${statusInfo.color}18`,
            color: statusInfo.color,
            border: `1px solid ${statusInfo.color}30`,
          }}
        >
          {statusInfo.label}
        </span>
        {total > 0 && (
          <span>
            {completed}/{total}
          </span>
        )}
      </div>
      {total > 0 && (
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: `${pct}%`, background: statusInfo.color }} />
        </div>
      )}
    </div>
  );
}

function ObjectiveEditor({ objectives, onChange }) {
  const addObjective = () => {
    onChange([...(objectives || []), { description: "", type: "KILL", isComplete: false, progress: 0, target: "" }]);
  };

  const removeObjective = (idx) => {
    const updated = [...(objectives || [])];
    updated.splice(idx, 1);
    onChange(updated);
  };

  const updateObjective = (idx, field, value) => {
    const updated = [...(objectives || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
        <span style={s.label}>Objectives</span>
        <button
          style={{ ...s.btn, ...s.btnSmall, ...s.btnGhost }}
          onClick={addObjective}
          className="touch-target"
          type="button"
        >
          <Plus size={10} /> Add
        </button>
      </div>
      <div style={s.objectivesList}>
        {(objectives || []).map((obj, idx) => (
          <div
            key={idx}
            style={{
              padding: "0.4rem",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.25rem" }}>
              <input
                style={{ ...s.input, flex: 1 }}
                value={obj.description || ""}
                onChange={(e) => updateObjective(idx, "description", e.target.value)}
                placeholder="Objective description"
                className="form-input"
              />
              <select
                style={{ ...s.select, minWidth: "90px", width: "auto" }}
                value={obj.type || "KILL"}
                onChange={(e) => updateObjective(idx, "type", e.target.value)}
                className="form-input"
              >
                {OBJECTIVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                style={{ ...s.btn, ...s.btnDanger, ...s.btnSmall }}
                onClick={() => removeObjective(idx)}
                className="touch-target"
                type="button"
              >
                <X size={10} />
              </button>
            </div>
            <div style={{ display: "flex", gap: "0.35rem", fontSize: "0.75rem", alignItems: "center" }}>
              <input
                style={{ ...s.input, width: "80px" }}
                value={obj.target || ""}
                onChange={(e) => updateObjective(idx, "target", e.target.value)}
                placeholder="Target"
                className="form-input"
              />
              <span style={{ fontSize: "0.68rem", color: "var(--color-muted)" }}>target</span>
              <input
                style={{ ...s.input, width: "60px" }}
                type="number"
                min="0"
                value={obj.progress ?? 0}
                onChange={(e) => updateObjective(idx, "progress", Number(e.target.value))}
                placeholder="Prog"
                className="form-input"
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  color: "var(--color-muted)",
                  cursor: "pointer",
                  fontSize: "0.72rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!obj.isComplete}
                  onChange={(e) => updateObjective(idx, "isComplete", e.target.checked)}
                />
                Done
              </label>
            </div>
          </div>
        ))}
        {(objectives || []).length === 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", fontStyle: "italic" }}>
            No objectives yet
          </div>
        )}
      </div>
    </div>
  );
}

function RewardsEditor({ rewards, onChange }) {
  const r = parseObj(rewards);

  const setField = (field, value) => {
    onChange({ ...r, [field]: value });
  };

  const addItem = () => {
    const items = [...(r.items || []), { name: "", quantity: 1 }];
    setField("items", items);
  };

  const removeItem = (idx) => {
    const items = [...(r.items || [])];
    items.splice(idx, 1);
    setField("items", items);
  };

  const updateItem = (idx, field, value) => {
    const items = [...(r.items || [])];
    items[idx] = { ...items[idx], [field]: field === "quantity" ? Number(value) : value };
    setField("items", items);
  };

  return (
    <div>
      <div style={s.label}>Rewards</div>
      <div style={s.rewardsGrid}>
        <div style={{ ...s.fieldRow, minWidth: "100px" }}>
          <span style={{ fontSize: "0.68rem", color: "var(--color-muted)" }}>XP</span>
          <input
            style={s.input}
            type="number"
            min="0"
            value={r.xp ?? ""}
            onChange={(e) => setField("xp", e.target.value ? Number(e.target.value) : 0)}
            placeholder="0"
            className="form-input"
          />
        </div>
        <div style={{ ...s.fieldRow, minWidth: "100px" }}>
          <span style={{ fontSize: "0.68rem", color: "var(--color-muted)" }}>Gold (GP)</span>
          <input
            style={s.input}
            type="number"
            min="0"
            value={r.gold ?? ""}
            onChange={(e) => setField("gold", e.target.value ? Number(e.target.value) : 0)}
            placeholder="0"
            className="form-input"
          />
        </div>
      </div>
      <div style={{ marginTop: "0.4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>Items</span>
          <button
            style={{ ...s.btn, ...s.btnSmall, ...s.btnGhost }}
            onClick={addItem}
            className="touch-target"
            type="button"
          >
            <Plus size={10} /> Add Item
          </button>
        </div>
        {(r.items || []).map((item, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              gap: "0.35rem",
              marginBottom: "0.25rem",
              alignItems: "center",
            }}
          >
            <input
              style={{ ...s.input, flex: 1 }}
              value={item.name || ""}
              onChange={(e) => updateItem(idx, "name", e.target.value)}
              placeholder="Item name"
              className="form-input"
            />
            <input
              style={{ ...s.input, width: "60px" }}
              type="number"
              min="1"
              value={item.quantity ?? 1}
              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
              placeholder="Qty"
              className="form-input"
            />
            <button
              style={{ ...s.btn, ...s.btnDanger, ...s.btnSmall }}
              onClick={() => removeItem(idx)}
              className="touch-target"
              type="button"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line unused-imports/no-unused-vars
export default function QuestLogPanel({ user, isPopout = false }) {
  const { socket } = useSocket();
  const { addToast } = useToast();
  const { showConfirm } = useConfirm();
  const isDm = user?.role === "DM";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  // ── State ──
  const [quests, setQuests] = useState([]);
  const [selectedQuestId, setSelectedQuestId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Notification badge: count of new quests since last viewed
  const [newQuestCount, setNewQuestCount] = useState(0);

  // Tab state (DM only: "list" | "create")
  const [dmTab, setDmTab] = useState("list");

  // Characters and NPCs for assignment / giver picker
  const [characters, setCharacters] = useState([]);
  const [npcs, setNpcs] = useState([]);

  // Create/Edit form
  const [editQuestId, setEditQuestId] = useState(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState("ACTIVE");
  const [formObjectives, setFormObjectives] = useState([]);
  const [formRewards, setFormRewards] = useState({});
  const [formVisible, setFormVisible] = useState(true);
  const [formNpcId, setFormNpcId] = useState("");
  const [formParentQuestId, setFormParentQuestId] = useState("");
  const [formAssignCharIds, setFormAssignCharIds] = useState([]);

  // ── Derived ──
  const selectedQuest = quests.find((q) => q.id === selectedQuestId) || null;

  // ── Fetch quests ──
  const fetchQuests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (!isDm) params.set("visible", "true");
      const res = await fetch(`/api/quests?${params.toString()}`, { headers: authHeaders });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to load quests.");
      }
      const data = await res.json();
      setQuests(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, statusFilter, isDm]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  // ── Fetch characters and NPCs (DM only) ──
  useEffect(() => {
    if (!isDm) return;
    const fetchResources = async () => {
      try {
        const [charRes, npcRes] = await Promise.all([
          fetch("/api/characters", { headers: authHeaders }),
          fetch("/api/npcs", { headers: authHeaders }),
        ]);
        if (charRes.ok) setCharacters(await charRes.json());
        if (npcRes.ok) setNpcs(await npcRes.json());
      } catch {
        // Non-critical
      }
    };
    fetchResources();
  }, [authHeaders, isDm]);

  // ── Socket listeners for real-time updates ──
  useEffect(() => {
    if (!socket) return;

    const handleQuestCreated = (data) => {
      if (data?.quest) {
        setQuests((prev) => [data.quest, ...prev]);
        // Show notification badge for all users
        setNewQuestCount((prev) => prev + 1);
        addToast(`New quest: ${data.quest.title}`, "info");
      }
    };

    const handleQuestUpdated = (data) => {
      if (data?.quest) {
        setQuests((prev) => prev.map((q) => (q.id === data.quest.id ? data.quest : q)));
        if (selectedQuestId === data.quest.id) {
          // Force re-render of detail view
        }
      }
    };

    const handleQuestDeleted = (data) => {
      if (data?.id != null) {
        setQuests((prev) => prev.filter((q) => q.id !== data.id));
        if (selectedQuestId === data.id) {
          setSelectedQuestId(null);
        }
      }
    };

    socket.on("quest:created", handleQuestCreated);
    socket.on("quest:updated", handleQuestUpdated);
    socket.on("quest:deleted", handleQuestDeleted);

    return () => {
      socket.off("quest:created", handleQuestCreated);
      socket.off("quest:updated", handleQuestUpdated);
      socket.off("quest:deleted", handleQuestDeleted);
    };
  }, [socket, selectedQuestId, addToast]);

  // ── Toggle objective ──
  const handleToggleObjective = async (objectiveIndex) => {
    if (!selectedQuestId || !isDm) return;
    try {
      const res = await fetch(`/api/quests/${selectedQuestId}/toggle-objective`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ objectiveIndex }),
      });
      if (!res.ok) throw new Error("Failed to toggle objective.");
      const updated = await res.json();
      setQuests((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      addToast("Objective toggled.", "success");
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  // ── Delete quest ──
  const handleDeleteQuest = async (questId) => {
    if (!isDm) return;
    const confirmed = await showConfirm("Delete this quest?", "This cannot be undone.");
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/quests/${questId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to delete quest.");
      }
      if (selectedQuestId === questId) setSelectedQuestId(null);
      setQuests((prev) => prev.filter((q) => q.id !== questId));
      addToast("Quest deleted.", "info");
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Assign characters ──
  const handleAssign = async () => {
    if (!selectedQuestId || !isDm) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/quests/${selectedQuestId}/assign`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: formAssignCharIds }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to assign quest.");
      }
      const updated = await res.json();
      setQuests((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      addToast("Quest assigned.", "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Save (create or update) ──
  const handleSave = async () => {
    if (!formTitle.trim()) {
      addToast("Title is required.", "warning");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: formTitle.trim(),
        description: formDescription,
        status: formStatus,
        objectives: formObjectives,
        rewards: formRewards,
        isVisibleToPlayers: formVisible,
      };
      if (formNpcId) body.questGiverNpcId = Number(formNpcId);
      if (formParentQuestId) body.parentQuestId = Number(formParentQuestId);

      let res;
      if (editQuestId) {
        res = await fetch(`/api/quests/${editQuestId}`, {
          method: "PUT",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/quests", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to save quest.");
      }

      const saved = await res.json();

      if (editQuestId) {
        setQuests((prev) => prev.map((q) => (q.id === saved.id ? saved : q)));
      } else {
        setQuests((prev) => [saved, ...prev]);
      }
      setSelectedQuestId(saved.id);

      addToast(editQuestId ? "Quest updated." : "Quest created.", "success");
      resetForm();
      setDmTab("list");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit existing quest ──
  const startEdit = (quest) => {
    setEditQuestId(quest.id);
    setFormTitle(quest.title);
    setFormDescription(quest.description || "");
    setFormStatus(quest.status);
    setFormObjectives(parseArr(quest.objectives));
    setFormRewards(parseObj(quest.rewards));
    setFormVisible(quest.isVisibleToPlayers !== false);
    setFormNpcId(quest.questGiverNpcId ? String(quest.questGiverNpcId) : "");
    setFormParentQuestId(quest.parentQuestId ? String(quest.parentQuestId) : "");
    setFormAssignCharIds(parseArr(quest.assignedToCharacterIds));
    setDmTab("create");
  };

  // ── Reset form ──
  const resetForm = () => {
    setEditQuestId(null);
    setFormTitle("");
    setFormDescription("");
    setFormStatus("ACTIVE");
    setFormObjectives([]);
    setFormRewards({});
    setFormVisible(true);
    setFormNpcId("");
    setFormParentQuestId("");
    setFormAssignCharIds([]);
  };

  // ── Select quest ──
  const handleSelectQuest = (quest) => {
    setSelectedQuestId(quest.id);
    setNewQuestCount(0);
    if (isDm) {
      setFormAssignCharIds(parseArr(quest.assignedToCharacterIds));
    }
  };

  // ── Render quest detail ──
  const renderQuestDetail = () => {
    if (!selectedQuest) {
      return (
        <div style={s.emptyState}>
          <BookOpen size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
          <div>Select a quest to view details</div>
        </div>
      );
    }

    const objectives = parseArr(selectedQuest.objectives);
    const rewards = parseObj(selectedQuest.rewards);
    const completed = objectives.filter((o) => o.isComplete).length;
    const total = objectives.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const statusInfo = getStatusStyle(selectedQuest.status);
    const assignedIds = parseArr(selectedQuest.assignedToCharacterIds);

    // Quest chain
    const parentQuest = quests.find((q) => q.id === selectedQuest.parentQuestId);
    const childQuests = quests.filter((q) => q.parentQuestId === selectedQuest.id);

    return (
      <div>
        {/* Header */}
        <div style={s.detailHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", flex: 1 }}>
            <h2 style={s.detailTitle}>{selectedQuest.title}</h2>
            <span
              style={{
                ...s.statusBadge,
                background: `${statusInfo.color}18`,
                color: statusInfo.color,
                border: `1px solid ${statusInfo.color}30`,
              }}
            >
              {statusInfo.label}
            </span>
          </div>
          <div style={s.detailActions}>
            {isDm && (
              <>
                <button
                  onClick={() => startEdit(selectedQuest)}
                  style={{ ...s.actionBtn, ...s.editBtn }}
                  className="touch-target btn-hover-scale"
                  title="Edit quest"
                >
                  <Edit3 size={14} />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => handleDeleteQuest(selectedQuest.id)}
                  style={{ ...s.actionBtn, ...s.deleteBtn }}
                  className="touch-target btn-hover-scale"
                  title="Delete quest"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        {selectedQuest.description && (
          <p style={s.detailDesc}>{selectedQuest.description}</p>
        )}

        {/* Meta row */}
        <div style={s.metaRow}>
          {selectedQuest.questGiverNpcId && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
              <MessageCircle size={12} />
              Giver: NPC #{selectedQuest.questGiverNpcId}
            </span>
          )}
          {selectedQuest.isVisibleToPlayers !== false && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.2rem", color: "var(--color-success)" }}>
              <Eye size={12} />
              Visible
            </span>
          )}
          {selectedQuest.isVisibleToPlayers === false && isDm && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.2rem", color: "var(--color-danger)" }}>
              <EyeOff size={12} />
              Hidden
            </span>
          )}
        </div>

        {/* Quest chain */}
        {parentQuest && (
          <div style={s.questChainNote}>
            <ChevronRight size={12} />
            Parent: {parentQuest.title}
          </div>
        )}
        {childQuests.length > 0 && childQuests.map((cq) => (
          <button
            key={cq.id}
            onClick={() => setSelectedQuestId(cq.id)}
            style={{ ...s.questChainNote, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            className="touch-target"
          >
            <ChevronRight size={12} />
            Child: {cq.title}
          </button>
        ))}

        {/* Progress */}
        {total > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: "0.2rem" }}>
              <span style={{ color: "var(--color-muted)" }}>Progress</span>
              <span style={{ fontWeight: 600 }}>{completed}/{total} ({pct}%)</span>
            </div>
            <div style={s.progressBar}>
              <div
                style={{
                  ...s.progressFill,
                  width: `${pct}%`,
                  background: pct === 100 ? "#22c55e" : "var(--color-accent)",
                }}
              />
            </div>
          </div>
        )}

        {/* Objectives */}
        {objectives.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <h3 style={s.sectionTitle}>
              <ListTodo size={14} />
              Objectives ({completed}/{total})
            </h3>
            {objectives.map((obj, idx) => {
              const isComplete = obj.isComplete || false;
              // eslint-disable-next-line unused-imports/no-unused-vars
              const ObjIcon = OBJECTIVE_TYPES.find((t) => t.value === obj.type)?.icon || Target;
              return (
                <div
                  key={idx}
                  onClick={() => isDm && handleToggleObjective(idx)}
                  style={{
                    ...s.objectiveItem,
                    ...(isComplete ? s.objectiveItemDone : {}),
                    ...(isDm ? { cursor: "pointer" } : {}),
                  }}
                  className={isDm ? "touch-target" : ""}
                >
                  <div style={{ flexShrink: 0, marginTop: "2px" }}>
                    {isComplete ? (
                      <CheckCircle size={16} style={{ color: "#22c55e" }} />
                    ) : (
                      <Circle size={16} style={{ color: "#6b7280" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...s.objectiveDesc, ...(isComplete ? s.objectiveDescDone : {}) }}>
                      {obj.description || `Objective ${idx + 1}`}
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginTop: "2px" }}>
                      <span style={s.objectiveType}>
                        {OBJ_TYPE_NAMES[obj.type] || obj.type}
                      </span>
                      {obj.target > 1 && (
                        <span style={s.objectiveProgress}>
                          {obj.progress || 0}/{obj.target}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rewards */}
        {(rewards.xp || rewards.gold || (rewards.items && rewards.items.length > 0)) && (
          <div style={{ marginTop: "0.5rem" }}>
            <h3 style={s.sectionTitle}>
              <Trophy size={14} />
              Rewards
            </h3>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {rewards.xp ? (
                <span style={s.rewardXp}>
                  <Trophy size={12} /> {rewards.xp} XP
                </span>
              ) : null}
              {rewards.gold ? (
                <span style={s.rewardPill}>
                  <Package size={12} /> {rewards.gold} GP
                </span>
              ) : null}
              {(rewards.items || []).map((item, i) => (
                <span key={i} style={s.rewardItem}>
                  {item.quantity}x {item.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Assigned characters (DM only) */}
        {isDm && (
          <div style={{ ...s.assignSection, marginTop: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.3rem" }}>
              <Users size={14} />
              <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Assigned Characters</span>
            </div>
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
              {assignedIds.length === 0 && (
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", fontStyle: "italic" }}>
                  None assigned
                </span>
              )}
              {assignedIds.map((cid) => {
                const char = characters.find((c) => c.id === cid);
                return <span key={cid} style={s.charTag}>{char?.name || `#${cid}`}</span>;
              })}
            </div>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <select
                style={{ ...s.select, width: "auto", flex: 1 }}
                value=""
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val && !formAssignCharIds.includes(val)) {
                    setFormAssignCharIds((prev) => [...prev, val]);
                  }
                }}
              >
                <option value="">Add character...</option>
                {characters
                  .filter((c) => !formAssignCharIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
              <button
                style={{ ...s.btn, ...s.assignBtn }}
                onClick={handleAssign}
                className="touch-target btn-hover-scale"
                disabled={saving}
              >
                <UserCheck size={14} /> Save
              </button>
            </div>
            {formAssignCharIds.length > 0 && (
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                {formAssignCharIds.map((cid) => {
                  const char = characters.find((c) => c.id === cid);
                  return (
                    <span key={cid} style={s.charTag}>
                      {char?.name || `#${cid}`}
                      <button
                        onClick={() => setFormAssignCharIds((prev) => prev.filter((id) => id !== cid))}
                        style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", padding: 0, marginLeft: "0.15rem", lineHeight: 1 }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: Loading skeleton
  // ═══════════════════════════════════════════════════════════════════════
  if (loading && quests.length === 0) {
    return (
      <div style={s.container} className="fade-in">
        <div style={s.panel} className="glass-panel gold-border-glow">
          <div style={s.loadingContainer}>
            <div style={s.spinner} />
            <span>Consulting the quest logs...</span>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: Editor (DM only)
  // ═══════════════════════════════════════════════════════════════════════
  if (dmTab === "create" && isDm) {
    return (
      <div style={s.container} className="fade-in">
        <div style={s.panel} className="glass-panel gold-border-glow">
          {/* Editor Header */}
          <div style={s.editorHeader}>
            <h2 style={s.detailTitle}>
              {editQuestId ? "Edit Quest" : "New Quest"}
            </h2>
            <div style={s.detailActions}>
              <button
                type="button"
                onClick={() => { resetForm(); setDmTab("list"); }}
                style={s.cancelBtn}
                className="touch-target"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={s.saveBtn}
                className="touch-target btn-hover-scale"
                disabled={saving}
              >
                <Save size={14} />
                {saving ? "Saving..." : "Save Quest"}
              </button>
            </div>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          {/* Editor Body */}
          <div style={s.editorBody}>
            {/* Title */}
            <div style={s.fieldRow}>
              <div style={s.label}>Title *</div>
              <input
                style={s.input}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Quest title"
                className="form-input"
              />
            </div>

            {/* Description */}
            <div style={s.fieldRow}>
              <div style={s.label}>Description</div>
              <textarea
                style={s.textarea}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe the quest..."
                rows={4}
                className="form-input"
              />
            </div>

            {/* Status / NPC / Parent */}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <div style={{ ...s.fieldRow, minWidth: "140px", flex: 1 }}>
                <div style={s.label}>Status</div>
                <select
                  style={s.select}
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="form-input"
                >
                  {STATUS_OPTIONS.map((sOpt) => (
                    <option key={sOpt.value} value={sOpt.value}>{sOpt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ ...s.fieldRow, minWidth: "140px", flex: 1 }}>
                <div style={s.label}>Quest Giver NPC</div>
                <select
                  style={s.select}
                  value={formNpcId}
                  onChange={(e) => setFormNpcId(e.target.value)}
                  className="form-input"
                >
                  <option value="">— None —</option>
                  {npcs.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ ...s.fieldRow, minWidth: "140px", flex: 1 }}>
                <div style={s.label}>Parent Quest</div>
                <select
                  style={s.select}
                  value={formParentQuestId}
                  onChange={(e) => setFormParentQuestId(e.target.value)}
                  className="form-input"
                >
                  <option value="">— None —</option>
                  {quests
                    .filter((q) => q.id !== editQuestId)
                    .map((q) => (
                      <option key={q.id} value={q.id}>{q.title}</option>
                    ))}
                </select>
              </div>
            </div>

            {/* Player visibility */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.82rem", color: "var(--color-text)" }}>
                <input
                  type="checkbox"
                  checked={formVisible}
                  onChange={(e) => setFormVisible(e.target.checked)}
                />
                {formVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                Visible to players
              </label>
            </div>

            {/* Objectives */}
            <ObjectiveEditor objectives={formObjectives} onChange={setFormObjectives} />

            {/* Rewards */}
            <RewardsEditor rewards={formRewards} onChange={setFormRewards} />
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: Main list + detail / Player view
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={s.container} className="fade-in">
      <div style={s.panel} className="glass-panel gold-border-glow">
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.headerTitle}>
            <BookOpen size={18} />
            {isDm ? "Quest Log" : "Journal"}
            {newQuestCount > 0 && (
              <span style={s.notificationDot} title={`${newQuestCount} new quest${newQuestCount > 1 ? "s" : ""}`} />
            )}
          </h2>

          {/* Status filter */}
          <div style={s.statusFilter}>
            {["ALL", ...STATUS_OPTIONS.map((sOpt) => sOpt.value)].map((val) => (
              <button
                key={val}
                style={{
                  ...s.statusFilterBtn,
                  ...(statusFilter === val ? s.statusFilterActive : {}),
                }}
                onClick={() => setStatusFilter(val)}
                className="touch-target"
              >
                {val === "ALL" ? "All" : (STATUS_MAP[val]?.label || val)}
              </button>
            ))}
          </div>

          {/* DM tab toggle */}
          {isDm && (
            <div style={s.tabBar}>
              <button
                style={{ ...s.tabBtn, ...(dmTab === "list" ? s.tabBtnActive : {}) }}
                onClick={() => { setDmTab("list"); resetForm(); }}
                className="touch-target"
              >
                <List size={12} style={{ marginRight: "0.25rem" }} />
                Quests
              </button>
              <button
                style={{ ...s.tabBtn, ...(dmTab === "create" ? s.tabBtnActive : {}) }}
                onClick={() => { resetForm(); setDmTab("create"); }}
                className="touch-target"
              >
                <Plus size={12} style={{ marginRight: "0.25rem" }} />
                New Quest
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && <div style={s.errorBox}>{error}</div>}

        {/* Loading overlay for refresh */}
        {loading && quests.length > 0 && (
          <div style={{ ...s.loadingContainer, padding: "0.5rem 0" }}>
            <div style={s.spinner} />
            <span>Refreshing...</span>
          </div>
        )}

        {/* Layout: sidebar + detail */}
        <div style={s.layout}>
          {/* Sidebar - quest list */}
          <div style={s.sidebar}>
            {quests.length === 0 && !loading && (
              <div style={s.emptyState}>
                {isDm ? "No quests yet. Create one!" : "No quests available."}
              </div>
            )}
            {quests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                isSelected={selectedQuestId === quest.id}
                onClick={() => handleSelectQuest(quest)}
              />
            ))}
          </div>

          {/* Detail panel */}
          <div style={s.detailPanel}>
            {renderQuestDetail()}
          </div>
        </div>
      </div>
    </div>
  );
}
