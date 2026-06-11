// =============================================================================
// Tablecast — Monster AI Generator Modal
// Self-contained modal for AI monster concept selection and generation.
// Extracted from WikiPanel.jsx to reduce main file size.
// =============================================================================
import { useState, useEffect } from "react";

export default function MonsterGenModal({ show, onClose, jsonAuthHeaders, onMonsterCreated }) {
  const [monsterGenPrompt, setMonsterGenPrompt] = useState("");
  const [monsterGenLoading, setMonsterGenLoading] = useState(false);
  const [monsterGenError, setMonsterGenError] = useState(null);
  const [monsterGenStep, setMonsterGenStep] = useState("options");
  const [monsterGenProgress, setMonsterGenProgress] = useState("");
  const [monsterGenOptions, setMonsterGenOptions] = useState([]);
  const [monsterGenSelected, setMonsterGenSelected] = useState(null);

  // Reset monster gen state when modal opens
  useEffect(() => {
    if (show) {
      resetMonsterGenState();
    }
  }, [show]);

  // Reset monster gen state (without closing)
  function resetMonsterGenState() {
    setMonsterGenPrompt("");
    setMonsterGenLoading(false);
    setMonsterGenError(null);
    setMonsterGenStep("options");
    setMonsterGenProgress("");
    setMonsterGenOptions([]);
    setMonsterGenSelected(null);
  }

  // Generate monster options from prompt
  async function generateMonsterOptions() {
    if (!monsterGenPrompt.trim()) {
      setMonsterGenError("Describe the monster you want to create.");
      return;
    }
    setMonsterGenLoading(true);
    setMonsterGenError(null);
    setMonsterGenStep("generating");
    setMonsterGenProgress("Consulting campaign lore...");

    try {
      const res = await fetch("/api/ai/generate-monster-options", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ prompt: monsterGenPrompt.trim() }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to generate options.");
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === "status") setMonsterGenProgress(event.message);
            if (event.type === "result") result = event.data;
            if (event.type === "error") throw new Error(event.message);
          } catch (e) {
            if (e.message) throw e;
          }
        }
      }

      if (result?.options?.length) {
        setMonsterGenOptions(result.options);
        setMonsterGenStep("options");
      } else {
        throw new Error("No monster options received.");
      }
    } catch (err) {
      setMonsterGenError(err.message);
    } finally {
      setMonsterGenLoading(false);
    }
  }

  // Generate full monster from selected option
  async function generateMonsterFromOption() {
    if (!monsterGenSelected) {
      setMonsterGenError("Select a monster concept first.");
      return;
    }
    setMonsterGenLoading(true);
    setMonsterGenError(null);
    setMonsterGenStep("generating");
    setMonsterGenProgress("Generating full monster statblock...");

    try {
      const res = await fetch("/api/ai/generate-monster", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          prompt: monsterGenPrompt.trim(),
          selectedOption: monsterGenSelected,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to generate monster.");
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === "status") setMonsterGenProgress(event.message);
            if (event.type === "result") result = event.data;
            if (event.type === "error") throw new Error(event.message);
          } catch (e) {
            if (e.message) throw e;
          }
        }
      }

      if (result?.name) {
        const monsterData = {
          name: result.name || "",
          race: result.race || "",
          class: result.class || "",
          level: Number(result.level) || 1,
          hp: Number(result.hp) || 10,
          maxHp: Number(result.maxHp) || 10,
          ac: Number(result.ac) || 10,
          cr: String(result.cr || "0"),
          imageUrl: result.imageUrl || "",
          largeImageUrl: result.largeImageUrl || "",
          strength: Number(result.strength) || 10,
          dexterity: Number(result.dexterity) || 10,
          constitution: Number(result.constitution) || 10,
          intelligence: Number(result.intelligence) || 10,
          wisdom: Number(result.wisdom) || 10,
          charisma: Number(result.charisma) || 10,
          alignment: result.alignment || "",
          appearance: result.appearance || "",
          personality: result.personality || "",
          history: result.history || "",
          partyRelationship: result.partyRelationship || "",
          description: result.description || "",
          inventory: "[]",
          modifiers: "{}",
          actions: Array.isArray(result.actions) ? JSON.stringify(result.actions) : "[]",
          isVisibleToPlayers: false,
        };

        if (onMonsterCreated) onMonsterCreated(monsterData);
        resetMonsterGenState();
        onClose();
      } else {
        throw new Error("Invalid monster data received.");
      }
    } catch (err) {
      setMonsterGenError(err.message);
    } finally {
      setMonsterGenLoading(false);
    }
  }

  function handleClose() {
    resetMonsterGenState();
    onClose();
  }

  if (!show) return null;

  const styles = {
    modalOverlay: {
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(5, 3, 10, 0.8)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      padding: "1rem",
    },
    modalContent: {
      width: "100%",
      maxWidth: "400px",
      borderRadius: "10px",
      padding: "1.25rem",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
      background: "var(--color-surface)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      paddingBottom: "0.5rem",
    },
    modalTitle: {
      fontSize: "1rem",
      color: "var(--color-danger)",
      fontWeight: "bold",
      margin: 0,
    },
    modalCloseBtn: {
      background: "transparent",
      border: "none",
      color: "var(--color-muted)",
      fontSize: "1.1rem",
      cursor: "pointer",
    },
    textarea: {
      flex: 1,
      resize: "none",
      minHeight: "220px",
      fontFamily: "Courier New, Courier, monospace",
      fontSize: "0.9rem",
      lineHeight: "1.45",
      padding: "0.55rem 0.75rem",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "6px",
      background: "rgba(0,0,0,0.3)",
      color: "var(--color-text)",
      outline: "none",
      width: "100%",
      boxSizing: "border-box",
    },
    primaryBtn: {
      padding: "0.6rem 1rem",
      background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
      border: "none",
      borderRadius: "6px",
      color: "var(--color-bg)",
      fontWeight: "bold",
      fontSize: "0.85rem",
      cursor: "pointer",
      minHeight: "44px",
      whiteSpace: "nowrap",
    },
    secondaryBtn: {
      padding: "0.45rem 0.85rem",
      borderRadius: "4px",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      color: "var(--color-text)",
      cursor: "pointer",
      fontSize: "0.8rem",
      fontWeight: 600,
      minHeight: "44px",
    },
    errorText: {
      textAlign: "center",
      color: "var(--color-danger)",
      fontSize: "0.85rem",
      marginTop: "0.5rem",
    },
  };

  return (
    <div style={styles.modalOverlay} onClick={() => !monsterGenLoading && handleClose()}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>✨ AI Monster Generator</h3>
          <button onClick={() => !monsterGenLoading && handleClose()} style={styles.modalCloseBtn} className="touch-target" disabled={monsterGenLoading}>
            ✕
          </button>
        </div>

        {monsterGenStep === "generating" && (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <div className="spinner" style={{
              width: "28px",
              height: "28px",
              border: "3px solid rgba(200,151,58,0.2)",
              borderTopColor: "var(--color-accent)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 0.75rem",
            }} />
            <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
              {monsterGenProgress || "Working on your monster..."}
            </p>
          </div>
        )}

        {monsterGenStep === "options" && !monsterGenOptions.length && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ color: "var(--color-text)", fontSize: "0.85rem" }}>
              Describe the monster you want to create. Include details about its type, role, difficulty, and special abilities.
            </p>
            <textarea
              value={monsterGenPrompt}
              onChange={(e) => setMonsterGenPrompt(e.target.value)}
              placeholder="e.g. A large venomous spider that lurks in dark forest caves, CR 3, ambush hunter with web attacks..."
              style={{ ...styles.textarea, minHeight: "80px" }}
              className="form-input"
              rows={3}
            />
            <button
              type="button"
              onClick={generateMonsterOptions}
              disabled={monsterGenLoading || !monsterGenPrompt.trim()}
              style={{ ...styles.primaryBtn, alignSelf: "flex-end" }}
              className="touch-target"
            >
              {monsterGenLoading ? "Thinking..." : "Generate Concepts"}
            </button>
            {monsterGenProgress && <p style={{ color: "var(--color-accent)", fontSize: "0.8rem", background: "rgba(200,151,58,0.08)", border: "1px solid rgba(200,151,58,0.2)", padding: "0.5rem", borderRadius: "4px", margin: 0 }}>{monsterGenProgress}</p>}
          </div>
        )}

        {monsterGenStep === "options" && monsterGenOptions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ color: "var(--color-text)", fontSize: "0.85rem" }}>Select a concept to generate the full statblock:</p>
            {monsterGenOptions.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMonsterGenSelected(opt)}
                style={{
                  background: monsterGenSelected === opt ? "rgba(200, 151, 58, 0.12)" : "var(--color-surface)",
                  border: `1px solid ${monsterGenSelected === opt ? "var(--color-accent)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "6px",
                  padding: "0.75rem",
                  textAlign: "left",
                  width: "100%",
                }}
                className="touch-target"
              >
                <strong>{opt.name}</strong> ({opt.type || "Unknown"} — CR {opt.cr || "?"})
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--color-muted)" }}>{opt.briefDescription}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={generateMonsterFromOption}
              disabled={!monsterGenSelected || monsterGenLoading}
              style={{ ...styles.primaryBtn, alignSelf: "flex-end" }}
              className="touch-target"
            >
              {monsterGenLoading ? "Generating..." : "Generate Full Statblock"}
            </button>
            <button
              type="button"
              onClick={() => { setMonsterGenOptions([]); setMonsterGenSelected(null); }}
              style={{ ...styles.secondaryBtn, alignSelf: "flex-start" }}
              className="touch-target"
            >
              Back to Prompt
            </button>
          </div>
        )}

        {monsterGenError && <p style={styles.errorText}>{monsterGenError}</p>}
      </div>
    </div>
  );
}
