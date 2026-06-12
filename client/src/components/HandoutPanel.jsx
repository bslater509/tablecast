// =============================================================================
// Tablecast  Player Handouts Panel (T8)
// Allows DM to create and manage handouts targeted at specific characters.
// Players view handouts targeted at them, mark as read, get socket notifs.
// =============================================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Edit3,
  Mail,
  MailOpen,
  Send,
  Image,
  Users,
  ChevronLeft,
  CheckCircle,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import { compileMarkdown } from "../utils/markdown";

export default function HandoutPanel({ user, isPopout = false }) {
  const { socket } = useSocket();
  const { addToast } = useToast();
  const { showConfirm } = useConfirm();
  const isDm = user?.role === "DM";

  // ─── Data State ───────────────────────────────────────────────────────────
  const [handouts, setHandouts] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // ─── View State ───────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState("list"); // "list" | "detail" | "create" | "edit"
  const [selectedHandout, setSelectedHandout] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  // ─── Form State (DM create/edit) ──────────────────────────────────────────
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formTargetIds, setFormTargetIds] = useState([]);
  const [editorTab, setEditorTab] = useState("write"); // "write" | "preview"

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function parseTargetIds(handout) {
    try {
      const parsed = JSON.parse(handout.targetCharacterIds || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getTargetNames(handout) {
    const ids = parseTargetIds(handout);
    if (ids.length === 0) return "All players";
    return ids
      .map((id) => {
        const c = characters.find((ch) => ch.id === id);
        return c ? c.name : `#${id}`;
      })
      .filter(Boolean)
      .join(", ");
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function previewText(text) {
    if (!text) return "";
    const plain = text.replace(/[#*_~>[]]/g, "").trim();
    if (plain.length <= 100) return plain;
    return `${plain.slice(0, 100)}\u2026`;
  }

  // ─── Fetch characters (for target selection) ──────────────────────────────
  const fetchCharacters = useCallback(async () => {
    try {
      const res = await fetch("/api/characters", { headers: authHeaders });
      if (res.ok) setCharacters(await res.json());
    } catch {
      // Non-critical
    }
  }, [authHeaders]);

  // ─── Fetch handouts ───────────────────────────────────────────────────────
  const fetchHandouts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/handouts", { headers: authHeaders });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load handouts.");
      }
      const data = await res.json();
      setHandouts(data);
      setUnreadCount(data.filter((h) => !h.isRead).length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  // ─── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    fetchHandouts();
    fetchCharacters();
  }, [fetchHandouts, fetchCharacters]);

  // ─── Socket listener for new handouts ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    function onNewHandout(data) {
      if (!data?.handout) return;
      setHandouts((prev) => [data.handout, ...prev]);
      setUnreadCount((prev) => prev + 1);
      addToast(`New handout: ${data.handout.title}`, "info", 5000);
    }

    function onHandoutRead(data) {
      if (data?.id == null) return;
      setHandouts((prev) =>
        prev.map((h) => (h.id === data.id ? { ...h, isRead: !!data.isRead } : h))
      );
      setSelectedHandout((prev) =>
        prev?.id === data.id ? { ...prev, isRead: !!data.isRead } : prev
      );
      setUnreadCount((prev) => Math.max(0, prev - (data.isRead ? 1 : 0)));
    }

    socket.on("handout:new", onNewHandout);
    socket.on("handout:read", onHandoutRead);

    return () => {
      socket.off("handout:new", onNewHandout);
      socket.off("handout:read", onHandoutRead);
    };
  }, [socket, addToast]);

  // ─── Filtered & searched handouts ─────────────────────────────────────────
  const filteredHandouts = useMemo(() => {
    if (!searchQuery.trim()) return handouts;
    const q = searchQuery.toLowerCase();
    return handouts.filter((h) => {
      const titleMatch = h.title.toLowerCase().includes(q);
      const contentMatch = (h.content || "").toLowerCase().includes(q);
      return titleMatch || contentMatch;
    });
  }, [handouts, searchQuery]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleSelectHandout(handout) {
    setSelectedHandout(handout);
    setViewMode("detail");
  }

  function handleBackToList() {
    setSelectedHandout(null);
    setViewMode("list");
  }

  function handleStartCreate() {
    setFormTitle("");
    setFormContent("");
    setFormImageUrl("");
    setFormTargetIds([]);
    setEditorTab("write");
    setError(null);
    setViewMode("create");
  }

  function handleStartEdit(handout) {
    setFormTitle(handout.title);
    setFormContent(handout.content || "");
    setFormImageUrl(handout.imageUrl || "");
    setFormTargetIds(parseTargetIds(handout));
    setEditorTab("write");
    setError(null);
    setSelectedHandout(handout);
    setViewMode("edit");
  }

  function handleToggleTarget(charId) {
    setFormTargetIds((prev) =>
      prev.includes(charId)
        ? prev.filter((id) => id !== charId)
        : [...prev, charId]
    );
  }

  // ─── Create or Update handout ────────────────────────────────────────────
  async function handleSave() {
    if (!formTitle.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);

      const isEdit = viewMode === "edit";
      const url = isEdit
        ? `/api/handouts/${selectedHandout.id}`
        : "/api/handouts";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent,
          imageUrl: formImageUrl,
          targetCharacterIds: formTargetIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save handout.");
      }

      const handout = await res.json();

      if (isEdit) {
        setHandouts((prev) =>
          prev.map((h) => (h.id === handout.id ? handout : h))
        );
        setSelectedHandout(handout);
        setViewMode("detail");
        addToast("Handout updated!", "success");
      } else {
        setHandouts((prev) => [handout, ...prev]);
        setViewMode("list");
        addToast("Handout created!", "success");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete handout ──────────────────────────────────────────────────────
  async function handleDelete(handout) {
    const confirmed = await showConfirm(
      `Delete "${handout.title}"?`,
      "This action cannot be undone."
    );
    if (!confirmed) return;
    try {
      setError(null);
      const res = await fetch(`/api/handouts/${handout.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete handout.");
      }
      setHandouts((prev) => prev.filter((h) => h.id !== handout.id));
      if (selectedHandout?.id === handout.id) {
        setSelectedHandout(null);
        setViewMode("list");
      }
      addToast("Handout deleted.", "success");
    } catch (err) {
      setError(err.message);
    }
  }

  // ─── Mark handout as read ────────────────────────────────────────────────
  async function handleMarkRead(handout) {
    if (handout.isRead) return;
    try {
      const res = await fetch(`/api/handouts/${handout.id}/mark-read`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to mark as read.");
      }
      const updated = await res.json();
      setHandouts((prev) =>
        prev.map((h) => (h.id === updated.id ? { ...h, isRead: true } : h))
      );
      setSelectedHandout((prev) =>
        prev?.id === updated.id ? { ...prev, isRead: true } : prev
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      addToast("Marked as read!", "success");
    } catch (err) {
      setError(err.message);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ ...styles.container, padding: isPopout ? "0" : "0.75rem" }} className="fade-in">
        <div style={styles.panel} className="glass-panel gold-border-glow">
          <div style={styles.skelHeader}>
            <div style={styles.skelLineWide} />
            <div style={styles.skelLineShort} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={styles.skelCard}>
                <div style={styles.skelLineMid} />
                <div style={styles.skelLineLong} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "create" || viewMode === "edit") {
    return renderForm();
  }

  if (viewMode === "detail" && selectedHandout) {
    return renderDetail();
  }

  return renderList();

  // ══════════════════════════════════════════════════════════════════════════
  // SUB-RENDER: Handout List
  // ══════════════════════════════════════════════════════════════════════════
  function renderList() {
    return (
      <div style={{ ...styles.container, padding: isPopout ? "0" : "0.75rem" }} className="fade-in">
        <div style={styles.panel} className="glass-panel gold-border-glow">
          {/* Header */}
          <div style={styles.listHeader}>
            <div style={styles.listTitleRow}>
              <FileText size={18} />
              <h2 style={styles.listTitle}>Handouts</h2>
              {unreadCount > 0 && (
                <span style={styles.badge}>{unreadCount}</span>
              )}
            </div>
            {isDm && (
              <button
                style={styles.createBtn}
                onClick={handleStartCreate}
                className="touch-target btn-hover-scale"
              >
                <Plus size={16} />
                <span>New Handout</span>
              </button>
            )}
          </div>

          {/* Error */}
          {error && <div style={styles.errorBanner}>{error}</div>}

          {/* Search */}
          <div style={styles.searchWrap}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search handouts..."
              style={styles.searchInput}
              className="form-input"
            />
          </div>

          {/* Empty state */}
          {!loading && filteredHandouts.length === 0 && (
            <div style={styles.emptyState}>
              <Mail size={36} />
              <p>
                {searchQuery
                  ? "No handouts match your search."
                  : isDm
                    ? "No handouts yet. Create one to share information with players!"
                    : "No handouts available yet."}
              </p>
            </div>
          )}

          {/* Handout cards */}
          {filteredHandouts.length > 0 && (
            <div style={styles.listScroll}>
              {filteredHandouts.map((handout) => {
                const targets = getTargetNames(handout);
                return (
                  <div
                    key={handout.id}
                    onClick={() => handleSelectHandout(handout)}
                    style={{
                      ...styles.handoutCard,
                      ...(!handout.isRead ? styles.handoutCardUnread : {}),
                    }}
                    className="touch-target btn-hover-scale"
                  >
                    <div style={styles.cardTop}>
                      <div style={styles.cardTitleRow}>
                        <span style={styles.cardIcon}>
                          {handout.isRead ? (
                            <MailOpen size={14} />
                          ) : (
                            <Mail size={14} />
                          )}
                        </span>
                        <span style={styles.cardTitle}>{handout.title}</span>
                        {!handout.isRead && <span style={styles.unreadDot} />}
                      </div>
                      <div style={styles.cardMeta}>
                        {formatDate(handout.createdAt)}
                        {handout.imageUrl && " \uD83D\uDCCE"}
                      </div>
                    </div>
                    <div style={styles.cardPreview}>
                      {previewText(handout.content) || (
                        <span style={{ fontStyle: "italic" }}>No content</span>
                      )}
                    </div>
                    <div style={styles.cardTarget}>
                      <Users size={10} />
                      <span>{targets}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUB-RENDER: Handout Detail View
  // ══════════════════════════════════════════════════════════════════════════
  function renderDetail() {
    const h = selectedHandout;
    const targetNames = getTargetNames(h);

    return (
      <div style={{ ...styles.container, padding: isPopout ? "0" : "0.75rem" }} className="fade-in">
        <div style={styles.panel} className="glass-panel gold-border-glow">
          {/* Back + Actions */}
          <div style={styles.detailTop}>
            <button
              style={styles.backBtn}
              onClick={handleBackToList}
              className="touch-target btn-hover-scale"
            >
              <ChevronLeft size={18} />
              <span>Back</span>
            </button>
            <div style={styles.detailActions}>
              {!h.isRead && !isDm && (
                <button
                  style={styles.readBtn}
                  onClick={() => handleMarkRead(h)}
                  className="touch-target btn-hover-scale"
                >
                  <MailOpen size={14} />
                  <span>Mark Read</span>
                </button>
              )}
              {h.isRead && (
                <span style={styles.readBadge}>
                  <CheckCircle size={14} />
                  <span>Read</span>
                </span>
              )}
              {isDm && (
                <>
                  <button
                    style={styles.editBtn}
                    onClick={() => handleStartEdit(h)}
                    className="touch-target btn-hover-scale"
                    title="Edit"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    style={styles.deleteBtn}
                    onClick={() => handleDelete(h)}
                    className="touch-target btn-hover-scale"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={styles.detailBody}>
            <h1 style={styles.detailTitle}>{h.title}</h1>
            <div style={styles.metaRow}>
              <span style={styles.metaItem}>
                <FileText size={12} />
                {formatDate(h.createdAt)}
              </span>
              <span style={styles.metaItem}>
                <Users size={12} />
                {targetNames}
              </span>
            </div>

            {h.imageUrl && (
              <div style={styles.imageWrap}>
                <img
                  src={h.imageUrl}
                  alt={h.title}
                  style={styles.image}
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>
            )}

            <div
              className="wiki-content"
              style={styles.contentBody}
              dangerouslySetInnerHTML={{
                __html: h.content
                  ? compileMarkdown(h.content)
                  : "<p style='color:var(--color-muted)'>No content.</p>",
              }}
            />

            {!h.isRead && !isDm && (
              <button
                style={{ ...styles.readBtn, alignSelf: "flex-start" }}
                onClick={() => handleMarkRead(h)}
                className="touch-target btn-hover-scale"
              >
                <MailOpen size={14} />
                <span>Mark as Read</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUB-RENDER: DM Creation/Edit Form
  // ══════════════════════════════════════════════════════════════════════════
  function renderForm() {
    const isEdit = viewMode === "edit";

    return (
      <div style={{ ...styles.container, padding: isPopout ? "0" : "0.75rem" }} className="fade-in">
        <div style={styles.panel} className="glass-panel gold-border-glow">
          {/* Header */}
          <div style={styles.formHeader}>
            <div style={styles.formHeaderLeft}>
              <button
                style={styles.backBtn}
                onClick={handleBackToList}
                className="touch-target btn-hover-scale"
              >
                <ChevronLeft size={18} />
              </button>
              <h2 style={styles.formTitle}>{isEdit ? "Edit Handout" : "New Handout"}</h2>
            </div>
            <button
              style={styles.saveBtn}
              onClick={handleSave}
              disabled={saving}
              className="touch-target btn-hover-scale"
            >
              <Send size={14} />
              <span>{saving ? "Saving..." : isEdit ? "Update" : "Send"}</span>
            </button>
          </div>

          {/* Error */}
          {error && <div style={styles.errorBanner}>{error}</div>}

          {/* Write / Preview Tabs */}
          <div style={styles.tabRow}>
            <button
              onClick={() => setEditorTab("write")}
              style={{
                ...styles.tab,
                ...(editorTab === "write" ? styles.tabActive : {}),
              }}
              className="touch-target"
            >
              Write
            </button>
            <button
              onClick={() => setEditorTab("preview")}
              style={{
                ...styles.tab,
                ...(editorTab === "preview" ? styles.tabActive : {}),
              }}
              className="touch-target"
            >
              Preview
            </button>
          </div>

          {editorTab === "preview" ? (
            /* ── Preview ─────────────────────────────────── */
            <div style={styles.previewBody}>
              <h2 style={styles.detailTitle}>{formTitle || "Untitled"}</h2>

              {formImageUrl && (
                <div style={styles.imageWrap}>
                  <img
                    src={formImageUrl}
                    alt={formTitle}
                    style={styles.image}
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                </div>
              )}

              <div
                className="wiki-content"
                style={styles.contentBody}
                dangerouslySetInnerHTML={{
                  __html: compileMarkdown(formContent || "*No content yet.*"),
                }}
              />

              <div style={styles.previewTargets}>
                <strong>Targets:</strong>{" "}
                {formTargetIds.length === 0
                  ? "All Players"
                  : formTargetIds
                      .map((id) => characters.find((c) => c.id === id)?.name || `#${id}`)
                      .join(", ")}
              </div>
            </div>
          ) : (
            /* ── Form ────────────────────────────────────── */
            <div style={styles.formBody}>
              {/* Title */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Title *</label>
                <input
                  type="text"
                  style={styles.input}
                  className="form-input"
                  placeholder="Handout title..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {/* Content */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Content
                  <span style={styles.labelHint}> (markdown supported)</span>
                </label>
                <textarea
                  style={styles.textarea}
                  className="form-input"
                  placeholder="Write handout content using Markdown..."
                  rows={10}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>

              {/* Image URL */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  <Image size={14} /> Image URL (optional)
                </label>
                <input
                  type="text"
                  style={styles.input}
                  className="form-input"
                  placeholder="https://example.com/image.png"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                />
                {formImageUrl && (
                  <div style={styles.imagePreviewWrap}>
                    <img
                      src={formImageUrl}
                      alt="Preview"
                      style={styles.imagePreview}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Target Character Selection */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  <Users size={14} /> Target Characters
                </label>
                <p style={styles.hintText}>
                  Select which characters receive this handout. Leave empty for all players.
                </p>
                <div style={styles.charGrid}>
                  {characters.length === 0 && (
                    <p style={styles.hintText}>
                      No characters found. Create characters first.
                    </p>
                  )}
                  {characters.map((c) => {
                    const selected = formTargetIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleToggleTarget(c.id)}
                        style={{
                          ...styles.charChip,
                          ...(selected ? styles.charChipSelected : {}),
                        }}
                        className="touch-target"
                      >
                        <Users size={12} style={{ opacity: 0.6 }} />
                        <span>{c.name}</span>
                        {selected && <span style={styles.charCheck}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                <p style={styles.hintText}>
                  {formTargetIds.length === 0
                    ? "Currently: All Players"
                    : `Selected: ${formTargetIds.length} character${formTargetIds.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════════════════
const styles = {
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

  // ── Skeleton ───────────────────────────────────────────────────────────
  skelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  skelLineWide: {
    width: "40%",
    height: 18,
    borderRadius: 6,
    background: "rgba(255,255,255,0.06)",
  },
  skelLineShort: {
    width: "22%",
    height: 32,
    borderRadius: 9999,
    background: "rgba(255,255,255,0.06)",
  },
  skelCard: {
    padding: "0.75rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  skelLineMid: {
    width: "52%",
    height: 14,
    borderRadius: 6,
    background: "rgba(255,255,255,0.06)",
  },
  skelLineLong: {
    width: "82%",
    height: 10,
    borderRadius: 6,
    background: "rgba(255,255,255,0.04)",
  },

  // ── List ───────────────────────────────────────────────────────────────
  listHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
  },
  listTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  listTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-text)",
    margin: 0,
  },
  badge: {
    background: "var(--color-accent, #d4a843)",
    color: "#000",
    fontSize: "11px",
    fontWeight: 800,
    padding: "1px 7px",
    borderRadius: "10px",
    lineHeight: "18px",
    minWidth: "20px",
    textAlign: "center",
  },
  createBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.4rem 0.75rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    borderRadius: "9999px",
    background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
    color: "#fffffe",
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: "38px",
    minWidth: "44px",
    transition: "all 0.2s",
  },
  searchWrap: {
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    padding: "0.5rem 0.75rem",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    fontSize: "0.82rem",
    outline: "none",
    boxSizing: "border-box",
    minHeight: "40px",
  },
  listScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    paddingRight: "0.25rem",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    color: "var(--color-muted)",
    padding: "2rem 1rem",
    textAlign: "center",
    fontSize: "0.85rem",
  },
  handoutCard: {
    padding: "0.75rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.06)",
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    background: "rgba(255,255,255,0.02)",
  },
  handoutCardUnread: {
    borderLeft: "3px solid var(--color-accent)",
    background: "rgba(212, 168, 67, 0.04)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "0.5rem",
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    flex: 1,
    minWidth: 0,
  },
  cardIcon: {
    flexShrink: 0,
    color: "var(--color-muted)",
    marginTop: "1px",
  },
  cardTitle: {
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "var(--color-text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--color-accent)",
    flexShrink: 0,
  },
  cardMeta: {
    fontSize: "0.68rem",
    color: "var(--color-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  cardPreview: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    lineHeight: 1.4,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  cardTarget: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.68rem",
    color: "var(--color-muted)",
  },

  // ── Error Banner ───────────────────────────────────────────────────────
  errorBanner: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    background: "rgba(235, 87, 87, 0.1)",
    border: "1px solid rgba(235, 87, 87, 0.25)",
    color: "var(--color-danger)",
    fontSize: "0.78rem",
    fontWeight: 500,
    flexShrink: 0,
  },

  // ── Detail View ────────────────────────────────────────────────────────
  detailTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  detailActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
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
    minWidth: "44px",
    transition: "all 0.2s",
  },
  readBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.35rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "8px",
    background: "rgba(111, 207, 151, 0.1)",
    border: "1px solid rgba(111, 207, 151, 0.25)",
    color: "var(--color-success)",
    cursor: "pointer",
    minHeight: "34px",
    minWidth: "44px",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  },
  readBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.35rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "8px",
    background: "rgba(111, 207, 151, 0.08)",
    border: "1px solid rgba(111, 207, 151, 0.15)",
    color: "var(--color-success)",
    opacity: 0.8,
  },
  editBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.35rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "8px",
    background: "rgba(200,151,58,0.1)",
    border: "1px solid rgba(200,151,58,0.25)",
    color: "var(--color-accent)",
    cursor: "pointer",
    minHeight: "34px",
    minWidth: "44px",
    transition: "all 0.2s",
  },
  deleteBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.35rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "8px",
    background: "rgba(235,87,87,0.1)",
    border: "1px solid rgba(235,87,87,0.25)",
    color: "var(--color-danger)",
    cursor: "pointer",
    minHeight: "34px",
    minWidth: "44px",
    transition: "all 0.2s",
  },
  detailBody: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  detailTitle: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "var(--color-text)",
    margin: 0,
    lineHeight: 1.3,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    alignItems: "center",
  },
  metaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    fontSize: "0.72rem",
    color: "var(--color-muted)",
  },
  imageWrap: {
    borderRadius: "10px",
    overflow: "hidden",
    maxHeight: "300px",
  },
  image: {
    width: "100%",
    height: "auto",
    maxHeight: "300px",
    objectFit: "contain",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.2)",
  },
  contentBody: {
    fontSize: "0.85rem",
    lineHeight: 1.7,
    color: "var(--color-text)",
  },

  // ── Form ───────────────────────────────────────────────────────────────
  formHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  formHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  formTitle: {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "var(--color-text)",
    margin: 0,
  },
  saveBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.4rem 1rem",
    fontSize: "0.78rem",
    fontWeight: 700,
    borderRadius: "8px",
    background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
    border: "none",
    color: "#fffffe",
    cursor: "pointer",
    minHeight: "38px",
    minWidth: "44px",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  },
  tabRow: {
    display: "flex",
    gap: "0.25rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: "0.5rem",
    flexShrink: 0,
  },
  tab: {
    padding: "0.35rem 0.85rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    borderRadius: "8px 8px 0 0",
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    cursor: "pointer",
    minHeight: "36px",
    transition: "all 0.15s",
  },
  tabActive: {
    color: "var(--color-accent)",
    background: "rgba(200,151,58,0.08)",
    borderBottom: "2px solid var(--color-accent)",
  },
  formBody: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
  },
  previewBody: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "var(--color-text)",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  labelHint: {
    fontWeight: 400,
    color: "var(--color-muted)",
    fontSize: "0.72rem",
  },
  hintText: {
    fontSize: "0.72rem",
    color: "var(--color-muted)",
    margin: "2px 0",
  },
  input: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    outline: "none",
    minHeight: "40px",
    boxSizing: "border-box",
  },
  textarea: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    fontSize: "0.82rem",
    outline: "none",
    resize: "vertical",
    fontFamily: "monospace",
    lineHeight: 1.5,
    boxSizing: "border-box",
    minHeight: "120px",
  },
  imagePreviewWrap: {
    marginTop: "0.35rem",
    borderRadius: "8px",
    overflow: "hidden",
    maxHeight: "160px",
  },
  imagePreview: {
    width: "100%",
    height: "auto",
    maxHeight: "160px",
    objectFit: "contain",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  charGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem",
  },
  charChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.35rem 0.6rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    borderRadius: "9999px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    cursor: "pointer",
    minHeight: "34px",
    transition: "all 0.15s",
  },
  charChipSelected: {
    borderColor: "rgba(200,151,58,0.4)",
    background: "rgba(200,151,58,0.1)",
    color: "var(--color-accent)",
  },
  charCheck: {
    color: "var(--color-accent)",
    fontWeight: 700,
    fontSize: "0.7rem",
  },
  previewTargets: {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
    padding: "0.5rem 0.75rem",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
};
