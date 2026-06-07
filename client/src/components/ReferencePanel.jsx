// =============================================================================
// Tablecast  D&D 5e Reference Library Panel
// Supports tabbed searching and formatting of spells, items, monsters, and rules.
// =============================================================================
import React, { useState, useEffect } from "react";

const CATEGORIES = [
  { id: "spells", label: " Spells", icon: "✨" },
  { id: "monsters", label: " Monsters", icon: "🐉" },
  { id: "items", label: " Items", icon: "⚔️" },
  { id: "rules", label: " Rules", icon: "📜" },
  { id: "classes", label: " Classes", icon: "🛡️" },
  { id: "races", label: " Races", icon: "🧝" },
];

function ReferencePanel({ user, isPopout = false }) {
  const [category, setCategory] = useState("spells");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Trigger search on query or category change
  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/reference/search?category=${category}&q=${encodeURIComponent(query)}&limit=30`
        );
        if (res.ok && active) {
          const data = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error("Reference search failed:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    const delayDebounce = setTimeout(() => {
      loadData();
    }, 250);

    return () => {
      active = false;
      clearTimeout(delayDebounce);
    };
  }, [category, query]);

  // Formats text entries that may be arrays or contain 5etools formatting tags
  const renderEntries = (entries) => {
    if (!entries) return null;
    if (typeof entries === "string") return <p style={styles.entryPara}>{cleanText(entries)}</p>;
    if (typeof entries === "number" || typeof entries === "boolean") {
      return <p style={styles.entryPara}>{String(entries)}</p>;
    }
    if (Array.isArray(entries)) {
      return entries.map((entry, idx) => {
        if (typeof entry === "string") {
          return <p key={idx} style={styles.entryPara}>{cleanText(entry)}</p>;
        }
        if (!entry || typeof entry !== "object") return null;
        if (entry.type === "list" && Array.isArray(entry.items)) {
          return (
            <ul key={idx} style={styles.entryList}>
              {entry.items.map((item, i) => (
                <li key={i} style={styles.entryListItem}>
                  {typeof item === "string" ? cleanText(item) : renderEntries(item.entries || item.entry || item.name || item)}
                </li>
              ))}
            </ul>
          );
        }
        if ((entry.type === "entries" || entry.type === "section") && Array.isArray(entry.entries)) {
          return (
            <div key={idx} style={styles.nestedEntries}>
              {entry.name && <h4 style={styles.nestedHeader}>{entry.name}</h4>}
              {renderEntries(entry.entries)}
            </div>
          );
        }
        if (entry.type === "item" && entry.entry) {
          return (
            <p key={idx} style={styles.entryPara}>
              {entry.name && <strong style={styles.actionName}>{cleanText(entry.name)} </strong>}
              {cleanText(entry.entry)}
            </p>
          );
        }
        if (entry.type === "insetReadaloud" && Array.isArray(entry.entries)) {
          return <blockquote key={idx} style={styles.quoteBox}>{renderEntries(entry.entries)}</blockquote>;
        }
        if (entry.type === "quote" && Array.isArray(entry.entries)) {
          return (
            <div key={idx}>
              {renderEntries(entry.entries)}
              {entry.by && <p style={styles.quoteBy}>- {cleanText(entry.by)}</p>}
            </div>
          );
        }
        if (entry.type === "table" && Array.isArray(entry.rows)) {
          return (
            <div key={idx} style={styles.tableWrapper}>
              {entry.caption && <h5 style={styles.tableCaption}>{entry.caption}</h5>}
              <table style={styles.table}>
                {entry.colLabels && (
                  <thead>
                    <tr>
                      {entry.colLabels.map((lbl, i) => (
                        <th key={i} style={styles.th}>{cleanText(lbl)}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {entry.rows.map((row, i) => (
                    <tr key={i} style={i % 2 === 1 ? styles.trAlt : {}}>
                      {row.map((cell, j) => (
                        <td key={j} style={styles.td}>{cleanText(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (entry.name && entry.entries) {
          return (
            <div key={idx} style={styles.nestedEntries}>
              <h4 style={styles.nestedHeader}>{cleanText(entry.name)}</h4>
              {renderEntries(entry.entries)}
            </div>
          );
        }
        return null;
      });
    }
    if (typeof entries === "object") {
      if (entries.entries) return renderEntries(entries.entries);
      if (entries.name) return <p style={styles.entryPara}>{cleanText(entries.name)}</p>;
    }
    return null;
  };

  // Strip 5etools link and markup tags, e.g., {@spell fireball} or {@dice 1d6}
  const cleanText = (text) => {
    if (typeof text !== "string") return "";
    return text
      .replace(/\{@spell ([^}|]+)[^}]*\}/g, "$1")
      .replace(/\{@dice ([^}|]+)[^}]*\}/g, "($1)")
      .replace(/\{@item ([^}|]+)[^}]*\}/g, "$1")
      .replace(/\{@creature ([^}|]+)[^}]*\}/g, "$1")
      .replace(/\{@condition ([^}|]+)[^}]*\}/g, "$1")
      .replace(/\{@filter ([^|]+)\|[^}]+\}/g, "$1")
      .replace(/\{@table ([^}|]+)[^}]*\}/g, "$1")
      .replace(/\{@style ([^}|]+)[^}]*\}/g, "$1")
      .replace(/\{@[a-z]+ ([^}|]+)[^}]*\}/g, "$1");
  };

  const formatAbilityScore = (val) => {
    const mod = Math.floor((val - 10) / 2);
    const sign = mod >= 0 ? "+" : "";
    return `${val} (${sign}${mod})`;
  };

  const formatChallengeRating = (cr) => {
    if (cr === undefined || cr === null || cr === "") return "0";
    if (typeof cr === "string" || typeof cr === "number") return String(cr);
    if (typeof cr === "object") return String(cr.cr || cr.lair || cr.coven || "0");
    return "0";
  };

  const getListImageUrl = (item) => {
    if (category === "monsters") return item.tokenUrl || "";
    return item.imageUrl || "";
  };

  const openReferenceDetail = async (item) => {
    setDetailLoading(true);
    setSelectedItem(item);

    try {
      const params = new URLSearchParams({
        category,
        name: item.name,
      });
      if (item.source) params.set("source", item.source);

      const res = await fetch(`/api/reference/detail?${params.toString()}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedItem(detail);
      }
    } catch (err) {
      console.error("Reference detail failed:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div style={styles.container} className="fade-in">
      {/* Category selector row */}
      <div style={styles.categoryNav}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setCategory(cat.id);
              setResults([]);
            }}
            style={{
              ...styles.categoryBtn,
              background: category === cat.id ? "var(--color-accent-dim)" : "rgba(255,255,255,0.02)",
              color: category === cat.id ? "var(--color-accent)" : "var(--color-muted)",
              borderColor: category === cat.id ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
            }}
            className="touch-target btn-hover-scale"
          >
            {cat.icon}{cat.label}
          </button>
        ))}
        {!isPopout && user?.role === "DM" && (
          <button
            onClick={() => window.open("/dm/popout/reference", "_blank", "width=800,height=800,resizable=yes,scrollbars=yes")}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-accent)",
              fontSize: "1.15rem",
              cursor: "pointer",
              marginLeft: "auto",
              paddingRight: "0.85rem",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
            className="touch-target btn-hover-scale"
            title="Pop out Reference Library"
          >
            ⧉
          </button>
        )}
      </div>

      {/* Search Input bar */}
      <div style={styles.searchBar}>
        <input
          type="text"
          placeholder={`Search ${category}...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.searchInput}
          className="form-input"
        />
        {query && (
          <button onClick={() => setQuery("")} style={styles.clearBtn} className="touch-target">
            ✕
          </button>
        )}
      </div>

      {/* Results view list */}
      <div style={styles.resultsScroll}>
        {loading && results.length === 0 && <p style={styles.statusText}>Searching references... </p>}
        {!loading && results.length === 0 && (
          <p style={styles.statusText}>No matching scrolls found. </p>
        )}
        
        {results.map((item, idx) => {
          const listImageUrl = getListImageUrl(item);
          return (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              aria-label={`Open ${item.name} from ${item.source || "reference library"}`}
              onClick={() => openReferenceDetail(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openReferenceDetail(item);
                }
              }}
              style={styles.resultCard}
              className="glass-panel btn-hover-scale"
            >
              <div style={styles.cardThumbSlot}>
                {listImageUrl && (
                  <img
                    src={listImageUrl}
                    alt=""
                    loading="lazy"
                    style={styles.cardImage}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>
              <div style={styles.cardHeader}>
                <span style={styles.cardName}>{item.name}</span>
                {item.source && <span style={styles.cardSource}>{item.source}</span>}
              </div>
              <div style={styles.cardSub}>
                {category === "spells" && (
                  <span>
                    {item.level === 0 ? "Cantrip" : `Level ${item.level} spell`}  {item.school || "Magic"}
                  </span>
                )}
                {category === "monsters" && (
                  <span>
                    CR {formatChallengeRating(item.cr)}  HP {item.hp?.average || "unknown"}  AC {item.ac?.[0]?.ac || item.ac?.[0] || "unknown"}
                  </span>
                )}
                {category === "items" && (
                  <span>
                    {item.rarity || "Common"}  {item.type || "Item"}
                  </span>
                )}
                {category === "classes" && <span>Class Reference</span>}
                {category === "races" && <span>Race Reference</span>}
                {category === "rules" && <span>General D&D Rule</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Popup Overlay Detail dialog */}
      {selectedItem && (
        <div style={styles.overlay} onClick={() => setSelectedItem(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()} className="glass-panel gold-border-glow">
            <header style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>{selectedItem.name}</h3>
                <span style={styles.modalSource}>Source: {selectedItem.source || "D&D 5e Reference"}</span>
              </div>
              <button onClick={() => setSelectedItem(null)} style={styles.closeBtn} className="touch-target">
                ✕
              </button>
            </header>

            <div style={styles.modalContent}>
              {detailLoading && <p style={styles.statusText}>Loading reference details...</p>}
              {!detailLoading && selectedItem.imageUrl && (
                <div style={styles.imageFrame}>
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.name}
                    style={styles.detailImage}
                    onError={(e) => {
                      e.currentTarget.parentElement.style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* SPELLS DETAIL VIEW */}
              {!detailLoading && category === "spells" && (
                <div style={styles.detailsGroup}>
                  <div style={styles.metaGrid}>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Level</span>
                      <span style={styles.metaVal}>{selectedItem.level === 0 ? "Cantrip" : `Level ${selectedItem.level}`}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Casting Time</span>
                      <span style={styles.metaVal}>{selectedItem.time?.[0]?.number} {selectedItem.time?.[0]?.unit}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Range</span>
                      <span style={styles.metaVal}>{selectedItem.range?.distance?.amount || ""} {selectedItem.range?.distance?.type || selectedItem.range?.type}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Duration</span>
                      <span style={styles.metaVal}>{selectedItem.duration?.[0]?.duration?.amount || ""} {selectedItem.duration?.[0]?.duration?.type || selectedItem.duration?.[0]?.type}</span>
                    </div>
                  </div>
                  <div style={styles.descSection}>
                    <h4 style={styles.secTitle}>Spell Description</h4>
                    {renderEntries(selectedItem.entries)}
                  </div>
                </div>
              )}

              {/* MONSTERS DETAIL VIEW */}
              {!detailLoading && category === "monsters" && (
                <div style={styles.detailsGroup}>
                  <div style={styles.metaGrid}>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Challenge Rating</span>
                      <span style={styles.metaVal}>CR {formatChallengeRating(selectedItem.cr)}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Armor Class</span>
                      <span style={styles.metaVal}>{selectedItem.ac?.[0]?.ac || selectedItem.ac?.[0] || "10"}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Hit Points</span>
                      <span style={styles.metaVal}>{selectedItem.hp?.average || "0"} ({selectedItem.hp?.formula || "N/A"})</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Speed</span>
                      <span style={styles.metaVal}>
                        {selectedItem.speed ? Object.keys(selectedItem.speed).map(k => `${k} ${selectedItem.speed[k]}ft`).join(", ") : "30 ft"}
                      </span>
                    </div>
                  </div>

                  {selectedItem.infoEntries && (
                    <div style={styles.descSection}>
                      <h4 style={styles.secTitle}>
                        Info{selectedItem.infoName && selectedItem.infoName !== selectedItem.name ? `: ${selectedItem.infoName}` : ""}
                      </h4>
                      {renderEntries(selectedItem.infoEntries)}
                    </div>
                  )}

                  {/* Attributes Box */}
                  <div style={styles.statsGrid}>
                    <div style={styles.statBox}>
                      <span style={styles.statLabel}>STR</span>
                      <span style={styles.statVal}>{formatAbilityScore(selectedItem.str || 10)}</span>
                    </div>
                    <div style={styles.statBox}>
                      <span style={styles.statLabel}>DEX</span>
                      <span style={styles.statVal}>{formatAbilityScore(selectedItem.dex || 10)}</span>
                    </div>
                    <div style={styles.statBox}>
                      <span style={styles.statLabel}>CON</span>
                      <span style={styles.statVal}>{formatAbilityScore(selectedItem.con || 10)}</span>
                    </div>
                    <div style={styles.statBox}>
                      <span style={styles.statLabel}>INT</span>
                      <span style={styles.statVal}>{formatAbilityScore(selectedItem.int || 10)}</span>
                    </div>
                    <div style={styles.statBox}>
                      <span style={styles.statLabel}>WIS</span>
                      <span style={styles.statVal}>{formatAbilityScore(selectedItem.wis || 10)}</span>
                    </div>
                    <div style={styles.statBox}>
                      <span style={styles.statLabel}>CHA</span>
                      <span style={styles.statVal}>{formatAbilityScore(selectedItem.cha || 10)}</span>
                    </div>
                  </div>

                  {/* Actions list */}
                  {selectedItem.action && (
                    <div style={styles.descSection}>
                      <h4 style={styles.secTitle}>Actions</h4>
                      {selectedItem.action.map((act, i) => (
                        <div key={i} style={styles.actionItem}>
                          <strong style={styles.actionName}>{act.name}.</strong>{" "}
                          <span>{renderEntries(act.entries)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ITEMS DETAIL VIEW */}
              {!detailLoading && category === "items" && (
                <div style={styles.detailsGroup}>
                  <div style={styles.metaGrid}>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Type</span>
                      <span style={styles.metaVal}>{selectedItem.type || "Item"}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Rarity</span>
                      <span style={styles.metaVal}>{selectedItem.rarity || "Common"}</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Weight</span>
                      <span style={styles.metaVal}>{selectedItem.weight || "0"} lbs</span>
                    </div>
                    <div style={styles.metaBox}>
                      <span style={styles.metaLabel}>Value</span>
                      <span style={styles.metaVal}>{selectedItem.value || "0 gp"}</span>
                    </div>
                  </div>
                  <div style={styles.descSection}>
                    <h4 style={styles.secTitle}>Description</h4>
                    {renderEntries(selectedItem.entries)}
                  </div>
                </div>
              )}

              {/* GENERAL RULES, CLASSES, RACES VIEW */}
              {!detailLoading && (category === "rules" || category === "classes" || category === "races") && (
                <div style={styles.detailsGroup}>
                  <div style={styles.descSection}>
                    <h4 style={styles.secTitle}>Details</h4>
                    {renderEntries(selectedItem.entries || selectedItem.entry || selectedItem.description || "Reference notes available.")}
                  </div>
                </div>
              )}
            </div>
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
    background: "var(--color-bg)",
  },
  categoryNav: {
    display: "flex",
    overflowX: "auto",
    gap: "0.4rem",
    paddingBottom: "0.25rem",
    flexShrink: 0,
    WebkitOverflowScrolling: "touch",
  },
  categoryBtn: {
    padding: "0.45rem 0.85rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: "6px",
    fontSize: "0.8rem",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s",
  },
  searchBar: {
    position: "relative",
    display: "flex",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    padding: "0.75rem 1rem",
    fontSize: "0.95rem",
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
  resultsScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  statusText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
  resultCard: {
    padding: "0.75rem 0.95rem",
    borderRadius: "8px",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr)",
    gridTemplateRows: "auto auto",
    columnGap: "0.75rem",
    rowGap: "0.25rem",
    alignItems: "center",
  },
  cardImage: {
    width: "44px",
    height: "44px",
    objectFit: "cover",
    borderRadius: "6px",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    background: "rgba(0,0,0,0.25)",
  },
  cardThumbSlot: {
    gridRow: "1 / span 2",
    width: "44px",
    height: "44px",
    borderRadius: "6px",
    overflow: "hidden",
    background: "rgba(255,255,255,0.025)",
  },
  cardHeader: {
    minWidth: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.25rem",
  },
  cardName: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "var(--color-accent)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardSource: {
    fontSize: "0.65rem",
    background: "rgba(255,255,255,0.04)",
    padding: "0.1rem 0.3rem",
    borderRadius: "3px",
    color: "var(--color-muted)",
  },
  cardSub: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    minWidth: 0,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: "1rem",
  },
  modal: {
    maxWidth: "520px",
    width: "100%",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    borderRadius: "12px",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.85rem 1.1rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: "1.2rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  modalSource: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: "0.25rem",
  },
  modalContent: {
    flex: 1,
    overflowY: "auto",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  imageFrame: {
    width: "100%",
    minHeight: "180px",
    maxHeight: "260px",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    background: "rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  detailImage: {
    width: "100%",
    height: "100%",
    maxHeight: "260px",
    objectFit: "contain",
    display: "block",
  },
  detailsGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.6rem",
  },
  metaBox: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.03)",
    padding: "0.5rem 0.65rem",
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  metaLabel: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  metaVal: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
  },
  descSection: {
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
    paddingTop: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  secTitle: {
    fontSize: "0.9rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    marginBottom: "0.25rem",
  },
  entryPara: {
    fontSize: "0.85rem",
    lineHeight: "1.5",
    color: "var(--color-text)",
    opacity: 0.9,
    margin: "0 0 0.5rem 0",
  },
  entryList: {
    paddingLeft: "1.25rem",
    margin: "0 0 0.5rem 0",
  },
  entryListItem: {
    fontSize: "0.85rem",
    lineHeight: "1.5",
    color: "var(--color-text)",
    opacity: 0.9,
    marginBottom: "0.25rem",
  },
  nestedEntries: {
    paddingLeft: "0.75rem",
    borderLeft: "2px solid var(--color-accent-dim)",
    marginBottom: "0.5rem",
  },
  nestedHeader: {
    fontSize: "0.8rem",
    fontWeight: "bold",
    color: "var(--color-text)",
    marginBottom: "0.2rem",
  },
  quoteBox: {
    margin: "0.25rem 0 0.75rem 0",
    padding: "0.75rem",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    borderLeft: "3px solid var(--color-accent)",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.03)",
  },
  quoteBy: {
    fontSize: "0.78rem",
    lineHeight: "1.4",
    color: "var(--color-muted)",
    textAlign: "right",
    margin: "0.25rem 0 0 0",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "0.35rem",
    marginTop: "0.25rem",
  },
  statBox: {
    background: "rgba(200, 151, 58, 0.04)",
    border: "1px solid rgba(200, 151, 58, 0.15)",
    borderRadius: "4px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.35rem 0.15rem",
  },
  statLabel: {
    fontSize: "0.6rem",
    color: "var(--color-accent)",
    fontWeight: "bold",
  },
  statVal: {
    fontSize: "0.75rem",
    fontWeight: "600",
    color: "var(--color-text)",
    marginTop: "0.1rem",
  },
  actionItem: {
    fontSize: "0.85rem",
    lineHeight: "1.45",
    color: "var(--color-text)",
    marginBottom: "0.75rem",
  },
  actionName: {
    color: "var(--color-accent)",
  },
};

export default ReferencePanel;
