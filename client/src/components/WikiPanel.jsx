// =============================================================================
// Tablecast  Wiki / Player Journal Panel (Phase 4)
// Allows players and DMs to view unlocked campaign logs, location info, and NPCs.
// =============================================================================
import { useState, useEffect } from "react";

export default function WikiPanel({ user }) {
  const [articles, setArticles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Determine if user has DM privileges
  const isDM = user?.role === "DM";

  // Fetch articles on mount/user role change
  useEffect(() => {
    async function fetchArticles() {
      setLoading(true);
      setError(null);
      try {
        // Players only fetch visible articles, DMs get all
        const url = isDM ? "/api/wiki" : "/api/wiki?visible=true";
        const res = await fetch(url);
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

  // Basic Markdown Renderer
  function renderMarkdown(text) {
    if (!text) return "";
    
    // Escape HTML to prevent injection
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Bold **text**
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Headers: ###, ##, #
    html = html.replace(/^### (.*?)$/gm, "<h4 style='color:var(--color-accent);margin:0.75rem 0 0.25rem 0;font-size:1.05rem;'>$1</h4>");
    html = html.replace(/^## (.*?)$/gm, "<h3 style='color:var(--color-accent);margin:1.15rem 0 0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:0.25rem;font-size:1.2rem;'>$1</h3>");
    html = html.replace(/^# (.*?)$/gm, "<h2 style='color:var(--color-accent);margin:1.35rem 0 0.75rem 0;font-size:1.4rem;'>$1</h2>");

    // Bullet items
    html = html.replace(/^- (.*?)$/gm, "<li style='margin-left:1.15rem;margin-bottom:0.35rem;color:var(--color-text);line-height:1.4;'>$1</li>");

    // Paragraph lines / breaks
    const lines = html.split("\n");
    const parsedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<div style='height:0.5rem;'></div>";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<li")) return line;
      return `<p style='margin-bottom:0.75rem;line-height:1.55;color:var(--color-text);opacity:0.9;'>${line}</p>`;
    });

    return parsedLines.join("\n");
  }

  // Back button handler for reading view on mobile
  function handleBack() {
    setSelectedArticle(null);
  }

  return (
    <div style={styles.container} className="fade-in">
      {selectedArticle ? (
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
              {!selectedArticle.isVisibleToPlayers && (
                <span style={styles.secretBadge}>DM Secret </span>
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
              style={styles.contentBody}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedArticle.content) }}
            />
          </div>
        </div>
      ) : (
        /*  SEARCH LIST VIEW  */
        <div style={styles.listView}>
          {/* Search Bar Container */}
          <div style={styles.searchBarContainer}>
            <input
              id="wiki-search-input"
              type="text"
              placeholder="Search lore, NPCs, locations"
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
                
              </button>
            )}
          </div>

          {/* Lore/Journal List */}
          <div style={styles.listScroll}>
            {loading && <p style={styles.infoText}>Consulting the archives</p>}
            {error && <p style={styles.errorText}> Error: {error}</p>}
            
            {!loading && !error && filteredArticles.length === 0 && (
              <p style={styles.infoText}>No scrolls match your query. </p>
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
                      <span style={styles.secretDot} title="Visible to DM only"></span>
                    )}
                  </div>
                  <p style={styles.cardPreview}>
                    {article.content
                      ? article.content.replace(/[#*`]/g, "").slice(0, 100) + "..."
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
    right: 0,
    top: 0,
    bottom: 0,
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "0.95rem",
    cursor: "pointer",
    padding: "0 0.75rem",
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
    fontSize: "0.85rem",
    color: "var(--color-danger)",
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
    gap: "0.5rem",
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
};
