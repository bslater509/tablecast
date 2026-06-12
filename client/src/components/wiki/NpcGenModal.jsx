// =============================================================================
// Tablecast — NPC AI Generator Modal
// Self-contained modal for AI NPC interview-based generation.
// Extracted from WikiPanel.jsx to reduce main file size.
// =============================================================================
import { useState, useEffect } from "react";

export default function NpcGenModal({ show, onClose, jsonAuthHeaders, onNpcCreated }) {
  const [npcGenPrompt, setNpcGenPrompt] = useState("");
  const [npcGenLoading, setNpcGenLoading] = useState(false);
  const [npcGenError, setNpcGenError] = useState(null);
  const [npcGenStep, setNpcGenStep] = useState("interview");
  const [npcGenProgress, setNpcGenProgress] = useState("");
  const [npcInterviewHistory, setNpcInterviewHistory] = useState([]);
  const [npcCurrentQuestion, setNpcCurrentQuestion] = useState(null);
  const [npcInterviewSummary, setNpcInterviewSummary] = useState("");

  // Start NPC interview when the modal opens
  useEffect(() => {
    if (show) {
      resetNpcGenState();
      const timer = setTimeout(() => startInterview(), 80);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // SSE reader for NPC generation endpoints (emits status, result, error, done events)
  async function streamNpcGeneration(url, body, { onStatus, onResult, onError }) {
    const res = await fetch(url, {
      method: "POST",
      headers: jsonAuthHeaders,
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Request failed.");
      }
      // Non-streaming fallback
      const body = await res.text();
      try {
        const data = JSON.parse(body);
        if (data.error) throw new Error(data.error);
        if (onResult) onResult(data);
      } catch (e) {
        throw new Error("Received an unexpected response from the server. Please try again.");
      }
      return;
    }

    if (!res.ok || !res.body) {
      throw new Error("Failed to start NPC generation stream.");
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
        const payload = line.slice(6).trim();
        if (!payload) continue;

        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        switch (event.type) {
          case "status":
            if (onStatus) onStatus(event.message);
            break;
          case "result":
            if (onResult) onResult(event.data);
            break;
          case "error":
            if (onError) onError(event.message || "Unknown error");
            else throw new Error(event.message || "Unknown error");
            break;
          case "done":
            break;
          default:
            break;
        }
      }
    }
  }

  // Start the interview — fetch the very first question
  async function startInterview() {
    setNpcGenLoading(true);
    setNpcGenError(null);
    setNpcInterviewHistory([]);
    setNpcCurrentQuestion(null);
    setNpcInterviewSummary("");
    setNpcGenProgress("");

    try {
      await streamNpcGeneration("/api/ai/npc-interview", {
        prompt: npcGenPrompt.trim() || undefined,
        interviewHistory: [],
        finalStep: false,
      }, {
        onStatus: (msg) => setNpcGenProgress(msg),
        onResult: (data) => {
          if (data.action === "ask") {
            setNpcCurrentQuestion({
              question: data.question,
              choices: data.choices || [],
              questionIndex: 0,
            });
            setNpcGenStep("interview");
            setNpcGenLoading(false);
            setNpcGenProgress("");
          } else if (data.action === "generate") {
            setNpcInterviewSummary(data.summary || "Custom NPC");
            handleFinalGenerate(data, []);
          } else {
            throw new Error("Unexpected response from AI. Please try again.");
          }
        },
        onError: (msg) => { throw new Error(msg); },
      });
    } catch (err) {
      console.error("[AI NPC Interview Start] Error:", err);
      setNpcGenError(err.message);
      setNpcGenLoading(false);
      setNpcGenProgress("");
    }
  }

  // Handle the DM picking a multiple-choice answer
  async function handleInterviewAnswer(answer) {
    if (npcGenLoading || !npcCurrentQuestion) return;

    const updatedHistory = [
      ...npcInterviewHistory,
      { question: npcCurrentQuestion.question, answer },
    ];

    setNpcInterviewHistory(updatedHistory);
    setNpcCurrentQuestion(null);
    setNpcGenLoading(true);
    setNpcGenError(null);
    setNpcGenProgress("");

    try {
      await streamNpcGeneration("/api/ai/npc-interview", {
        prompt: npcGenPrompt.trim() || undefined,
        interviewHistory: updatedHistory,
        finalStep: false,
      }, {
        onStatus: (msg) => setNpcGenProgress(msg),
        onResult: (data) => {
          if (data.action === "ask") {
            setNpcCurrentQuestion({
              question: data.question,
              choices: data.choices || [],
              questionIndex: updatedHistory.length,
            });
            setNpcGenLoading(false);
            setNpcGenProgress("");
          } else if (data.action === "generate") {
            setNpcInterviewSummary(data.summary || "Custom NPC");
            handleFinalGenerate({
              npcName: data.npcName,
              npcRace: data.npcRace,
              npcClass: data.npcClass,
              summary: data.summary,
            }, updatedHistory);
          } else {
            throw new Error("Unexpected response from AI. Please try again.");
          }
        },
        onError: (msg) => { throw new Error(msg); },
      });
    } catch (err) {
      console.error("[AI NPC Interview Answer] Error:", err);
      setNpcGenError(err.message);
      // Restore the question on error so DM can retry
      setNpcCurrentQuestion((prev) => prev);
      setNpcInterviewHistory(updatedHistory.slice(0, -1));
      setNpcGenLoading(false);
      setNpcGenProgress("");
    }
  }

  // Final step: generate the full NPC statblock from the interview summary
  async function handleFinalGenerate(interviewResult = {}, historyOverride = null) {
    setNpcGenStep("generating_full");
    setNpcGenLoading(true);
    setNpcGenError(null);
    setNpcGenProgress("Starting NPC generation...");

    const effectiveHistory = historyOverride || npcInterviewHistory;
    // eslint-disable-next-line unused-imports/no-unused-vars
    const summaryText = interviewResult.summary || effectiveHistory.map(
      // eslint-disable-next-line unused-imports/no-unused-vars
      (h, i) => `${h.question}: ${h.answer.label}${h.answer.description ? ` \u2014 ${h.answer.description}` : ""}`
    ).join("\n");

    try {
      await streamNpcGeneration("/api/ai/npc-interview", {
        prompt: npcGenPrompt.trim() || undefined,
        interviewHistory: effectiveHistory,
        finalStep: true,
      }, {
        onStatus: (msg) => setNpcGenProgress(msg),
        onResult: (aiData) => {
          // Calculate ability modifiers
          const mods = {};
          const stats = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
          for (const stat of stats) {
            const score = Number(aiData[stat]) || 10;
            mods[stat] = Math.floor((score - 10) / 2);
          }

          // Build the NPC data object to pass back to parent
          const npcUpdate = {
            name: aiData.name || "",
            race: aiData.race || "",
            class: aiData.class || "",
            level: Number(aiData.level) || 1,
            hp: Number(aiData.hp) || 10,
            maxHp: Number(aiData.maxHp) || Number(aiData.hp) || 10,
            ac: Number(aiData.ac) || 10,
            cr: aiData.cr || "0",
            strength: Number(aiData.strength) || 10,
            dexterity: Number(aiData.dexterity) || 10,
            constitution: Number(aiData.constitution) || 10,
            intelligence: Number(aiData.intelligence) || 10,
            wisdom: Number(aiData.wisdom) || 10,
            charisma: Number(aiData.charisma) || 10,
            alignment: aiData.alignment || "",
            appearance: aiData.appearance || "",
            personality: aiData.personality || "",
            history: aiData.history || "",
            partyRelationship: aiData.partyRelationship || "",
            description: aiData.description || "",
            actions: Array.isArray(aiData.actions) ? JSON.stringify(aiData.actions) : "[]",
            modifiers: JSON.stringify(mods),
          };

          // Notify parent with the generated NPC data
          if (onNpcCreated) onNpcCreated(npcUpdate);
          resetNpcGenState();
          onClose();
        },
        onError: (msg) => { throw new Error(msg); },
      });
    } catch (err) {
      console.error("[AI NPC Final Generate] Error:", err);
      setNpcGenError(err.message);
    } finally {
      setNpcGenLoading(false);
      setNpcGenProgress("");
    }
  }

  // Reset NPC gen modal state (without closing)
  function resetNpcGenState() {
    setNpcGenPrompt("");
    setNpcGenError(null);
    setNpcGenStep("interview");
    setNpcGenLoading(false);
    setNpcGenProgress("");
    setNpcInterviewHistory([]);
    setNpcCurrentQuestion(null);
    setNpcInterviewSummary("");
  }

  function handleClose() {
    resetNpcGenState();
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
    modalContentBox: {
      width: "90%",
      maxWidth: "520px",
      borderRadius: "12px",
      padding: "1.5rem",
      display: "flex",
      flexDirection: "column",
      gap: "1.25rem",
      background: "rgba(15, 14, 23, 0.95)",
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
      color: "var(--color-accent)",
      fontWeight: "bold",
      margin: 0,
      display: "flex",
      alignItems: "center",
      gap: "0.25rem",
    },
    modalCloseBtn: {
      background: "transparent",
      border: "none",
      color: "var(--color-muted)",
      fontSize: "1.1rem",
      cursor: "pointer",
    },
    modalBody: {
      fontSize: "0.85rem",
      lineHeight: 1.5,
      color: "var(--color-text)",
    },
    input: {
      padding: "0.55rem 0.75rem",
      fontSize: "0.85rem",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "6px",
      background: "rgba(0,0,0,0.3)",
      color: "var(--color-text)",
      outline: "none",
      width: "100%",
      boxSizing: "border-box",
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
    backBtn: {
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
    editorErrorText: {
      color: "var(--color-danger)",
      fontSize: "0.8rem",
      background: "rgba(235, 87, 87, 0.08)",
      border: "1px solid rgba(235, 87, 87, 0.2)",
      padding: "0.5rem",
      borderRadius: "4px",
      margin: "0 0 1rem 0",
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
  };

  return (
    <div style={styles.modalOverlay} className="fade-in">
      <div style={styles.modalContentBox} className="glass-panel gold-border-glow">
        <header style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>
            <span>✨ AI NPC Creator</span>
          </h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={npcGenLoading}
            style={styles.modalCloseBtn}
            className="touch-target"
          >
            ✕
          </button>
        </header>

        {/* Interview Step: Multiple Choice Q&A */}
        {npcGenStep === "interview" && (
          <div style={styles.modalBody}>
            {/* Optional initial idea field (collapsible) */}
            <details style={{ marginBottom: "0.75rem", opacity: 0.7 }}>
              <summary style={{ fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
                {npcGenPrompt ? "✏️ Initial idea set" : "➕ Add an initial idea (optional)"}
              </summary>
              <input
                type="text"
                placeholder="e.g., A shady tavern informant, a forest guardian..."
                value={npcGenPrompt}
                onChange={(e) => setNpcGenPrompt(e.target.value)}
                style={{ ...styles.input, marginTop: "0.4rem", fontSize: "0.82rem" }}
                className="form-input"
                maxLength={200}
              />
            </details>

            {/* Loading first question */}
            {npcGenLoading && !npcCurrentQuestion && (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <div className="spinner" style={{
                  width: "28px",
                  height: "28px",
                  border: "3px solid rgba(124,58,237,0.2)",
                  borderTopColor: "#7c3aed",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  margin: "0 auto 0.75rem",
                }} />
                <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                  {npcGenProgress || "Preparing your first question..."}
                </p>
              </div>
            )}

            {/* Current Question */}
            {npcCurrentQuestion && !npcGenLoading && (
              <>
                {/* Progress indicator */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.3rem",
                  }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", fontWeight: "600" }}>
                      Question {npcInterviewHistory.length + 1}
                    </span>
                    {npcInterviewHistory.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => handleFinalGenerate({})}
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--color-accent)",
                          background: "rgba(200,151,58,0.1)",
                          border: "1px solid rgba(200,151,58,0.2)",
                          borderRadius: "4px",
                          padding: "0.2rem 0.5rem",
                          cursor: "pointer",
                        }}
                        className="touch-target"
                      >
                        Generate Now →
                      </button>
                    )}
                  </div>
                  <div style={{
                    height: "4px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, ((npcInterviewHistory.length) / 5) * 100)}%`,
                      background: "linear-gradient(90deg, #7c3aed, var(--color-accent))",
                      borderRadius: "4px",
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                </div>

                {/* Answered questions summary (compact) */}
                {npcInterviewHistory.length > 0 && (
                  <div style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "6px",
                    padding: "0.4rem 0.6rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.72rem",
                    color: "var(--color-muted)",
                    lineHeight: "1.5",
                  }}>
                    {npcInterviewHistory.map((h, i) => (
                      <div key={i} style={{ display: "flex", gap: "0.3rem" }}>
                        <span style={{ color: "var(--color-accent)", fontWeight: "600", whiteSpace: "nowrap" }}>Q{i + 1}:</span>
                        <span>{h.answer.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Question Card */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(124,58,237,0.08), rgba(91,33,182,0.05))",
                  border: "1px solid rgba(124,58,237,0.15)",
                  borderRadius: "10px",
                  padding: "1rem",
                  marginBottom: "1rem",
                }}>
                  <p style={{
                    fontSize: "0.95rem",
                    color: "var(--color-text)",
                    fontWeight: "600",
                    lineHeight: "1.4",
                    marginBottom: "0.85rem",
                  }}>
                    {npcCurrentQuestion.question}
                  </p>

                  {/* Multiple Choice Answers */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {npcCurrentQuestion.choices.map((choice, idx) => {
                      const choiceColors = [
                        { bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.25)", accent: "#7c3aed" },
                        { bg: "rgba(8,145,178,0.1)", border: "rgba(8,145,178,0.25)", accent: "#0891b2" },
                        { bg: "rgba(217,119,6,0.1)", border: "rgba(217,119,6,0.25)", accent: "#d97706" },
                        { bg: "rgba(220,38,38,0.1)", border: "rgba(220,38,38,0.25)", accent: "#dc2626" },
                        { bg: "rgba(22,163,74,0.1)", border: "rgba(22,163,74,0.25)", accent: "#16a34a" },
                      ];
                      const c = choiceColors[idx % choiceColors.length];
                      return (
                        <button
                          key={choice.id || idx}
                          type="button"
                          onClick={() => handleInterviewAnswer(choice)}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.6rem",
                            padding: "0.6rem 0.75rem",
                            background: c.bg,
                            border: `1px solid ${c.border}`,
                            borderRadius: "8px",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.15s",
                            color: "var(--color-text)",
                          }}
                          className="touch-target"
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent; e.currentTarget.style.background = c.bg.replace("0.1", "0.18"); }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = c.bg; }}
                        >
                          <span style={{
                            width: "22px",
                            height: "22px",
                            minWidth: "22px",
                            borderRadius: "50%",
                            background: c.accent,
                            color: "var(--color-bg)",
                            fontSize: "0.72rem",
                            fontWeight: "700",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                            {idx + 1}
                          </span>
                          <div>
                            <div style={{ fontWeight: "600", fontSize: "0.85rem", marginBottom: "0.15rem" }}>
                              {choice.label}
                            </div>
                            {choice.description && (
                              <div style={{ fontSize: "0.76rem", color: "var(--color-muted)", lineHeight: "1.3" }}>
                                {choice.description}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Loading indicator for answer transition */}
            {npcGenLoading && npcCurrentQuestion === null && npcInterviewHistory.length > 0 && (
              <div style={{
                background: "rgba(124,58,237,0.12)",
                border: "1px solid rgba(124,58,237,0.25)",
                borderRadius: "8px",
                padding: "0.5rem 0.75rem",
                marginBottom: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
              }}>
                <div className="spinner" style={{
                  width: "14px",
                  height: "14px",
                  border: "2px solid rgba(124,58,237,0.3)",
                  borderTopColor: "#7c3aed",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: "0.82rem", color: "var(--color-accent)", fontWeight: "500" }}>
                  {npcGenProgress || "Thinking of the next question..."}
                </span>
              </div>
            )}

            {npcGenError && (
              <p style={styles.editorErrorText}>⚠️ {npcGenError}</p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={npcGenLoading}
                style={styles.backBtn}
                className="touch-target"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Generating Full NPC Step */}
        {npcGenStep === "generating_full" && (
          <div style={styles.modalBody}>
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <div className="spinner" style={{
                width: "32px",
                height: "32px",
                border: "3px solid rgba(124,58,237,0.2)",
                borderTopColor: "#7c3aed",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 0.75rem",
              }} />
              <p style={{ fontSize: "0.9rem", color: "var(--color-accent)", fontWeight: "600", marginBottom: "0.25rem" }}>
                Assembling your NPC...
              </p>
              <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.5rem" }}>
                {npcGenProgress || "Writing statblock and narrative..."}
              </p>

              {npcInterviewSummary && (
                <div style={{
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "8px",
                  padding: "0.6rem 0.8rem",
                  marginTop: "0.5rem",
                  fontSize: "0.78rem",
                  color: "var(--color-muted)",
                  lineHeight: "1.4",
                  textAlign: "left",
                }}>
                  <div style={{ fontWeight: "600", color: "var(--color-accent)", marginBottom: "0.25rem", fontSize: "0.72rem" }}>
                    NPC CONCEPT
                  </div>
                  {npcInterviewSummary}
                </div>
              )}
            </div>

            {npcGenError && (
              <p style={{ ...styles.editorErrorText, marginBottom: "1rem", textAlign: "center" }}>⚠️ {npcGenError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
