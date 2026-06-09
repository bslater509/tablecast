// =============================================================================
// Tablecast  Reusable Touch-Friendly Autocomplete Input
// Fetches recommendations dynamically from the 5etools references database.
// =============================================================================
import { useState, useEffect, useRef } from "react";

function Autocomplete({
  category,
  value,
  onChange,
  onSelect,
  placeholder = "Search...",
  id,
  className = "form-input",
  style = {},
  inputStyle = {},
  dropdownStyle = {},
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const containerRef = useRef(null);
  const debounceTimer = useRef(null);
  const monsterCacheRef = useRef(null);
  const fetchCancelledRef = useRef(false);

  // Sync state if value changes externally
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Handle clicking outside to close suggestions
  useEffect(() => {
    fetchCancelledRef.current = false;
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      fetchCancelledRef.current = true;
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Fetch suggestions with a debounce
  const fetchSuggestions = (searchQuery) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!searchQuery.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    const id = Date.now();
    debounceTimer.current = setTimeout(async () => {
      const currentId = id;
      try {
        if (category === "monsters") {
          if (!monsterCacheRef.current) {
            const res = await fetch(`/api/monsters`);
            if (res.ok) {
              monsterCacheRef.current = await res.json();
            }
          }
          if (currentId !== id || fetchCancelledRef.current) return;
          if (monsterCacheRef.current) {
            const filtered = monsterCacheRef.current.filter(m =>
              m.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setSuggestions(filtered.slice(0, 15));
            setIsOpen(filtered.length > 0);
          }
        } else {
          const res = await fetch(`/api/reference/search?category=${category}&q=${encodeURIComponent(searchQuery)}&limit=15`);
          if (currentId !== id || fetchCancelledRef.current) return;
          if (res.ok) {
            const data = await res.json();
            setSuggestions(data);
            setIsOpen(data.length > 0);
          }
        }
      } catch (err) {
        if (!fetchCancelledRef.current) console.error("Autocomplete fetch error:", err);
      } finally {
        if (currentId === id && !fetchCancelledRef.current) setLoading(false);
      }
    }, 300);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    fetchSuggestions(val);
  };

  const handleFocus = () => {
    if (query.trim() && suggestions.length > 0) {
      setIsOpen(true);
    } else if (query.trim()) {
      fetchSuggestions(query);
    }
  };

  const handleSuggestionClick = (item) => {
    setQuery(item.name);
    onSelect(item);
    setIsOpen(false);
  };

  const formatItemType = (type) => {
    if (!type) return "";
    if (typeof type === "string" || typeof type === "number") return String(type);
    if (Array.isArray(type)) return type.map(formatItemType).filter(Boolean).join(", ");
    if (typeof type === "object") return type.type || type.name || "";
    return "";
  };

  return (
    <div ref={containerRef} style={{ ...styles.container, ...style }}>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        className={className}
        style={{ ...styles.input, ...inputStyle }}
        autoComplete="off"
      />
      {loading && <div style={styles.loadingIndicator}></div>}
      
      {isOpen && suggestions.length > 0 && (
        <ul style={{ ...styles.dropdown, ...dropdownStyle }} className="glass-panel gold-border-glow">
          {suggestions.map((item, idx) => (
            <li key={typeof item === "string" ? item : item.name || item.id || idx} style={styles.listItem}>
              <button
                type="button"
                onClick={() => handleSuggestionClick(item)}
                style={styles.listBtn}
                className="touch-target btn-hover-scale"
              >
                <div style={styles.itemMain}>
                  <span style={styles.itemName}>{item.name}</span>
                  {item.source && <span style={styles.itemSource}>{item.source}</span>}
                  {item.cr && <span style={styles.itemSource}>CR {item.cr}</span>}
                </div>
                {item.level !== undefined && (
                  <span style={styles.itemDetail}>
                    {item.level === 0 ? "Cantrip" : `Lvl ${item.level}`}
                  </span>
                )}
                {item.race && <span style={styles.itemDetail}>{item.race}</span>}
                {formatItemType(item.type) && <span style={styles.itemDetail}>{formatItemType(item.type)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: "relative",
    width: "100%",
    display: "inline-block",
  },
  input: {
    width: "100%",
    paddingRight: "2rem", // spacing for spinner
  },
  loadingIndicator: {
    position: "absolute",
    right: "0.75rem",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "0.95rem",
    pointerEvents: "none",
    opacity: 0.7,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 9999,
    maxHeight: "220px",
    overflowY: "auto",
    margin: "0.25rem 0 0 0",
    padding: "0.35rem",
    borderRadius: "8px",
    backgroundColor: "rgba(10, 8, 20, 0.96)",
    listStyle: "none",
  },
  listItem: {
    margin: 0,
    padding: 0,
  },
  listBtn: {
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: "0.65rem 0.75rem", // large touch targets (minimum 44x44px target)
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  },
  itemMain: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  itemName: {
    fontSize: "0.85rem",
    fontWeight: "600",
  },
  itemSource: {
    fontSize: "0.65rem",
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.1)",
    padding: "0.05rem 0.25rem",
    borderRadius: "3px",
  },
  itemDetail: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
  },
};

export default Autocomplete;
