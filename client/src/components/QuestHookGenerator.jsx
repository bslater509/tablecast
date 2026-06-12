// =============================================================================
// Tablecast  Quest Hook Generator Panel (DM Only)
// Generate quest and story hooks using AI (Section 6.2).
// =============================================================================
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Sparkles,
  Loader2,
  BookOpen,
  Swords,
  Brain,
  Gem,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/ai/generate-hooks";

const ENVIRONMENTS = ["Any", "Forest", "Urban", "Dungeon", "Wilderness", "Coastal", "Desert", "Arctic"];
const TONES = ["Heroic", "Dark", "Horror", "Mystery", "Comedy", "Epic"];

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
  checkboxRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    marginBottom: "1rem",
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  btn: {
    padding: "0.5rem 1rem",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
    display: "inline-flex",
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
  hookCard: {
    background: "var(--color-bg)",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    padding: "1rem",
    marginBottom: "0.75rem",
  },
  hookTitle: {
    fontSize: "1.05rem",
    fontWeight: 600,
    marginBottom: "0.25rem",
  },
  hookPitch: {
    fontSize: "0.875rem",
    color: "var(--color-muted)",
    fontStyle: "italic",
    marginBottom: "0.75rem",
  },
  section: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginTop: "0.5rem",
    marginBottom: "0.2rem",
  },
  sectionContent: {
    fontSize: "0.875rem",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.85rem",
    color: "var(--color-muted)",
    marginBottom: "0.75rem",
  },
  spin: {
    animation: "spin 1s linear infinite",
  },
  hookActions: {
    display: "flex",
    gap: "0.4rem",
    marginTop: "0.5rem",
  },
  error: {
    color: "var(--color-danger)",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  },
};

export default function QuestHookGenerator() {
  const { addToast } = useToast();
  const [partyLevel, setPartyLevel] = useState("3,4,5");
  const [environment, setEnvironment] = useState("Any");
  const [tone, setTone] = useState("Heroic");
  const [constraints, setConstraints] = useState("");
  const [includeCombat, setIncludeCombat] = useState(true);
  const [includePuzzles, setIncludePuzzles] = useState(false);
  const [includeNpcs, setIncludeNpcs] = useState(true);
  const [includeMoralDilemma, setIncludeMoralDilemma] = useState(false);
  const [hooks, setHooks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const abortRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => {
      if (abortRef.current) abortRef.current.abort();
    }, []);

  const handleGenerate = useCallback(async () => {
    const levels = partyLevel.split(",").map(s => Number(s.trim())).filter(n => n > 0);
    if (levels.length === 0) {
      addToast("Enter at least one party level", "error");
      return;
    }

    setError(null);
    setGenerating(true);
    setHooks([]);
    setStatusMsg("Initializing...");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { ...getJsonAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          partyLevel: levels,
          environment: environment === "Any" ? undefined : environment,
          tone: tone.toLowerCase(),
          constraints: constraints.trim() || undefined,
          includeCombat,
          includePuzzles,
          includeNpcs,
          includeMoralDilemma,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "status") {
              setStatusMsg(event.message);
            } else if (event.type === "result") {
              if (event.data && event.data.hooks) {
                setHooks(event.data.hooks);
                setStatusMsg("");
              }
            } else if (event.type === "error") {
              throw new Error(event.message || "Generation failed");
            }
          } catch (parseErr) {
            if (parseErr.message !== "Generation failed") {
              console.warn("SSE parse error:", parseErr);
            }
          }
        }
      }
      setStatusMsg("");
      addToast(`Generated ${hooks.length} quest hooks`, "success");
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message);
      addToast(err.message, "error");
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [partyLevel, environment, tone, constraints, includeCombat, includePuzzles, includeNpcs, includeMoralDilemma, addToast, hooks.length]);

  const handleCopyHook = useCallback(async (hook, idx) => {
    const text = [
      `## ${hook.title}`,
      `*${hook.pitch}*`,
      "",
      `**Setup Scene:** ${hook.setupScene}`,
      `**Conflict:** ${hook.conflict}`,
      `**Key NPCs:** ${hook.keyNpcs}`,
      `**Complications:** ${hook.complications}`,
      `**Rewards:** ${hook.rewards}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      addToast("Copied!", "success");
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      addToast("Failed to copy", "error");
    }
  }, [addToast]);

  return (
    <div style={STYLES.panel}>
      <h2 style={STYLES.header}>
        <Sparkles size={20} /> Quest Hook Generator
      </h2>

      <div style={STYLES.card}>
        <div style={STYLES.row}>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Party Level(s)</label>
            <input
              style={STYLES.input}
              value={partyLevel}
              onChange={(e) => setPartyLevel(e.target.value)}
              placeholder="e.g., 3,4,5"
            />
          </div>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Environment</label>
            <select style={STYLES.select} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Tone</label>
            <select style={STYLES.select} value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div style={STYLES.fieldGroup}>
          <label style={STYLES.label}>Constraints (optional)</label>
          <input
            style={STYLES.input}
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="e.g., must involve a hag, set in a swamp"
          />
        </div>

        <div style={STYLES.checkboxRow}>
          <label style={STYLES.checkbox} className="touch-target">
            <input type="checkbox" checked={includeCombat} onChange={(e) => setIncludeCombat(e.target.checked)} />
            <Swords size={14} /> Combat
          </label>
          <label style={STYLES.checkbox} className="touch-target">
            <input type="checkbox" checked={includePuzzles} onChange={(e) => setIncludePuzzles(e.target.checked)} />
            <Brain size={14} /> Puzzles
          </label>
          <label style={STYLES.checkbox} className="touch-target">
            <input type="checkbox" checked={includeNpcs} onChange={(e) => setIncludeNpcs(e.target.checked)} />
            <BookOpen size={14} /> NPCs
          </label>
          <label style={STYLES.checkbox} className="touch-target">
            <input type="checkbox" checked={includeMoralDilemma} onChange={(e) => setIncludeMoralDilemma(e.target.checked)} />
            <Gem size={14} /> Moral Dilemma
          </label>
        </div>

        <button
          style={{ ...STYLES.btn, ...STYLES.primaryBtn }}
          onClick={handleGenerate}
          disabled={generating}
          className="touch-target"
        >
          {generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {generating ? "Generating..." : "Generate Hooks"}
        </button>

        {error && <div style={STYLES.error}>{error}</div>}
      </div>

      {statusMsg && (
        <div style={STYLES.statusBar}>
          <Loader2 size={14} className="spin" />
          {statusMsg}
        </div>
      )}

      {hooks.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Generated Hooks ({hooks.length})
          </h3>
          {hooks.map((hook, idx) => (
            <div key={idx} style={STYLES.hookCard}>
              <div style={STYLES.hookTitle}>{hook.title}</div>
              {hook.pitch && <div style={STYLES.hookPitch}>{hook.pitch}</div>}
              {hook.setupScene && (
                <>
                  <div style={STYLES.section}>Setup Scene</div>
                  <div style={STYLES.sectionContent}>{hook.setupScene}</div>
                </>
              )}
              {hook.conflict && (
                <>
                  <div style={STYLES.section}>Conflict</div>
                  <div style={STYLES.sectionContent}>{hook.conflict}</div>
                </>
              )}
              {hook.keyNpcs && (
                <>
                  <div style={STYLES.section}>Key NPCs</div>
                  <div style={STYLES.sectionContent}>{hook.keyNpcs}</div>
                </>
              )}
              {hook.complications && (
                <>
                  <div style={STYLES.section}>Complications</div>
                  <div style={STYLES.sectionContent}>{hook.complications}</div>
                </>
              )}
              {hook.rewards && (
                <>
                  <div style={STYLES.section}>Rewards</div>
                  <div style={STYLES.sectionContent}>{hook.rewards}</div>
                </>
              )}
              <div style={STYLES.hookActions}>
                <button
                  style={{ ...STYLES.btn, ...STYLES.secondaryBtn, fontSize: "0.8rem" }}
                  onClick={() => handleCopyHook(hook, idx)}
                  className="touch-target"
                >
                  {copiedIdx === idx ? <Check size={14} /> : <Copy size={14} />}
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
