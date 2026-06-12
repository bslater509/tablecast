// =============================================================================
// Tablecast  Travel & Weather Montage Generator Panel (DM Only)
// Generate day-by-day travel montages using AI (Section 6.7).
// =============================================================================
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Sparkles,
  Loader2,
  Sun,
  Cloud,
  CloudRain,
  Map,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/ai/generate-travel";

const TERRAINS = ["forest", "mountains", "plains", "swamp", "desert", "coastal", "hills", "tundra"];
const SEASONS = ["spring", "summer", "autumn", "winter"];

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
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
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
  dayCard: {
    background: "var(--color-bg)",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    padding: "1rem",
    marginBottom: "0.75rem",
  },
  dayHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  dayNum: {
    fontSize: "1rem",
    fontWeight: 600,
  },
  weatherBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    fontSize: "0.8rem",
    padding: "0.2rem 0.6rem",
    borderRadius: "999px",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
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
  hookChip: {
    display: "inline-block",
    padding: "0.3rem 0.6rem",
    borderRadius: "6px",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    fontSize: "0.85rem",
    marginTop: "0.3rem",
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
};

export default function TravelGenerator() {
  const { addToast } = useToast();
  const [route, setRoute] = useState("");
  const [terrain, setTerrain] = useState("forest");
  const [days, setDays] = useState(5);
  const [season, setSeason] = useState("autumn");
  const [partyLevel, setPartyLevel] = useState("");
  const [dangerous, setDangerous] = useState(false);
  const [legs, setLegs] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState(null);
  const [copiedDay, setCopiedDay] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!route.trim()) {
      addToast("Please describe the travel route", "error");
      return;
    }
    setError(null);
    setGenerating(true);
    setLegs([]);
    setStatusMsg("Planning journey...");

    const controller = new AbortController();
    abortRef.current = controller;

    const levels = partyLevel.split(",").map(s => Number(s.trim())).filter(n => n > 0);

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { ...getJsonAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          route: route.trim(),
          terrain,
          days,
          season,
          partyLevel: levels.length > 0 ? levels : undefined,
          dangerous,
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
              if (event.data && event.data.legs) {
                setLegs(event.data.legs);
                setStatusMsg("");
              }
            } else if (event.type === "error") {
              throw new Error(event.message || "Generation failed");
            }
          } catch (parseErr) {
            if (parseErr.message !== "Generation failed") console.warn("SSE parse:", parseErr);
          }
        }
      }
      setStatusMsg("");
      addToast(`Generated ${legs.length}-day travel montage`, "success");
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message);
      addToast(err.message, "error");
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [route, terrain, days, season, partyLevel, dangerous, addToast, legs.length]);

  const handleCopyDay = useCallback(async (leg) => {
    const text = [
      `Day ${leg.day} — ${leg.weather || ""}`,
      `Temperature: ${leg.temperature || ""}`,
      "",
      leg.description,
      leg.hook ? `\n🎲 Hook: ${leg.hook}` : "",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDay(leg.day);
      addToast("Copied!", "success");
      setTimeout(() => setCopiedDay(null), 1500);
    } catch {
      addToast("Failed to copy", "error");
    }
  }, [addToast]);

  const getWeatherIcon = (weather) => {
    if (!weather) return <Cloud size={14} />;
    const w = weather.toLowerCase();
    if (w.includes("rain") || w.includes("storm") || w.includes("thunder")) return <CloudRain size={14} />;
    if (w.includes("sun") || w.includes("clear") || w.includes("hot")) return <Sun size={14} />;
    if (w.includes("cloud") || w.includes("overcast")) return <Cloud size={14} />;
    if (w.includes("snow") || w.includes("blizzard") || w.includes("freez")) return <CloudRain size={14} />;
    return <Cloud size={14} />;
  };

  return (
    <div style={STYLES.panel}>
      <h2 style={STYLES.header}>
        <Map size={20} /> Travel Montage Generator
      </h2>

      <div style={STYLES.card}>
        <div style={STYLES.fieldGroup}>
          <label style={STYLES.label}>Route</label>
          <input
            style={STYLES.input}
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="e.g., from Phandalin to Neverwinter"
          />
        </div>

        <div style={STYLES.row}>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Terrain</label>
            <select style={STYLES.select} value={terrain} onChange={(e) => setTerrain(e.target.value)}>
              {TERRAINS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Season</label>
            <select style={STYLES.select} value={season} onChange={(e) => setSeason(e.target.value)}>
              {SEASONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div style={STYLES.fieldGroup}>
            <label style={STYLES.label}>Days ({days})</label>
            <div style={STYLES.rangeRow}>
              <input
                type="range"
                min="3"
                max="7"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                style={STYLES.range}
                className="touch-target"
              />
              <span style={STYLES.rangeValue}>{days}</span>
            </div>
          </div>
        </div>

        <div style={STYLES.fieldGroup}>
          <label style={STYLES.label}>Party Level (optional, comma-separated)</label>
          <input
            style={STYLES.input}
            value={partyLevel}
            onChange={(e) => setPartyLevel(e.target.value)}
            placeholder="e.g., 3,4,5"
          />
        </div>

        <label style={STYLES.checkbox} className="touch-target">
          <input type="checkbox" checked={dangerous} onChange={(e) => setDangerous(e.target.checked)} />
          Dangerous Route (include combat encounters)
        </label>

        <div style={{ marginTop: "0.75rem" }}>
          <button
            style={{ ...STYLES.btn, ...STYLES.primaryBtn }}
            onClick={handleGenerate}
            disabled={generating}
            className="touch-target"
          >
            {generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {generating ? "Generating..." : "Generate Travel Montage"}
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

      {legs.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Journey: {legs.length} days
          </h3>
          {legs.map((leg) => (
            <div key={leg.day} style={STYLES.dayCard}>
              <div style={STYLES.dayHeader}>
                <span style={STYLES.dayNum}>Day {leg.day}</span>
                <span style={STYLES.weatherBadge}>
                  {getWeatherIcon(leg.weather)}
                  {leg.weather || "Unknown"}
                </span>
              </div>

              {leg.temperature && (
                <div style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginBottom: "0.5rem" }}>
                  {leg.temperature}
                </div>
              )}

              {leg.description && (
                <>
                  <div style={STYLES.section}>Scene</div>
                  <div style={STYLES.sectionContent}>{leg.description}</div>
                </>
              )}

              {leg.hook && (
                <>
                  <div style={STYLES.section}>Encounter Hook</div>
                  <div style={STYLES.hookChip}>{leg.hook}</div>
                </>
              )}

              <div style={{ marginTop: "0.5rem" }}>
                <button
                  style={{ ...STYLES.btn, ...STYLES.secondaryBtn, fontSize: "0.8rem" }}
                  onClick={() => handleCopyDay(leg)}
                  className="touch-target"
                >
                  {copiedDay === leg.day ? <Check size={14} /> : <Copy size={14} />}
                  Copy Day
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
