// =============================================================================
// Tablecast  Location/Description Generator Panel (DM Only)
// Generate room, building, wilderness, and settlement descriptions via AI (6.6).
// =============================================================================
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Sparkles,
  Loader2,
  Map,
  Eye,
  Ear,
  Copy,
  Check,
  Wand2,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/ai/generate-description";

const TYPES = ["room", "building", "wilderness", "settlement"];
const TONES = ["ominous", "peaceful", "mysterious", "grand", "dilapidated"];

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
  textarea: {
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.875rem",
    width: "100%",
    boxSizing: "border-box",
    minHeight: "80px",
    resize: "vertical",
    fontFamily: "inherit",
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
  resultSection: {
    marginTop: "0.75rem",
  },
  resultLabel: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.3rem",
  },
  resultContent: {
    fontSize: "0.875rem",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    background: "var(--color-bg)",
    borderRadius: "6px",
    padding: "0.75rem",
    border: "1px solid var(--color-border)",
  },
  sensoryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  sensoryCard: {
    background: "var(--color-bg)",
    borderRadius: "6px",
    padding: "0.75rem",
    border: "1px solid var(--color-border)",
  },
  sensoryIcon: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontWeight: 600,
    fontSize: "0.85rem",
    marginBottom: "0.4rem",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.85rem",
    color: "var(--color-muted)",
    marginBottom: "0.75rem",
  },
  error: {
    color: "var(--color-danger)",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  },
  copyRow: {
    display: "flex",
    gap: "0.4rem",
    marginTop: "0.4rem",
  },
};

export default function DescriptionGenerator() {
  const { addToast } = useToast();
  const [type, setType] = useState("room");
  const [tone, setTone] = useState("mysterious");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState(null);
  const [copiedSection, setCopiedSection] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      addToast("Please describe the location or room", "error");
      return;
    }
    setError(null);
    setGenerating(true);
    setResult(null);
    setStatusMsg("Initializing...");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { ...getJsonAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ type, tone, prompt: prompt.trim() }),
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
              setResult(event.data);
              setStatusMsg("");
            } else if (event.type === "error") {
              throw new Error(event.message || "Generation failed");
            }
          } catch (parseErr) {
            if (parseErr.message !== "Generation failed") console.warn("SSE parse:", parseErr);
          }
        }
      }
      setStatusMsg("");
      addToast("Description generated", "success");
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message);
      addToast(err.message, "error");
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [type, tone, prompt, addToast]);

  const handleCopy = useCallback(async (text, section) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      addToast("Copied!", "success");
      setTimeout(() => setCopiedSection(null), 1500);
    } catch {
      addToast("Failed to copy", "error");
    }
  }, [addToast]);

  return (
    <div style={STYLES.panel}>
      <h2 style={STYLES.header}>
        <Map size={20} /> Description Generator
      </h2>

      <div style={STYLES.card}>
        <div style={STYLES.row}>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Type</label>
            <select style={STYLES.select} value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Tone</label>
            <select style={STYLES.select} value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div style={STYLES.fieldGroup}>
          <label style={STYLES.label}>Prompt</label>
          <textarea
            style={STYLES.textarea}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the location or room, e.g. 'A dusty alchemist's laboratory with bubbling vats'"
          />
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <button
            style={{ ...STYLES.btn, ...STYLES.primaryBtn }}
            onClick={handleGenerate}
            disabled={generating}
            className="touch-target"
          >
            {generating ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
            {generating ? "Generating..." : "Generate Description"}
          </button>
        </div>

        {error && <div style={STYLES.error}>{error}</div>}
      </div>

      {statusMsg && (
        <div style={STYLES.statusBar}>
          <Loader2 size={14} className="spin" />
          {statusMsg}
        </div>
      )}

      {result && (
        <div style={STYLES.card}>
          {result.description && (
            <div style={STYLES.resultSection}>
              <div style={STYLES.resultLabel}>Description</div>
              <div style={STYLES.resultContent}>{result.description}</div>
              <div style={STYLES.copyRow}>
                <button
                  style={{ ...STYLES.btn, ...STYLES.secondaryBtn, fontSize: "0.8rem" }}
                  onClick={() => handleCopy(result.description, "desc")}
                  className="touch-target"
                >
                  {copiedSection === "desc" ? <Check size={14} /> : <Copy size={14} />}
                  Copy
                </button>
              </div>
            </div>
          )}

          {result.sensoryDetails && (
            <div style={STYLES.sensoryGrid}>
              {result.sensoryDetails.sights && (
                <div style={STYLES.sensoryCard}>
                  <div style={STYLES.sensoryIcon}><Eye size={14} /> Sights</div>
                  <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>{result.sensoryDetails.sights}</div>
                  <div style={STYLES.copyRow}>
                    <button
                      style={{ ...STYLES.btn, ...STYLES.secondaryBtn, fontSize: "0.75rem" }}
                      onClick={() => handleCopy(result.sensoryDetails.sights, "sights")}
                      className="touch-target"
                    >
                      {copiedSection === "sights" ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}
              {result.sensoryDetails.sounds && (
                <div style={STYLES.sensoryCard}>
                  <div style={STYLES.sensoryIcon}><Ear size={14} /> Sounds</div>
                  <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>{result.sensoryDetails.sounds}</div>
                  <div style={STYLES.copyRow}>
                    <button
                      style={{ ...STYLES.btn, ...STYLES.secondaryBtn, fontSize: "0.75rem" }}
                      onClick={() => handleCopy(result.sensoryDetails.sounds, "sounds")}
                      className="touch-target"
                    >
                      {copiedSection === "sounds" ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}
              {result.sensoryDetails.smells && (
                <div style={STYLES.sensoryCard}>
                  <div style={STYLES.sensoryIcon}><Sparkles size={14} /> Smells</div>
                  <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>{result.sensoryDetails.smells}</div>
                  <div style={STYLES.copyRow}>
                    <button
                      style={{ ...STYLES.btn, ...STYLES.secondaryBtn, fontSize: "0.75rem" }}
                      onClick={() => handleCopy(result.sensoryDetails.smells, "smells")}
                      className="touch-target"
                    >
                      {copiedSection === "smells" ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {result.hiddenDetails && (
            <div style={{ ...STYLES.resultSection, marginTop: "1rem" }}>
              <div style={{ ...STYLES.resultLabel, color: "var(--color-warning)" }}>
                Hidden Details (DM Only)
              </div>
              <div style={STYLES.resultContent}>{result.hiddenDetails}</div>
              <div style={STYLES.copyRow}>
                <button
                  style={{ ...STYLES.btn, ...STYLES.secondaryBtn, fontSize: "0.8rem" }}
                  onClick={() => handleCopy(result.hiddenDetails, "hidden")}
                  className="touch-target"
                >
                  {copiedSection === "hidden" ? <Check size={14} /> : <Copy size={14} />}
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
