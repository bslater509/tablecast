// =============================================================================
// Tablecast — Player Handouts Panel (Section 3.5)
// DM creates and manages handouts; players view and read them.
// Handouts can have markdown content, images, and be targeted at specific
// characters (empty targetCharacterIds = all players).
// =============================================================================
import { useState, useEffect, useMemo, useCallback } from "react";
import { marked } from "marked";
import { Image, Plus, Trash2, Edit3, ArrowLeft, FileText, CheckCircle, Users } from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const HANDOUT_CACHE_KEY = "tablecast.handouts.selectedId";

function HandoutsPanel({ user, readOnly = false, isPopout = false }) {
  const { addToast } = useToast();
  const { socket } = useSocket();
  const { showConfirm } = useConfirm();
  const isDm = user?.role === "DM" && !readOnly;

  // ── State ─────────────────────────────────────────────────────────────
  const [handouts, setHandouts] = useState([]);
  const [selectedHandout, setSelectedHandout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Editor state (DM only)
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null); // null = new handout
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editTargetIds, setEditTargetIds] = useState([]);
  const [editorTab, setEditorTab] = useState("write");

  // Character list for target selector (DM only)
  const [characters, setCharacters] = useState([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  // ── Fetch handouts ────────────────────────────────────────────────────
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

      // Restore previously selected handout
      const storedId = localStorage.getItem(HANDOUT_CACHE_KEY);
      if (storedId) {
        const match = data.find((h) => h.id === Number(storedId));
        if (match) setSelectedHandout(match);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  // ── Fetch characters for target selector ──────────────────────────────
  const fetchCharacters = useCallback(async () => {
    if (!isDm) return;
    try {
      const res = await fetch("/api/characters", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setCharacters(data);
      }
    } catch (err) {
      // Non-critical — character selector will just be empty
    }
  }, [authHeaders, isDm]);

  // ── Mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchHandouts();
    fetchCharacters();
  }, [fetchHandouts, fetchCharacters]);

  // ── Persist selected handout ──────────────────────────────────────────
  useEffect(() => {
    if (selectedHandout) {
      localStorage.setItem(HANDOUT_CACHE_KEY, String(selectedHandout.id));
    } else {
      localStorage.removeItem(HANDOUT_CACHE_KEY);
    }
  }, [selectedHandout]);

  // ── Real-time socket handlers ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleNew = (data) => {
      if (data?.handout) {
        setHandouts((prev) => [data.handout, ...prev]);
      }
    };

    const handleRead = (data) => {
      if (data?.id != null) {
        setHandouts((prev) =>
          prev.map((h) => (h.id === data.id ? { ...h, isRead: data.isRead } : h))
        );
        setSelectedHandout((prev) =>
          prev?.id === data.id ? { ...prev, isRead: data.isRead } : prev
        );
      }
    };

    socket.on("handout:new", handleNew);
    socket.on("handout:read", handleRead);

    return () => {
      socket.off("handout:new", handleNew);
      socket.off("handout:read", handleRead);
    };
  }, [socket]);

  // ── Editor helpers ────────────────────────────────────────────────────
  function openNewEditor() {
    setEditId(null);
    setEditTitle("");
    setEditContent("");
    setEditImageUrl("");
    setEditTargetIds([]);
    setEditorTab("write");
    setError(null);
    setIsEditing(true);
  }

  function openEditEditor(handout) {
    setEditId(handout.id);
    setEditTitle(handout.title);
    setEditContent(handout.content || "");
    setEditImageUrl(handout.imageUrl || "");
    let parsed = [];
    try {
      parsed = JSON.parse(handout.targetCharacterIds || "[]");
    } catch (e) { /* ignore */ }
    setEditTargetIds(parsed);
    setEditorTab("write");
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setError(null);
  }

  function toggleTargetChar(charId) {
    setEditTargetIds((prev) =>
      prev.includes(charId)
        ? prev.filter((id) => id !== charId)
        : [...prev, charId]
    );
  }

  // ── Save handout ──────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault();
    if (!editTitle.trim()) {
      setError("Title is required.");
      return;
    }

    const payload = {
      title: editTitle.trim(),
      content: editContent,
      imageUrl: editImageUrl.trim(),
      targetCharacterIds: editTargetIds,
    };

    const url = editId ? `/api/handouts/${editId}` : "/api/handouts";
    const method = editId ? "PUT" : "POST";

    try {
      setSaving(true);
      setError(null);
      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save handout.");
      }
      const saved = await res.json();

      // Update local state
      if (editId) {
        setHandouts((prev) => prev.map((h) => (h.id === saved.id ? saved : h)));
      } else {
        setHandouts((prev) => [saved, ...prev]);
      }
      setSelectedHandout(saved);
      setIsEditing(false);
      addToast(editId ? "Handout updated." : "Handout created.", "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Delete handout ────────────────────────────────────────────────────
  async function handleDelete(handout) {
    if (!handout) return;
    if (!(await showConfirm(`Delete "${handout.title}"?`, "This action cannot be undone."))) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/handouts/${handout.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete handout.");
      }
      setHandouts((prev) => prev.filter((h) => h.id !== handout.id));
      setSelectedHandout((prev) => (prev?.id === handout.id ? null : prev));
      addToast("Handout deleted.", "info");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Mark read ─────────────────────────────────────────────────────────
  async function handleMarkRead(handout) {
    if (!handout || handout.isRead) return;
    try {
      const res = await fetch(`/api/handouts/${handout.id}/mark-read`, {
        method: "POST",
        headers: authHeaders,
      });
      if (res.ok) {
        const updated = await res.json();
        setHandouts((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
        setSelectedHandout((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } catch (err) {
      // Non-critical — reading state syncs via socket eventually
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────
  const filteredHandouts = useMemo(() => {
    if (!searchQuery.trim()) return handouts;

    const query = searchQuery.toLowerCase();
    return handouts.filter((h) => {
      const titleMatch = h.title.toLowerCase().includes(query);
      const contentMatch = (h.content || "").toLowerCase().includes(query);
      return titleMatch || contentMatch;
    });
  }, [handouts, searchQuery]);

  // ── Parse target chars for display ────────────────────────────────────
  function getTargetNames(handout) {
    if (!handout) return "";
    let targets = [];
    try {
      targets = JSON.parse(handout.targetCharacterIds || "[]");
    } catch (e) { /* ignore */ }
    if (targets.length === 0) return "All players";
    return targets
      .map((id) => {
        const char = characters.find((c) => c.id === id);
        return char ? char.name : `#${id}`;
      })
      .join(", ");
  }

  // ── Parsed tags (for tags that might exist if added later) ────────────
  function parseTags(handout) {
    try {
      const t = JSON.parse(handout.tags || "[]");
      return Array.isArray(t) ? t : [];
    } catch { return []; }
  }

  // ── Format date ───────────────────────────────────────────────────────
  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // RENDER: Loading skeleton
  // ═════════════════════════════════════════════════════════════════════
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

  // ═════════════════════════════════════════════════════════════════════
  // RENDER: Editor (DM only)
  // ═════════════════════════════════════════════════════════════════════
  if (isEditing && isDm) {
    return (
      <div style={{ ...styles.container, padding: isPopout ? "0" : "0.75rem" }} className="fade-in">
        <div style={styles.panel} className="glass-panel gold-border-glow">
          {/* Editor Header */}
          <div style={styles.editorHeader}>
            <h2 style={styles.editorTitle}>
              {editId ? "Edit Handout" : "New Handout"}
            </h2>
            <div style={styles.editorActions}>
              <button
                type="button"
                onClick={cancelEdit}
                style={styles.cancelBtn}
                className="touch-target"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={styles.saveBtn}
                className="touch-target btn-hover-scale"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Handout"}
              </button>
            </div>
          </div>

          {error && <div style={styles.errorBanner}>{error}</div>}

          {/* Write / Preview Tabs */}
          <div style={styles.tabRow}>
            <button
              type="button"
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
              type="button"
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

          {/* Editor Form */}
          <form onSubmit={handleSave} style={styles.editorBody}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Title *</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={styles.input}
                className="form-input"
                placeholder="Handout title"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Image URL</label>
              <input
                type="text"
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                style={styles.input}
                className="form-input"
                placeholder="https://example.com/image.png (optional)"
              />
              {editImageUrl && (
                <div style={styles.imagePreviewWrap}>
                  <img
                    src={editImageUrl}
                    alt="Preview"
                    style={styles.imagePreview}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                </div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Content
                <span style={styles.labelHint}> (markdown supported)</span>
              </label>
              {editorTab === "write" ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  style={styles.textarea}
                  className="form-input"
                  placeholder="Write handout content here..."
                  rows={12}
                />
              ) : (
                <div
                  style={styles.previewBox}
                  className="wiki-content"
                  dangerouslySetInnerHTML={{
                    __html: editContent
                      ? marked.parse(editContent)
                      : "<p style='color:var(--color-muted)'>No content yet.</p>",
                  }}
                />
              )}
            </div>

            {/* Target Characters */}
            <div style={styles.formGroup}>
              <label style={styles.label}>
                Visible To
                <span style={styles.labelHint}>
                  {" "}(leave empty = all players)
                </span>
              </label>
              <div style={styles.charGrid}>
                {characters.length === 0 && (
                  <p style={styles.mutedText}>No characters available.</p>
                )}
                {characters.map((char) => {
                  const selected = editTargetIds.includes(char.id);
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => toggleTargetChar(char.id)}
                      style={{
                        ...styles.charChip,
                        ...(selected ? styles.charChipSelected : {}),
                      }}
                      className="touch-target"
                    >
                      <Users size={12} style={{ opacity: 0.6 }} />
                      <span>{char.name}</span>
                      {selected && <span style={styles.charCheck}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // RENDER: Handout Detail View
  // ═════════════════════════════════════════════════════════════════════
  if (selectedHandout) {
    const handout = selectedHandout;
    const targetInfo = getTargetNames(handout);
    const tags = parseTags(handout);

    return (
      <div style={{ ...styles.container, padding: isPopout ? "0" : "0.75rem" }} className="fade-in">
        <div style={styles.panel} className="glass-panel gold-border-glow">
          {/* Detail Header */}
          <div style={styles.detailHeader}>
            <button
              onClick={() => { setSelectedHandout(null); }}
              style={styles.backBtn}
              className="touch-target btn-hover-scale"
              title="Back to list"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <div style={styles.detailActions}>
              {/* Mark read (for non-DM or when not already read) */}
              {!handout.isRead && (
                <button
                  onClick={() => handleMarkRead(handout)}
                  style={styles.readBtn}
                  className="touch-target btn-hover-scale"
                  title="Mark as read"
                >
                  <CheckCircle size={14} />
                  <span>Mark Read</span>
                </button>
              )}
              {handout.isRead && (
                <span style={styles.readBadge}>
                  <CheckCircle size={14} />
                  <span>Read</span>
                </span>
              )}
              {isDm && (
                <>
                  <button
                    onClick={() => openEditEditor(handout)}
                    style={styles.editBtn}
                    className="touch-target btn-hover-scale"
                    title="Edit handout"
                  >
                    <Edit3 size={14} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(handout)}
                    style={styles.deleteBtn}
                    className="touch-target btn-hover-scale"
                    title="Delete handout"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Detail Body */}
          <div style={styles.detailBody}>
            <h1 style={styles.detailTitle}>{handout.title}</h1>

            {/* Meta row */}
            <div style={styles.metaRow}>
              <span style={styles.metaItem}>
                <FileText size={12} />
                {formatDate(handout.createdAt)}
              </span>
              <span style={styles.metaItem}>
                <Users size={12} />
                {targetInfo}
              </span>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div style={styles.tagRow}>
                {tags.map((tag, i) => (
                  <span key={i} style={styles.tag}>{tag}</span>
                ))}
              </div>
            )}

            {/* Image */}
            {handout.imageUrl && (
              <div style={styles.imageWrap}>
                <img
                  src={handout.imageUrl}
                  alt={handout.title}
                  style={styles.image}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              </div>
            )}

            {/* Content */}
            <div
              className="wiki-content"
              style={styles.contentBody}
              dangerouslySetInnerHTML={{
                __html: handout.content
                  ? marked.parse(handout.content)
                  : "<p style='color:var(--color-muted)'>No content.</p>",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // RENDER: Handout List View
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div style={{ ...styles.container, padding: isPopout ? "0" : "0.75rem" }} className="fade-in">
      <div style={styles.panel} className="glass-panel gold-border-glow">
        {/* List Header */}
        <div style={styles.listHeader}>
          <h2 style={styles.listTitle}>Handouts</h2>
          {isDm && (
            <button
              onClick={openNewEditor}
              style={styles.createBtn}
              className="touch-target btn-hover-scale"
            >
              <Plus size={16} />
              <span>New Handout</span>
            </button>
          )}
        </div>

        {/* Error Banner */}
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

        {/* Handout List */}
        <div style={styles.listScroll}>
          {filteredHandouts.length === 0 && (
            <p style={styles.emptyText}>
              {searchQuery
                ? "No handouts match your search."
                : "No handouts yet. DMs can create handouts for the party."}
            </p>
          )}

          {filteredHandouts.map((handout) => {
            const targetInfo = getTargetNames(handout);
            const excerpt = (handout.content || "")
              .replace(/[#*`>\[\]]/g, "")
              .slice(0, 120);

            return (
              <div
                key={handout.id}
                onClick={() => {
                  setSelectedHandout(handout);
                  if (!isDm && !handout.isRead) {
                    handleMarkRead(handout);
                  }
                }}
                style={{
                  ...styles.handoutCard,
                  ...(selectedHandout?.id === handout.id ? styles.handoutCardSelected : {}),
                }}
                className="glass-panel btn-hover-scale"
              >
                <div style={styles.cardHeader}>
                  <div style={styles.cardTitleRow}>
                    <h3 style={styles.cardTitle}>{handout.title}</h3>
                    {!handout.isRead && !isDm && (
                      <span style={styles.unreadDot} title="Unread" />
                    )}
                  </div>
                  <div style={styles.cardMeta}>
                    <span style={styles.cardDate}>
                      {formatDate(handout.createdAt)}
                    </span>
                    {handout.imageUrl && (
                      <span style={styles.cardHasImage} title="Has image">
                        <Image size={12} />
                      </span>
                    )}
                    {isDm && (
                      <span style={styles.cardTarget}>
                        <Users size={12} />
                        {targetInfo === "All players" ? "All" : targetInfo}
                      </span>
                    )}
                  </div>
                </div>
                {excerpt && (
                  <p style={styles.cardExcerpt}>
                    {excerpt}{handout.content.length > 120 ? "..." : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════════════
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

  // ── Skeleton ────────────────────────────────────────────────────────────
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

  // ── List Header ─────────────────────────────────────────────────────────
  listHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
  },
  listTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-text)",
    margin: 0,
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

  // ── Search ──────────────────────────────────────────────────────────────
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

  // ── List Scroll ─────────────────────────────────────────────────────────
  listScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    paddingRight: "0.25rem",
  },
  emptyText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.82rem",
    padding: "2rem 0",
    margin: 0,
  },

  // ── Handout Card ────────────────────────────────────────────────────────
  handoutCard: {
    padding: "0.75rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.06)",
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  handoutCardSelected: {
    borderColor: "rgba(200,151,58,0.35)",
    background: "rgba(200,151,58,0.06)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "0.5rem",
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "var(--color-text)",
    margin: 0,
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
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    flexShrink: 0,
  },
  cardDate: {
    fontSize: "0.68rem",
    color: "var(--color-muted)",
    whiteSpace: "nowrap",
  },
  cardHasImage: {
    display: "inline-flex",
    color: "var(--color-accent)",
    opacity: 0.6,
  },
  cardTarget: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.2rem",
    fontSize: "0.68rem",
    color: "var(--color-muted)",
    whiteSpace: "nowrap",
  },
  cardExcerpt: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    margin: 0,
    lineHeight: 1.4,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },

  // ── Error Banner ────────────────────────────────────────────────────────
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

  // ── Detail View ─────────────────────────────────────────────────────────
  detailHeader: {
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
  tagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
  },
  tag: {
    display: "inline-block",
    padding: "0.2rem 0.5rem",
    fontSize: "0.68rem",
    fontWeight: 500,
    borderRadius: "9999px",
    background: "rgba(200,151,58,0.1)",
    border: "1px solid rgba(200,151,58,0.15)",
    color: "var(--color-accent)",
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

  // ── Editor ─────────────────────────────────────────────────────────────
  editorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  editorTitle: {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "var(--color-text)",
    margin: 0,
  },
  editorActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
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
    minWidth: "44px",
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
  editorBody: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
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
  },
  labelHint: {
    fontWeight: 400,
    color: "var(--color-muted)",
    fontSize: "0.72rem",
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
  previewBox: {
    padding: "0.75rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.15)",
    fontSize: "0.85rem",
    lineHeight: 1.7,
    color: "var(--color-text)",
    minHeight: "120px",
    overflowY: "auto",
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
  mutedText: {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
    margin: 0,
  },
};

export default HandoutsPanel;
