// =============================================================================
// Tablecast — Encounter Panel Styles
// Styles object for the Encounter Initiative Tracker Panel.
// =============================================================================

/* Colour helpers */
function hpColor(pct) {
  if (pct > 66) return "#22c55e";
  if (pct > 33) return "#eab308";
  return "#ef4444";
}

function badgeColor(status) {
  switch (status) {
    case "DRAFT":    return { bg: "#334155", fg: "#94a3b8" };
    case "ACTIVE":   return { bg: "#166534", fg: "#4ade80" };
    case "COMPLETE": return { bg: "#1e3a5f", fg: "#60a5fa" };
    default:         return { bg: "#334155", fg: "#94a3b8" };
  }
}

/* base input style (shared) */
const baseInput = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#0f1117",
  color: "#e2e8f0",
  fontSize: 14,
};

export const encounterStyles = {
  /* ---------- layout ---------- */
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: "#0f1117",
    color: "#e2e8f0",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid #1e293b",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    flex: 1,
  },
  /* ---------- map selector ---------- */
  mapBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 16px",
    borderBottom: "1px solid #1e293b",
    flexShrink: 0,
  },
  mapSelect: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: 14,
    minWidth: 0,
  },
  /* ---------- list ---------- */
  listArea: {
    flex: 1,
    overflowY: "auto",
    padding: 12,
  },
  card: {
    background: "#1a1f2e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    border: "1px solid #2d3748",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 48, /* touch target */
  },
  cardActive: {
    borderColor: "#4ade80",
    boxShadow: "0 0 0 1px #4ade80",
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: {
    fontSize: 15,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardMeta: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 20,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  /* ---------- detail header ---------- */
  detailHeader: {
    padding: "12px 16px",
    borderBottom: "1px solid #1e293b",
    flexShrink: 0,
  },
  detailNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  detailName: { fontSize: 20, fontWeight: 700, flex: 1, minWidth: 0 },
  detailMeta: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 4,
  },
  statusRow: {
    display: "flex",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  statusBtn: {
    padding: "4px 12px",
    borderRadius: 20,
    border: "1px solid #334155",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: "#1e293b",
    color: "#94a3b8",
  },
  statusBtnActive: (status) => ({
    padding: "4px 12px",
    borderRadius: 20,
    border: `1px solid ${badgeColor(status).fg}`,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: badgeColor(status).bg,
    color: badgeColor(status).fg,
  }),
  /* ---------- initiative table ---------- */
  tableWrap: {
    flex: 1,
    overflowY: "auto",
    padding: "0 12px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "8px 6px",
    borderBottom: "2px solid #334155",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#64748b",
    position: "sticky",
    top: 0,
    background: "#0f1117",
    zIndex: 1,
  },
  trRow: (isCurrent) => ({
    borderBottom: "1px solid #1e293b",
    background: isCurrent ? "rgba(74,222,128,0.08)" : "transparent",
    transition: "background 0.15s",
  }),
  td: {
    padding: "8px 6px",
    verticalAlign: "middle",
  },
  hpBarOuter: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    background: "#334155",
    overflow: "hidden",
    marginTop: 2,
  },
  hpBarInner: (pct) => ({
    height: "100%",
    width: `${Math.max(0, pct)}%`,
    background: hpColor(pct),
    transition: "width 0.3s",
    borderRadius: 3,
  }),
  hpBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 2px",
  },
  hpBtnSm: {
    width: 24,
    height: 24,
    borderRadius: 5,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 1px",
  },
  /* ---------- bottom bar ---------- */
  bottomBar: {
    padding: "10px 16px",
    borderTop: "1px solid #1e293b",
    display: "flex",
    gap: 8,
    flexShrink: 0,
    flexWrap: "wrap",
  },
  btnPrimary: {
    padding: "8px 18px",
    borderRadius: 10,
    border: "none",
    background: "#4ade80",
    color: "#0f1117",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
  btnSecondary: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
  btnDanger: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #7f1d1d",
    background: "#1e293b",
    color: "#ef4444",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
  /* ---------- add participant panel ---------- */
  addPanel: {
    padding: 12,
    borderBottom: "1px solid #1e293b",
    background: "#1a1f2e",
    flexShrink: 0,
  },
  addRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  input: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f1117",
    color: "#e2e8f0",
    fontSize: 14,
  },
  select: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f1117",
    color: "#e2e8f0",
    fontSize: 14,
  },
  /* ---------- AI modal ---------- */
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    background: "#1a1f2e",
    borderRadius: 16,
    border: "1px solid #334155",
    width: "100%",
    maxWidth: 500,
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: "0 0 16px 0",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  textarea: {
    ...baseInput,
    width: "100%",
    resize: "vertical",
    minHeight: 60,
    boxSizing: "border-box",
  },
  /* ---------- misc ---------- */
  empty: {
    textAlign: "center",
    padding: 40,
    color: "#64748b",
  },
  error: {
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 10,
    padding: "10px 14px",
    margin: "0 12px 10px",
    fontSize: 13,
    color: "#fca5a5",
  },
  initEdit: {
    width: 40,
    padding: "4px 6px",
    borderRadius: 6,
    border: "1px solid #4ade80",
    background: "#0f1117",
    color: "#e2e8f0",
    fontSize: 13,
    textAlign: "center",
  },
};

export { hpColor, badgeColor };
