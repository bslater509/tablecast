// =============================================================================
// Tablecast — Wiki Tree Sidebar (split-pane navigation for DM)
// Collapsible sections: Campaign Content | Bestiary | Reference
// Each section shows categories with article counts.
// The active category expands to show filtered article titles.
// =============================================================================
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const SECTIONS = [
  {
    id: "campaign",
    label: "Campaign Content",
    icon: "📁",
    categories: [
      { tab: "LOCATION", icon: "🗺️", label: "Locations" },
      { tab: "NPC", icon: "👤", label: "NPCs" },
      { tab: "LORE", icon: "📜", label: "Lore & Items" },
      { tab: "LOG", icon: "📓", label: "Session Logs" },
    ],
  },
  {
    id: "bestiary",
    label: "Bestiary",
    icon: "👹",
    categories: [{ tab: "MONSTER", icon: "👹", label: "Monsters" }],
  },
  {
    id: "reference",
    label: "Reference",
    icon: "📖",
    categories: [
      { tab: "SPELL", icon: "✨", label: "Spells" },
      { tab: "ITEM", icon: "📦", label: "Items" },
      { tab: "RULE", icon: "📖", label: "Rules" },
      { tab: "CLASS", icon: "🛡️", label: "Classes" },
      { tab: "RACE", icon: "👥", label: "Races" },
    ],
  },
];

function getCategoryCount(tab, articles, npcs, monsters) {
  if (tab === "NPC") return npcs.length;
  if (tab === "MONSTER") return monsters.length;
  return articles.filter((a) => (a.category || "LORE") === tab).length;
}

function getSortedItems(tab, articles, npcs, monsters) {
  if (tab === "NPC") {
    return [...npcs].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  if (tab === "MONSTER") {
    return [...monsters].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  return [...articles]
    .filter((a) => (a.category || "LORE") === tab)
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}

function matchesSearch(item, searchQuery) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const title = (item.title || item.name || "").toLowerCase();
  const content = (item.content || item.description || "").toLowerCase();
  const tags = (() => {
    try {
      return JSON.parse(item.tags || "[]");
    } catch {
      return [];
    }
  })();
  const tagMatch = tags.some((t) => t.toLowerCase().includes(q));
  return title.includes(q) || content.includes(q) || tagMatch;
}

function hasAnyMatch(tab, searchQuery, articles, npcs, monsters) {
  if (!searchQuery) return true;
  const items = getSortedItems(tab, articles, npcs, monsters);
  return items.some((item) => matchesSearch(item, searchQuery));
}

export default function WikiTreeSidebar({
  articles,
  npcs,
  monsters,
  activeCategoryTab,
  selectedArticle,
  searchQuery,
  onSelectCategory,
  onSelectArticle,
  isOpen,
  onClose,
  isDM,
  onCreateNew,
}) {
  const [expandedSections, setExpandedSections] = useState([
    "campaign",
    "bestiary",
    "reference",
  ]);

  const toggleSection = (id) => {
    setExpandedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const isActive = (tab) => activeCategoryTab === tab;
  const isSelected = (item) => selectedArticle?.id === item?.id;

  return (
    <>
      {/* Overlay for mobile drawer */}
      {isOpen && onClose && (
        <div
          style={styles.overlay}
          className="wiki-sidebar-overlay"
          onClick={onClose}
        />
      )}
      <div
        style={styles.sidebar}
        className={`wiki-tree-sidebar ${isOpen ? "wiki-sidebar-open" : ""}`}
      >
        <div style={styles.sidebarInner}>
          {/* Header */}
          <div style={styles.sidebarHeader}>
            <h3 style={styles.sidebarTitle}>Wiki Index</h3>
            {onClose && (
              <button
                onClick={onClose}
                style={styles.closeBtn}
                className="touch-target wiki-sidebar-close-btn"
                aria-label="Close sidebar"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sections */}
          <div style={styles.sectionList}>
            {SECTIONS.map((section) => {
              const isSectionExpanded = expandedSections.includes(section.id);
              return (
                <div key={section.id} style={styles.section}>
                  <button
                    onClick={() => toggleSection(section.id)}
                    style={styles.sectionHeader}
                    className="touch-target sidebar-section-header"
                  >
                    <span style={styles.sectionIcon}>{section.icon}</span>
                    <span style={styles.sectionLabel}>{section.label}</span>
                    <span style={styles.sectionArrow}>
                      {isSectionExpanded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </span>
                  </button>

                  {isSectionExpanded && (
                    <div style={styles.categoryList}>
                      {section.categories.map((cat) => {
                        const count = getCategoryCount(
                          cat.tab,
                          articles,
                          npcs,
                          monsters
                        );
                        const active = isActive(cat.tab);
                        const hasMatch = hasAnyMatch(
                          cat.tab,
                          searchQuery,
                          articles,
                          npcs,
                          monsters
                        );
                        const dimmed = searchQuery && !hasMatch && !active;

                        // Get items for active category, filtered by search
                        const allItems = getSortedItems(
                          cat.tab,
                          articles,
                          npcs,
                          monsters
                        );
                        const items = searchQuery
                          ? allItems.filter((item) => matchesSearch(item, searchQuery))
                          : allItems;

                        return (
                          <div key={cat.tab}>
                            <button
                              onClick={() => onSelectCategory(cat.tab)}
                              style={{
                                ...styles.categoryBtn,
                                background: active
                                  ? "var(--color-accent-dim)"
                                  : "transparent",
                                color: active
                                  ? "var(--color-accent)"
                                  : dimmed
                                    ? "rgba(167, 169, 190, 0.3)"
                                    : "var(--color-muted)",
                              }}
                              className="touch-target sidebar-category-btn"
                            >
                              <span style={styles.catIcon}>{cat.icon}</span>
                              <span style={styles.catLabel}>{cat.label}</span>
                              <span
                                style={{
                                  ...styles.catCount,
                                  color: dimmed
                                    ? "rgba(167, 169, 190, 0.3)"
                                    : active
                                      ? "var(--color-accent)"
                                      : "var(--color-muted)",
                                }}
                              >
                                {count}
                              </span>
                              {active && isDM && onCreateNew && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateNew(cat.tab);
                                  }}
                                  style={styles.addBtn}
                                  className="touch-target sidebar-add-btn"
                                  title={`New ${cat.label}`}
                                  aria-label={`New ${cat.label}`}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onCreateNew(cat.tab); } }}
                                >
                                  +
                                </span>
                              )}
                            </button>

                            {/* Article list under active category */}
                            {active && items.length > 0 && (
                              <div style={styles.articleList}>
                                {items.map((item) => {
                                  const title = item.title || item.name;
                                  const sel = isSelected(item);
                                  return (
                                    <button
                                      key={item.id}
                                      onClick={() => onSelectArticle(item)}
                                      style={{
                                        ...styles.articleBtn,
                                        background: sel
                                          ? "var(--color-accent-dim)"
                                          : "transparent",
                                        color: sel
                                          ? "var(--color-accent)"
                                          : "var(--color-text)",
                                        fontWeight: sel ? 700 : 400,
                                      }}
                                      className="touch-target sidebar-article-btn"
                                    >
                                      <span style={styles.articleBullet}>
                                        •
                                      </span>
                                      <span style={styles.articleTitle}>
                                        {title}
                                      </span>
                                      {!item.isVisibleToPlayers && (
                                        <span
                                          style={styles.secretIcon}
                                          title="DM only"
                                        >
                                          🔒
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {active && items.length === 0 && !searchQuery && (
                              <div style={styles.emptyText}>No entries</div>
                            )}
                            {active && items.length === 0 && searchQuery && (
                              <div style={styles.emptyText}>
                                No matches
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(5, 3, 10, 0.6)",
    backdropFilter: "blur(4px)",
    zIndex: 900,
  },
  sidebar: {
    width: "260px",
    minWidth: "260px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--color-border-light)",
    background: "rgba(0, 0, 0, 0.2)",
    overflow: "hidden",
  },
  sidebarInner: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.65rem 0.75rem",
    borderBottom: "1px solid var(--color-border-light)",
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: 0,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "1rem",
    cursor: "pointer",
    padding: "0.25rem",
    display: "none",
  },
  sectionList: {
    flex: 1,
    overflowY: "auto",
    padding: "0.35rem 0",
  },
  section: {
    marginBottom: "0.15rem",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    width: "100%",
    padding: "0.5rem 0.75rem",
    background: "rgba(255, 255, 255, 0.02)",
    border: "none",
    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
    cursor: "pointer",
    color: "var(--color-text)",
    fontSize: "0.78rem",
    fontWeight: 700,
    textAlign: "left",
    transition: "background 0.15s",
    minHeight: "44px",
  },
  sectionIcon: {
    fontSize: "0.9rem",
    flexShrink: 0,
  },
  sectionLabel: {
    flex: 1,
  },
  sectionArrow: {
    flexShrink: 0,
    color: "var(--color-muted)",
    display: "flex",
    alignItems: "center",
  },
  categoryList: {
    display: "flex",
    flexDirection: "column",
  },
  categoryBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    width: "100%",
    padding: "0.4rem 0.75rem 0.4rem 1.5rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    textAlign: "left",
    transition: "all 0.12s",
    minHeight: "34px",
  },
  catIcon: {
    fontSize: "0.8rem",
    flexShrink: 0,
  },
  catLabel: {
    flex: 1,
  },
  catCount: {
    fontSize: "0.65rem",
    background: "rgba(255, 255, 255, 0.04)",
    padding: "0.1rem 0.35rem",
    borderRadius: "8px",
    fontWeight: 600,
  },
  articleList: {
    display: "flex",
    flexDirection: "column",
  },
  articleBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    width: "100%",
    padding: "0.3rem 0.75rem 0.3rem 2.2rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.72rem",
    textAlign: "left",
    transition: "all 0.1s",
    minHeight: "30px",
    wordBreak: "break-word",
  },
  articleBullet: {
    color: "var(--color-accent)",
    flexShrink: 0,
    fontSize: "0.6rem",
  },
  articleTitle: {
    flex: 1,
    lineHeight: 1.3,
  },
  secretIcon: {
    fontSize: "0.65rem",
    flexShrink: 0,
    opacity: 0.7,
  },
  emptyText: {
    padding: "0.2rem 0.75rem 0.4rem 2.2rem",
    fontSize: "0.68rem",
    color: "var(--color-muted)",
    fontStyle: "italic",
  },
  addBtn: {
    background: "var(--color-accent-dim)",
    border: "none",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 700,
    lineHeight: 1,
    width: "22px",
    height: "22px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
    marginLeft: "0.25rem",
    transition: "all 0.15s",
  },
};
