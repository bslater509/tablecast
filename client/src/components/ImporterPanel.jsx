// =============================================================================
// Tablecast  DM 5e Importer Panel
// DM searches the 5etools repositories and imports them directly into the DB.
// =============================================================================
import React, { useState, useEffect } from "react";
import { BookOpen, Box, Database, Download, Shield, Sparkles, Users } from "lucide-react";

const CATEGORIES = [
  { id: "spells", label: "Spells", icon: Sparkles },
  { id: "monsters", label: "Monsters", icon: Shield },
  { id: "items", label: "Items", icon: Box },
  { id: "rules", label: "Rules", icon: BookOpen },
  { id: "classes", label: "Classes", icon: Shield },
  { id: "races", label: "Races", icon: Users },
];

function ImporterPanel({ user }) {
  const [category, setCategory] = useState("spells");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importingItem, setImportingItem] = useState(null);

  // Set of already imported keys (Title/Name + "_" + Source)
  const [importedKeys, setImportedKeys] = useState(new Set());

  // Load imported items on mount to identify what is already in DB
  const loadImportedItems = async () => {
    try {
      const keys = new Set();

      // 1. Fetch imported monsters
      const resMonsters = await fetch("/api/monsters");
      if (resMonsters.ok) {
        const monsters = await resMonsters.json();
        monsters.forEach((m) => {
          keys.add(`monsters_${m.name.toLowerCase()}`);
        });
      }

      // 2. Fetch wiki articles
      const resWiki = await fetch("/api/wiki");
      if (resWiki.ok) {
        const articles = await resWiki.json();
        articles.forEach((art) => {
          // map wiki categories back to reference category
          let refCat = "";
          if (art.category === "SPELL") refCat = "spells";
          else if (art.category === "ITEM") refCat = "items";
          else if (art.category === "RULE") refCat = "rules";
          else if (art.category === "CLASS") refCat = "classes";
          else if (art.category === "RACE") refCat = "races";

          if (refCat) {
            keys.add(`${refCat}_${art.title.toLowerCase()}`);
          }
        });
      }

      setImportedKeys(keys);
    } catch (err) {
      console.error("Failed to load existing imported keys:", err);
    }
  };

  useEffect(() => {
    loadImportedItems();
  }, []);

  // Search references
  useEffect(() => {
    let active = true;
    async function searchData() {
      if (!query.trim()) {
        setResults([]);
        return;
      }
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
      searchData();
    }, 250);

    return () => {
      active = false;
      clearTimeout(delayDebounce);
    };
  }, [category, query]);

  const handleImport = async (item) => {
    const key = `${category}_${item.name.toLowerCase()}`;
    if (importedKeys.has(key)) return;

    setImportingItem(item.name);
    try {
      const res = await fetch("/api/reference/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tablecast-user-id": String(user?.id || ""),
        },
        body: JSON.stringify({
          category,
          name: item.name,
          source: item.source,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import item.");
      }

      // Add to imported keys set
      setImportedKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      alert(`Successfully imported "${item.name}"!`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImportingItem(null);
    }
  };

  const isImported = (item) => {
    return importedKeys.has(`${category}_${item.name.toLowerCase()}`);
  };

  const getListImageUrl = (item) => {
    if (category === "monsters") return item.tokenUrl || "";
    return item.imageUrl || "";
  };

  const formatChallengeRating = (cr) => {
    if (cr === undefined || cr === null || cr === "") return "0";
    if (typeof cr === "string" || typeof cr === "number") return String(cr);
    if (typeof cr === "object") return String(cr.cr || cr.lair || cr.coven || "0");
    return "0";
  };

  return (
    <div style={styles.container} className="fade-in">
      <header style={styles.header}>
        <h2 style={styles.title}>5etools Campaign Importer</h2>
        <p style={styles.subtitle}>
          Search raw 5etools references to import them directly into your offline campaign database. Spells, items, rules, classes, and races will be converted to local Wiki Articles. Monsters will be imported as standalone templates.
        </p>
      </header>

      {/* Category selector row */}
      <div style={styles.categoryNav}>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id);
                setResults([]);
                setQuery("");
              }}
              style={{
                ...styles.categoryBtn,
                background: category === cat.id ? "var(--color-accent-dim)" : "rgba(255,255,255,0.02)",
                color: category === cat.id ? "var(--color-accent)" : "var(--color-muted)",
                borderColor: category === cat.id ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
              }}
              className="touch-target btn-hover-scale"
            >
              <Icon size={15} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search Input bar */}
      <div style={styles.searchBar}>
        <input
          type="text"
          placeholder={`Search 5etools ${category} repository...`}
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
        {loading && <p style={styles.statusText}>Searching 5etools repositories...</p>}
        {!loading && !query.trim() && (
          <p style={styles.statusText}>Type above to search for rules, monsters, spells, and items to import.</p>
        )}
        {!loading && query.trim() && results.length === 0 && (
          <p style={styles.statusText}>No matching reference entries found in the raw clone.</p>
        )}
        
        {results.map((item, idx) => {
          const listImageUrl = getListImageUrl(item);
          const imported = isImported(item);
          const isThisImporting = importingItem === item.name;

          return (
            <div
              key={idx}
              style={styles.resultCard}
              className="glass-panel"
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

              {/* Action Button */}
              <div style={styles.actionSection}>
                {imported ? (
                  <span style={styles.importedBadge}>
                    <Database size={12} />
                    Imported
                  </span>
                ) : (
                  <button
                    onClick={() => handleImport(item)}
                    disabled={isThisImporting}
                    style={styles.importBtn}
                    className="touch-target btn-hover-scale"
                  >
                    {isThisImporting ? (
                      "Importing..."
                    ) : (
                      <>
                        <Download size={13} />
                        Import
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "1rem",
    gap: "0.75rem",
    background: "var(--color-bg)",
    overflowY: "hidden",
  },
  header: {
    paddingBottom: "0.25rem",
  },
  title: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    marginBottom: "0.25rem",
  },
  subtitle: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    lineHeight: "1.4",
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
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
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
    paddingBottom: "1rem",
  },
  statusText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginTop: "2rem",
    padding: "0 1rem",
    lineHeight: "1.4",
  },
  resultCard: {
    padding: "0.75rem 0.95rem",
    borderRadius: "8px",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) auto",
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
    justifyContent: "flex-start",
    alignItems: "center",
    gap: "0.5rem",
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
  actionSection: {
    gridRow: "1 / span 2",
    gridColumn: "3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  importBtn: {
    padding: "0.45rem 0.85rem",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    borderRadius: "4px",
    color: "#0f0e17",
    fontSize: "0.78rem",
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    minHeight: "36px",
  },
  importedBadge: {
    padding: "0.45rem 0.85rem",
    background: "rgba(111, 207, 151, 0.1)",
    border: "1px solid rgba(111, 207, 151, 0.3)",
    borderRadius: "4px",
    color: "var(--color-success)",
    fontSize: "0.78rem",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    minHeight: "36px",
  },
};

export default ImporterPanel;
