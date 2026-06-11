// =============================================================================
// Tablecast  AI Encounter Builder Modal
// Self-contained modal for AI-powered encounter generation.
// =============================================================================
import { useState } from "react";
import { encounterStyles } from "./encounterStyles";

export default function AiBuilderModal({
  show,
  onClose,
  authHeaders,
  maps,
  selectedMapId,
  npcs,
  addToast,
  fetchEncounters,
  fetchEncounter,
  notifyRefresh,
}) {
  /* ---- AI builder state ---- */
  const [aiLevels, setAiLevels] = useState("");
  const [aiDifficulty, setAiDifficulty] = useState("medium");
  const [aiContext, setAiContext] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiProgress, setAiProgress] = useState("");
  const [aiResult, setAiResult] = useState(null);

  if (!show) return null;

  const handleAiBuild = async () => {
    const levels = aiLevels
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!levels.length) {
      setAiError("Enter at least one party level (e.g. 3, 5, 7).");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiProgress("Consulting your monster database...");
    try {
      const res = await fetch("/api/ai/build-encounter", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          partyLevels: levels,
          difficulty: aiDifficulty,
          context: aiContext.trim(),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "AI build failed.");
      }
      const data = await res.json();
      if (data.encounter) {
        setAiResult(data.encounter);
      } else {
        throw new Error("No encounter data returned.");
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
      setAiProgress("");
    }
  };

  const handleApplyAiResult = async () => {
    if (!aiResult) return;
    setAiLoading(true);
    try {
      const mapId = selectedMapId || (maps[0]?.id);
      if (!mapId) { addToast("Select a map first.", "warning"); return; }
      const encRes = await fetch("/api/encounters", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: aiResult.name || "AI Encounter",
          mapId: Number(mapId),
        }),
      });
      if (!encRes.ok) throw new Error("Failed to create encounter.");
      const enc = await encRes.json();
      for (const p of aiResult.participants || []) {
        if (p.type === "monster") {
          try {
            const sr = await fetch(
              `/api/monsters?search=${encodeURIComponent(p.name)}`,
              { headers: authHeaders }
            );
            if (sr.ok) {
              const monsters = await sr.json();
              const m = monsters.find(
                (m) => m.name.toLowerCase() === p.name.toLowerCase()
              ) || monsters[0];
              if (m) {
                for (let i = 0; i < (p.quantity || 1); i++) {
                  await fetch(`/api/encounters/${enc.id}/participants`, {
                    method: "POST",
                    headers: authHeaders,
                    body: JSON.stringify({ type: "monster", monsterId: m.id, isHidden: false }),
                  });
                }
              }
            }
          } catch { /* skip */ }
        } else if (p.type === "npc") {
          const matched = npcs.find(
            (n) => n.name.toLowerCase() === String(p.name || "").toLowerCase()
          );
          if (matched) {
            await fetch(`/api/encounters/${enc.id}/participants`, {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({ type: "npc", npcId: matched.id, isHidden: false }),
            });
          }
        }
      }
      onClose();
      setAiResult(null);
      await fetchEncounters(selectedMapId || undefined);
      fetchEncounter(enc.id);
      notifyRefresh(enc.id);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const s = encounterStyles;

  return (
    <div
      style={s.modalOverlay}
      onClick={() => !aiLoading && onClose()}
    >
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={s.modalTitle}>
          ✨ AI Encounter Builder
        </h3>
        {!aiResult ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Party Levels (comma-separated)
              </label>
              <input
                style={s.input}
                value={aiLevels}
                onChange={(e) => setAiLevels(e.target.value)}
                placeholder="e.g. 3, 3, 4"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Difficulty
              </label>
              <select
                style={s.select}
                value={aiDifficulty}
                onChange={(e) => setAiDifficulty(e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="deadly">Deadly</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Context (optional)
              </label>
              <textarea
                style={s.textarea}
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="e.g. Forest encounter with goblins..."
                rows={2}
              />
            </div>
            <button
              style={{ ...s.btnPrimary, width: "100%", justifyContent: "center" }}
              onClick={handleAiBuild}
              disabled={aiLoading}
            >
              {aiLoading ? "Building..." : "Build Encounter"}
            </button>
            {aiProgress && (
              <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 8, textAlign: "center" }}>
                {aiProgress}
              </p>
            )}
            {aiError && (
              <p style={{ fontSize: 13, color: "#fca5a5", marginTop: 8 }}>{aiError}</p>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>{aiResult.name}</strong>
              <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                {aiResult.participants?.length || 0} combatant types
              </p>
            </div>
            {(aiResult.participants || []).map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid #1e293b",
                  fontSize: 13,
                }}
              >
                <span>
                  {p.quantity > 1 ? `${p.quantity}\u00d7 ` : ""}
                  {p.name}
                </span>
                <span style={{ color: "#94a3b8" }}>{p.type}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                style={s.btnSecondary}
                onClick={() => setAiResult(null)}
              >
                Back
              </button>
              <button
                style={{ ...s.btnPrimary, flex: 1, justifyContent: "center" }}
                onClick={handleApplyAiResult}
                disabled={aiLoading}
              >
                Apply
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
