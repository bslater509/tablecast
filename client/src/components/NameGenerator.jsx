// =============================================================================
// Tablecast  Name Generator Panel (DM Only)
// Generate fantasy names using AI (Section 6.3).
// =============================================================================
import { useState, useCallback } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Plus,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/ai/generate-names";

const CATEGORIES = [
  "NPC (Dwarf)",
  "NPC (Elf)",
  "NPC (Human)",
  "Tavern",
  "Town",
  "Shop",
  "Faction",
  "Landmark",
  "MonsterLair",
];

const STYLES = {
  panel: {
    padding: "1rem",
    maxWidth: "900px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  header: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  card: {
    background: "var(--color-surface)",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    padding: "1rem",
    marginBottom: "1rem",
  },
  row: {
    display: "flex",
    gap: "0.75rem",
    flexWrap: "wrap",
    alignItems: "flex-end",
    marginBottom: "1rem",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    flex: "1 1 200px",
  },
  label: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  select: {
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.875rem",
    width: "100%",
    boxSizing: "border-box",
  },
  input: {
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.875rem",
    width: "100%",
    boxSizing: "border-box",
  },
  rangeRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  range: {
    flex: 1,
    accentColor: "var(--color-accent)",
  },
  rangeValue: {
    fontSize: "0.875rem",
    fontWeight: 600,
    minWidth: "2rem",
    textAlign: "center",
  },
  btn: {
    padding: "0.5rem 1rem",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    whiteSpace: "nowrap",
  },
  primaryBtn: {
    background: "var(--color-accent)",
    color: "#fff",
  },
  secondaryBtn: {
    background: "var(--color-surface)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.4rem 0.75rem",
    borderRadius: "999px",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text)",
    transition: "all 0.15s ease",
    margin: "0.25rem",
  },
  chipCopied: {
    borderColor: "var(--color-accent)",
    background: "var(--color-accent)",
    color: "#fff",
  },
  chipContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.25rem",
    marginTop: "0.5rem",
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "1rem",
  },
  error: {
    color: "var(--color-danger)",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  },
};

export default function NameGenerator() {
  const { addToast } = useToast();
  const [category, setCategory] = useState("NPC (Human)");
  const [count, setCount] = useState(5);
  const [stylePrompt, setStylePrompt] = useState("");
  const [names, setNames] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleGenerate = useCallback(async (replace = true) => {
    setError(null);
    setGenerating(true);
    if (replace) setNames([]);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { ...getJsonAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ category, count, stylePrompt: stylePrompt.trim() || undefined }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        if (replace) {
          setNames(data.names);
        } else {
          setNames((prev) => [...prev, ...data.names]);
        }
        addToast(`Generated ${data.names.length} names`, "success");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      setError(err.message);
      addToast(err.message, "error");
    } finally {
      setGenerating(false);
    }
  }, [category, count, stylePrompt, addToast]);

  const handleCopy = useCallback(async (name, idx) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedIndex(idx);
      addToast("Copied!", "success");
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      addToast("Failed to copy", "error");
    }
  }, [addToast]);

  return (
    <div style={STYLES.panel} className="loot-generator-shell">
      <h2 style={STYLES.header}>
        <Sparkles size={20} /> Name Generator
      </h2>

      <div style={STYLES.card}>
        <div style={STYLES.row}>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Category</label>
            <select
              style={STYLES.select}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Count ({count})</label>
            <div style={STYLES.rangeRow}>
              <input
                type="range"
                min="1"
                max="20"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                style={STYLES.range}
                className="touch-target"
              />
              <span style={STYLES.rangeValue}>{count}</span>
            </div>
          </div>
        </div>

        <div style={STYLES.fieldGroup}>
          <label style={STYLES.label}>Style / Tone (optional)</label>
          <input
            type="text"
            style={STYLES.input}
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="e.g., Norse-themed, elegant, ominous..."
          />
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <button
            style={{ ...STYLES.btn, ...STYLES.primaryBtn }}
            onClick={() => handleGenerate(true)}
            disabled={generating}
            className="touch-target"
          >
            {generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>

        {error && <div style={STYLES.error}>{error}</div>}
      </div>

      {names.length > 0 && (
        <div style={STYLES.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: 500 }}>Results ({names.length})</span>
            <div style={STYLES.actions}>
              <button
                style={{ ...STYLES.btn, ...STYLES.secondaryBtn }}
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="touch-target"
              >
                {generating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                Generate More
              </button>
              <button
                style={{ ...STYLES.btn, ...STYLES.secondaryBtn }}
                onClick={() => handleGenerate(true)}
                disabled={generating}
                className="touch-target"
              >
                <RefreshCw size={14} />
                Replace
              </button>
            </div>
          </div>

          <div style={STYLES.chipContainer}>
            {names.map((name, idx) => (
              <button
                key={`${name}-${idx}`}
                style={{
                  ...STYLES.chip,
                  ...(copiedIndex === idx ? STYLES.chipCopied : {}),
                }}
                onClick={() => handleCopy(name, idx)}
                className="touch-target"
                title="Click to copy"
              >
                {name}
                {copiedIndex === idx ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
