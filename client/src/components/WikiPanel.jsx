// =============================================================================
// Tablecast — Wiki / Player Journal Panel (Phase 4)
// Allows players and DMs to view unlocked campaign logs, location info, and NPCs.
// Enables DMs to create, edit, and delete articles using a live Markdown preview editor.
// =============================================================================
import { useState, useEffect } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true,
});

export default function WikiPanel({ user }) {
  const [articles, setArticles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // DM Workspace Editor States
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null); // null = creating new article
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState([]);
  const [editIsVisible, setEditIsVisible] = useState(false);
  const [editorTab, setEditorTab] = useState("write"); // "write" | "preview"
  const [tagInput, setTagInput] = useState("");
  const [editorError, setEditorError] = useState(null);

  // Delete Confirmation Modal State
  const [articleToDelete, setArticleToDelete] = useState(null);

  // Determine if user has DM privileges
  const isDM = user?.role === "DM";

  const authHeaders = { "x-tablecast-user-id": String(user?.id || "") };
  const jsonAuthHeaders = { "Content-Type": "application/json", ...authHeaders };

  // Fetch articles on mount/user role change
  useEffect(() => {
    async function fetchArticles() {
      setLoading(true);
      setError(null);
      try {
        // Players only fetch visible articles, DMs get all
        const url = isDM ? "/api/wiki" : "/api/wiki?visible=true";
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) {
          throw new Error("Failed to load campaign records.");
        }
        const data = await res.json();
        setArticles(data);
      } catch (err) {
        console.error("[WikiPanel] Fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchArticles();
  }, [isDM]);

  // Filter list by search query
  const filteredArticles = articles.filter((article) => {
    const query = searchQuery.toLowerCase();
    const titleMatch = article.title.toLowerCase().includes(query);
    const contentMatch = article.content.toLowerCase().includes(query);
    
    // Parse tags array if valid
    let tagsMatch = false;
    try {
      const tags = JSON.parse(article.tags || "[]");
      tagsMatch = tags.some((t) => t.toLowerCase().includes(query));
    } catch (e) {}

    return titleMatch || contentMatch || tagsMatch;
  });

  // Markdown Compilation with DOMPurify XSS Sanitization
  function compileMarkdown(markdownText) {
    if (!markdownText) return "";
    try {
      const rawHtml = marked.parse(markdownText);
      return DOMPurify.sanitize(rawHtml);
    } catch (e) {
      console.error("[WikiPanel] Markdown parsing failed:", e);
      return "<p style='color:var(--color-danger);'>Failed to parse content.</p>";
    }
  }

  // Back button handler for reading view on mobile
  function handleBack() {
    setSelectedArticle(null);
  }

  // Create article triggers
  function handleStartCreate() {
    setEditId(null);
    setEditTitle("");
    setEditContent("");
    setEditTags([]);
    setEditIsVisible(false);
    setEditorTab("write");
    setTagInput("");
    setEditorError(null);
    setIsEditing(true);
  }

  // Edit article trigger
  function handleStartEdit(article) {
    setEditId(article.id);
    setEditTitle(article.title);
    setEditContent(article.content || "");
    let parsedTags = [];
    try {
      parsedTags = JSON.parse(article.tags || "[]");
    } catch (e) {}
    setEditTags(parsedTags);
    setEditIsVisible(article.isVisibleToPlayers);
    setEditorTab("write");
    setTagInput("");
    setEditorError(null);
    setIsEditing(true);
  }

  // Cancel edit
  function handleCancelEdit() {
    setIsEditing(false);
    setEditorError(null);
  }

  // Delete flow confirmation triggers
  function triggerDelete(article) {
    setArticleToDelete(article);
  }

  async function confirmDelete() {
    if (!articleToDelete) return;

    try {
      const res = await fetch(`/api/wiki/${articleToDelete.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete scroll.");
      }

      setArticles((prev) => prev.filter((a) => a.id !== articleToDelete.id));
      setSelectedArticle(null);
      setArticleToDelete(null);
    } catch (err) {
      console.error("[WikiPanel] Delete error:", err);
      // Inline visual error instead of blocking alert()
      setError(`Failed to delete scroll: ${err.message}`);
      setArticleToDelete(null);
    }
  }

  // Save changes (Create/Update)
  async function handleSave(e) {
    e.preventDefault();
    setEditorError(null);

    if (!editTitle.trim()) {
      setEditorError("Title is required.");
      return;
    }

    const payload = {
      title: editTitle.trim(),
      content: editContent,
      isVisibleToPlayers: editIsVisible,
      tags: JSON.stringify(editTags),
    };

    const url = editId ? `/api/wiki/${editId}` : "/api/wiki";
    const method = editId ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: jsonAuthHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save campaign article.");
      }

      const saved = await res.json();

      if (editId) {
        setArticles((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
        setSelectedArticle(saved);
      } else {
        setArticles((prev) => [saved, ...prev]);
        setSelectedArticle(saved);
      }
      setIsEditing(false);
    } catch (err) {
      console.error("[WikiPanel] Save error:", err);
      setEditorError(err.message);
    }
  }

  // Formatting Shortcuts Helper
  function insertText(prefix, suffix = "") {
    const textarea = document.getElementById("wiki-markdown-textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const replacement = prefix + selected + suffix;

    setEditContent(text.substring(0, start) + replacement + text.substring(end));

    // Refocus and set cursor range
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
    }, 0);
  }

  // Tag list typing helpers
  function handleTagKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const cleaned = tagInput.trim().replace(/,/g, "");
      if (cleaned && !editTags.includes(cleaned)) {
        setEditTags([...editTags, cleaned]);
      }
      setTagInput("");
    }
  }

  function handleTagBlur() {
    const cleaned = tagInput.trim().replace(/,/g, "");
    if (cleaned && !editTags.includes(cleaned)) {
      setEditTags([...editTags, cleaned]);
    }
    setTagInput("");
  }

  function removeTag(tagToRemove) {
    setEditTags(editTags.filter((t) => t !== tagToRemove));
  }

  // Templates
  const npcTemplate = `
### NPC Name
*Medium Humanoid, Alignment*
***
- **Armor Class** 10 (Natural Armor)
- **Hit Points** 10 (2d8 + 2)
- **Speed** 30 ft.
***
| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) |
***
- **Actions**
  - **Dagger.** *Melee Weapon Attack:* +2 to hit, reach 5 ft., one target. *Hit:* 4 (1d4 + 2) piercing damage.
`;

  const locationTemplate = `
### Location Name
*Category: Dungeon / Wilderness / Settlement*
***
> **Room Description**
> Enter details about the lighting, features, and immediate sensory descriptions that players discover.

- **Points of Interest:**
  - **Feature 1:** Description of feature 1.
  - **Feature 2:** Description of feature 2.
- **Key NPCs:** NPCs located in this setting.
- **Treasure/Secrets:** Details on loot, traps, or lore.
`;

  return (
    <div style={styles.container} className="fade-in">
      {isEditing ? (
        /*  DM WORKSPACE EDITOR  */
        <form onSubmit={handleSave} style={styles.editor} className="glass-panel gold-border-glow fade-in">
          <header style={styles.editorHeader}>
            <h2 style={styles.editorTitle}>
              {editId ? "Edit Campaign Scroll" : "Forge New Campaign Scroll"}
            </h2>
            <div style={styles.editorHeaderActions}>
              <button
                type="button"
                onClick={handleCancelEdit}
                style={styles.backBtn}
                className="touch-target"
              >
                Cancel
              </button>
              <button
                type="submit"
                style={styles.saveBtn}
                className="touch-target btn-hover-scale"
              >
                Save Scroll
              </button>
            </div>
          </header>

          <div style={styles.editorBody}>
            {editorError && <p style={styles.editorErrorText}>⚠️ {editorError}</p>}

            {/* Title & Visibility */}
            <div style={styles.formRow}>
              <div style={{ ...styles.formGroup, flex: 2 }}>
                <label style={styles.label}>Scroll Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Sword Coast Lore, Elminster, Old Owl Well"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={styles.input}
                  className="form-input"
                  required
                />
              </div>

              <div style={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  id="isVisibleToPlayers"
                  checked={editIsVisible}
                  onChange={(e) => setEditIsVisible(e.target.checked)}
                  style={styles.checkbox}
                />
                <label htmlFor="isVisibleToPlayers" style={styles.checkboxLabel}>
                  Visible to Players
                </label>
              </div>
            </div>

            {/* Tag chip manager */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Tags (Press Enter or Comma to add)</label>
              <div style={styles.tagChipsContainer} className="form-input">
                {editTags.map((tag) => (
                  <span key={tag} style={styles.editorTagChip}>
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      style={styles.tagChipRemove}
                      className="touch-target"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={editTags.length === 0 ? "e.g. NPC, Location, Quest..." : ""}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleTagBlur}
                  style={styles.tagInputField}
                />
              </div>
            </div>

            {/* Tab selection for Write / Live Preview */}
            <div style={styles.tabsContainer}>
              <button
                type="button"
                onClick={() => setEditorTab("write")}
                style={{
                  ...styles.tabBtn,
                  borderBottom: editorTab === "write" ? "2px solid var(--color-accent)" : "none",
                  color: editorTab === "write" ? "var(--color-accent)" : "var(--color-muted)",
                }}
                className="touch-target"
              >
                Write (Markdown)
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("preview")}
                style={{
                  ...styles.tabBtn,
                  borderBottom: editorTab === "preview" ? "2px solid var(--color-accent)" : "none",
                  color: editorTab === "preview" ? "var(--color-accent)" : "var(--color-muted)",
                }}
                className="touch-target"
              >
                Live Preview
              </button>
            </div>

            {editorTab === "write" ? (
              /* WRITE TAB WITH FORMATTING HELPERS */
              <div style={styles.workspaceWriteContainer}>
                {/* Toolbar */}
                <div style={styles.toolbar}>
                  <button
                    type="button"
                    title="Bold"
                    onClick={() => insertText("**", "**")}
                    style={styles.toolbarBtn}
                    className="touch-target"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    title="Italic"
                    onClick={() => insertText("*", "*")}
                    style={styles.toolbarBtn}
                    className="touch-target"
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    title="Header"
                    onClick={() => insertText("\n### ", "")}
                    style={styles.toolbarBtn}
                    className="touch-target"
                  >
                    H3
                  </button>
                  <button
                    type="button"
                    title="Bullet List"
                    onClick={() => insertText("\n- ", "")}
                    style={styles.toolbarBtn}
                    className="touch-target"
                  >
                    • List
                  </button>
                  <button
                    type="button"
                    title="Read Aloud Box"
                    onClick={() => insertText("\n> ", "")}
                    style={styles.toolbarBtn}
                    className="touch-target"
                  >
                    💬 Box
                  </button>
                  <div style={styles.toolbarDivider}></div>
                  <button
                    type="button"
                    onClick={() => insertText(npcTemplate)}
                    style={styles.toolbarTemplateBtn}
                    className="touch-target"
                  >
                    + NPC Template
                  </button>
                  <button
                    type="button"
                    onClick={() => insertText(locationTemplate)}
                    style={styles.toolbarTemplateBtn}
                    className="touch-target"
                  >
                    + Location Template
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  id="wiki-markdown-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Record your campaign lore, dungeon room scripts, or NPC descriptions here. Full-spec Markdown is supported."
                  style={styles.textarea}
                  className="form-input"
                />
              </div>
            ) : (
              /* PREVIEW TAB */
              <div
                style={styles.previewContainer}
                className="wiki-content"
                dangerouslySetInnerHTML={{ __html: compileMarkdown(editContent) }}
              />
            )}
          </div>
        </form>
      ) : selectedArticle ? (
        /*  ARTICLE READER VIEW  */
        <div style={styles.reader} className="glass-panel gold-border-glow">
          {/* Reader Header */}
          <div style={styles.readerHeader}>
            <button
              id="wiki-back-btn"
              onClick={handleBack}
              style={styles.backBtn}
              className="touch-target btn-hover-scale"
            >
              Back
            </button>
            <div style={styles.headerRight}>
              {isDM && (
                <div style={styles.dmControlsRow}>
                  <button
                    onClick={() => handleStartEdit(selectedArticle)}
                    style={styles.editBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Edit Scroll
                  </button>
                  <button
                    onClick={() => triggerDelete(selectedArticle)}
                    style={styles.deleteBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Delete
                  </button>
                </div>
              )}
              {!selectedArticle.isVisibleToPlayers && (
                <span style={styles.secretBadge}>DM Secret</span>
              )}
              <span style={styles.timeBadge}>
                Updated: {new Date(selectedArticle.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Reader Body */}
          <div style={styles.readerScroll}>
            <h1 style={styles.articleTitle}>{selectedArticle.title}</h1>
            
            {/* Tags list */}
            {(() => {
              try {
                const tags = JSON.parse(selectedArticle.tags || "[]");
                if (tags.length > 0) {
                  return (
                    <div style={styles.tagList}>
                      {tags.map((tag, i) => (
                        <span key={i} style={styles.tag}>{tag}</span>
                      ))}
                    </div>
                  );
                }
              } catch (e) {}
              return null;
            })()}

            {/* Markdown Content */}
            <div
              className="wiki-content"
              style={styles.contentBody}
              dangerouslySetInnerHTML={{ __html: compileMarkdown(selectedArticle.content) }}
            />
          </div>
        </div>
      ) : (
        /*  SEARCH LIST VIEW  */
        <div style={styles.listView}>
          {/* Search Bar & Add Button */}
          <div style={styles.searchBarContainer}>
            <input
              id="wiki-search-input"
              type="text"
              placeholder="Search campaign lore, NPCs, locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={styles.clearBtn}
                className="touch-target"
              >
                ✕
              </button>
            )}
            {isDM && (
              <button
                onClick={handleStartCreate}
                style={styles.createBtn}
                className="touch-target btn-hover-scale"
              >
                + New Scroll
              </button>
            )}
          </div>

          {/* Lore/Journal List */}
          <div style={styles.listScroll}>
            {loading && <p style={styles.infoText}>Consulting the archives...</p>}
            {error && <p style={styles.errorText}>Error: {error}</p>}
            
            {!loading && !error && filteredArticles.length === 0 && (
              <p style={styles.infoText}>No lore scrolls match your query.</p>
            )}

            {!loading && !error && filteredArticles.map((article) => {
              let parsedTags = [];
              try {
                parsedTags = JSON.parse(article.tags || "[]");
              } catch (e) {}

              return (
                <div
                  key={article.id}
                  id={`wiki-article-${article.id}`}
                  onClick={() => setSelectedArticle(article)}
                  style={styles.articleCard}
                  className="glass-panel btn-hover-scale"
                >
                  <div style={styles.cardHeader}>
                    <h3 style={styles.cardTitle}>{article.title}</h3>
                    {!article.isVisibleToPlayers && (
                      <span style={styles.secretDot} title="Visible to DM only">🔒 DM Secret</span>
                    )}
                  </div>
                  <p style={styles.cardPreview}>
                    {article.content
                      ? article.content.replace(/[#*`]/g, "").slice(0, 100) + (article.content.length > 100 ? "..." : "")
                      : "Empty scroll."}
                  </p>
                  {parsedTags.length > 0 && (
                    <div style={styles.cardTags}>
                      {parsedTags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} style={styles.cardTag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION DELETE MODAL */}
      {articleToDelete && (
        <div style={styles.modalOverlay} className="fade-in">
          <div style={styles.modalContent} className="glass-panel gold-border-glow">
            <header style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Confirm Destruction</h3>
              <button
                onClick={() => setArticleToDelete(null)}
                style={styles.modalCloseBtn}
                className="touch-target"
              >
                ✕
              </button>
            </header>
            <div style={styles.modalBody}>
              <p>Are you sure you want to permanently delete and burn the lore scroll <strong>"{articleToDelete.title}"</strong>?</p>
              <p style={{ color: "var(--color-danger)", fontSize: "0.8rem", marginTop: "0.5rem" }}>This action cannot be undone.</p>
            </div>
            <footer style={styles.modalFooter}>
              <button
                onClick={() => setArticleToDelete(null)}
                style={styles.modalCancelBtn}
                className="touch-target"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={styles.confirmDeleteBtn}
                className="touch-target btn-hover-scale"
              >
                Destroy Scroll
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "0.75rem",
    gap: "0.75rem",
  },
  listView: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: "0.75rem",
  },
  searchBarContainer: {
    display: "flex",
    position: "relative",
    flexShrink: 0,
    gap: "0.5rem",
  },
  searchInput: {
    flex: 1,
    padding: "0.75rem 1rem",
    fontSize: "0.95rem",
    borderRadius: "0.5rem",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    background: "rgba(0,0,0,0.3)",
    color: "#fffffe",
    outline: "none",
  },
  clearBtn: {
    position: "absolute",
    right: "120px",
    top: 0,
    bottom: 0,
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "0.95rem",
    cursor: "pointer",
    padding: "0 0.75rem",
  },
  createBtn: {
    padding: "0.6rem 1rem",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    borderRadius: "6px",
    color: "#0f0e17",
    fontWeight: "bold",
    fontSize: "0.85rem",
    cursor: "pointer",
    minHeight: "44px",
    whiteSpace: "nowrap",
  },
  listScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  articleCard: {
    padding: "0.85rem 1rem",
    borderRadius: "8px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: "1.05rem",
    fontWeight: 600,
    color: "var(--color-accent)",
  },
  secretDot: {
    fontSize: "0.72rem",
    color: "var(--color-danger)",
    background: "rgba(235, 87, 87, 0.12)",
    border: "1px solid rgba(235, 87, 87, 0.2)",
    padding: "0.1rem 0.35rem",
    borderRadius: "3px",
  },
  cardPreview: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    lineHeight: 1.4,
  },
  cardTags: {
    display: "flex",
    gap: "0.35rem",
    marginTop: "0.25rem",
  },
  cardTag: {
    fontSize: "0.65rem",
    background: "rgba(255, 255, 255, 0.04)",
    padding: "0.15rem 0.4rem",
    borderRadius: "4px",
    color: "var(--color-muted)",
    border: "1px solid rgba(255,255,255,0.04)",
  },
  infoText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
  errorText: {
    textAlign: "center",
    color: "var(--color-danger)",
    fontSize: "0.85rem",
    marginTop: "2.5rem",
  },

  /* Reader View */
  reader: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRadius: "12px",
    overflow: "hidden",
  },
  readerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.65rem 0.75rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
  },
  backBtn: {
    padding: "0.45rem 0.85rem",
    borderRadius: "4px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
  },
  dmControlsRow: {
    display: "flex",
    gap: "0.35rem",
  },
  editBtn: {
    padding: "0.45rem 0.75rem",
    borderRadius: "4px",
    background: "rgba(200, 151, 58, 0.1)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  deleteBtn: {
    padding: "0.45rem 0.75rem",
    borderRadius: "4px",
    background: "rgba(235, 87, 87, 0.08)",
    border: "1px solid rgba(235, 87, 87, 0.25)",
    color: "var(--color-danger)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  secretBadge: {
    fontSize: "0.65rem",
    background: "rgba(235, 87, 87, 0.12)",
    border: "1px solid rgba(235, 87, 87, 0.25)",
    color: "var(--color-danger)",
    padding: "0.15rem 0.4rem",
    borderRadius: "4px",
    fontWeight: 600,
  },
  timeBadge: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
  },
  readerScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "1.25rem",
  },
  articleTitle: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    marginBottom: "0.5rem",
    lineHeight: 1.25,
  },
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
    marginBottom: "1.25rem",
  },
  tag: {
    fontSize: "0.7rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    padding: "0.2rem 0.5rem",
    borderRadius: "4px",
    color: "var(--color-accent)",
  },
  contentBody: {
    fontSize: "0.95rem",
    lineHeight: 1.6,
  },

  /* Workspace Editor */
  editor: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRadius: "12px",
    overflow: "hidden",
  },
  editorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.65rem 0.75rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
  },
  editorTitle: {
    fontSize: "1.15rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  editorHeaderActions: {
    display: "flex",
    gap: "0.5rem",
  },
  saveBtn: {
    padding: "0.45rem 1rem",
    borderRadius: "4px",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    color: "#0f0e17",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 700,
  },
  editorBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "1rem",
    gap: "0.85rem",
    overflowY: "auto",
  },
  editorErrorText: {
    color: "var(--color-danger)",
    fontSize: "0.8rem",
    background: "rgba(235, 87, 87, 0.08)",
    border: "1px solid rgba(235, 87, 87, 0.2)",
    padding: "0.5rem",
    borderRadius: "4px",
  },
  formRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "1rem",
    flexWrap: "wrap",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  input: {
    padding: "0.55rem 0.75rem",
    fontSize: "0.85rem",
  },
  checkboxGroup: {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    minHeight: "38px",
  },
  checkbox: {
    cursor: "pointer",
    width: "16px",
    height: "16px",
    accentColor: "var(--color-accent)",
  },
  checkboxLabel: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
    cursor: "pointer",
    userSelect: "none",
  },
  tagChipsContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
    alignItems: "center",
    padding: "0.4rem 0.6rem",
  },
  editorTagChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.72rem",
    background: "rgba(200, 151, 58, 0.12)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    padding: "0.15rem 0.45rem",
    borderRadius: "4px",
    color: "var(--color-accent)",
  },
  tagChipRemove: {
    background: "transparent",
    border: "none",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.65rem",
    padding: "0.1rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tagInputField: {
    flex: 1,
    minWidth: "120px",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    padding: "0.1rem 0",
  },
  tabsContainer: {
    display: "flex",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    gap: "1rem",
    flexShrink: 0,
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    padding: "0.45rem 0.25rem",
  },
  workspaceWriteContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    minHeight: "280px",
  },
  toolbar: {
    display: "flex",
    gap: "0.35rem",
    alignItems: "center",
    background: "rgba(0,0,0,0.2)",
    padding: "0.35rem",
    borderRadius: "6px",
    flexWrap: "wrap",
    border: "1px solid rgba(255, 255, 255, 0.04)",
  },
  toolbarBtn: {
    minWidth: "32px",
    height: "32px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "4px",
    color: "var(--color-text)",
    fontSize: "0.75rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarDivider: {
    width: "1px",
    height: "20px",
    background: "rgba(255, 255, 255, 0.1)",
    margin: "0 0.25rem",
  },
  toolbarTemplateBtn: {
    padding: "0 0.6rem",
    height: "32px",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    borderRadius: "4px",
    color: "var(--color-accent)",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  textarea: {
    flex: 1,
    resize: "none",
    minHeight: "220px",
    fontFamily: "Courier New, Courier, monospace",
    fontSize: "0.9rem",
    lineHeight: "1.45",
  },
  previewContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "0.75rem",
    border: "1px solid rgba(255,255,255,0.04)",
    borderRadius: "6px",
    background: "rgba(0,0,0,0.15)",
    minHeight: "280px",
  },

  /* MODAL OVERLAY STYLES */
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(5, 3, 10, 0.8)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    padding: "1rem",
  },
  modalContent: {
    width: "100%",
    maxWidth: "400px",
    borderRadius: "10px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    background: "var(--color-surface)",
    boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: "0.5rem",
  },
  modalTitle: {
    fontSize: "1rem",
    color: "var(--color-danger)",
    fontWeight: "bold",
  },
  modalCloseBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "1.1rem",
    cursor: "pointer",
  },
  modalBody: {
    fontSize: "0.85rem",
    lineHeight: 1.5,
    color: "var(--color-text)",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.5rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: "0.75rem",
  },
  modalCancelBtn: {
    padding: "0.45rem 0.85rem",
    borderRadius: "4px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  confirmDeleteBtn: {
    padding: "0.45rem 1rem",
    borderRadius: "4px",
    background: "rgba(235, 87, 87, 0.15)",
    border: "1px solid rgba(235, 87, 87, 0.35)",
    color: "var(--color-danger)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 700,
  },
};
