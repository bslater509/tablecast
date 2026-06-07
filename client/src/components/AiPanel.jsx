// =============================================================================
// Tablecast  AI Assistant Panel
// Supports tabbed interaction: Rules Helper and NPC Chat/Roleplay
// =============================================================================
import React, { useState, useEffect, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true,
});

function compileMarkdown(text) {
  if (!text) return "";
  try {
    return DOMPurify.sanitize(marked.parse(text));
  } catch (e) {
    console.error("[AiPanel] Markdown parsing failed:", e);
    return text;
  }
}

async function streamAiChat({ userId, message, npcId, history, onToken }) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tablecast-user-id": userId || "",
    },
    body: JSON.stringify({
      message,
      npcId,
      history,
      stream: true,
    }),
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to fetch response.");
    }
    const data = await res.json();
    if (data.reply) onToken(data.reply);
    return;
  }

  if (!res.ok || !res.body) {
    throw new Error("Failed to start AI stream.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedToken = false;

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

      if (event.type === "token" && event.text) {
        receivedToken = true;
        onToken(event.text);
      } else if (event.type === "error") {
        throw new Error(event.message || "Failed to query AI assistant.");
      }
    }
  }

  if (!receivedToken) {
    throw new Error("AI returned an empty response.");
  }
}

export default function AiPanel({ user }) {
  const [activeTab, setActiveTab] = useState("rules"); // "rules" or "npc"
  
  // Rules Helper state
  const [rulesQuery, setRulesQuery] = useState("");
  const [rulesHistory, setRulesHistory] = useState([
    {
      role: "assistant",
      text: "Hail! I am your D&D Rules Scholar. Ask me any question about spells, combat, actions, items, or general D&D rules, and I will search the library to help you.",
    },
  ]);
  const [rulesStreaming, setRulesStreaming] = useState(false);

  // NPC Roleplay state
  const [npcs, setNpcs] = useState([]);
  const [selectedNpcId, setSelectedNpcId] = useState("");
  const [npcQuery, setNpcQuery] = useState("");
  const [npcHistory, setNpcHistory] = useState([
    {
      role: "assistant",
      text: "Select a tavern guest or campaign NPC from the dropdown above, and we can begin our discussion.",
    },
  ]);
  const [npcStreaming, setNpcStreaming] = useState(false);

  const rulesScrollRef = useRef(null);
  const npcScrollRef = useRef(null);

  // Fetch list of NPCs
  useEffect(() => {
    async function loadNpcs() {
      try {
        const res = await fetch("/api/npcs");
        if (res.ok) {
          const data = await res.json();
          setNpcs(data);
          if (data.length > 0 && !selectedNpcId) {
            setSelectedNpcId(data[0].id.toString());
          }
        }
      } catch (err) {
        console.error("Failed to load NPCs for AI chat:", err);
      }
    }
    loadNpcs();
  }, []);

  // Auto-scroll chat boxes
  useEffect(() => {
    if (rulesScrollRef.current) {
      rulesScrollRef.current.scrollTop = rulesScrollRef.current.scrollHeight;
    }
  }, [rulesHistory, rulesStreaming]);

  useEffect(() => {
    if (npcScrollRef.current) {
      npcScrollRef.current.scrollTop = npcScrollRef.current.scrollHeight;
    }
  }, [npcHistory, npcStreaming]);



  // Submit Rules query
  const handleRulesSubmit = async (e) => {
    e.preventDefault();
    if (!rulesQuery.trim() || rulesStreaming) return;

    const query = rulesQuery.trim();
    setRulesQuery("");

    const userMsg = { role: "user", text: query };
    const updatedHistory = [...rulesHistory, userMsg];
    setRulesHistory(updatedHistory);
    setRulesStreaming(true);

    let accumulated = "";
    let assistantStarted = false;

    try {
      await streamAiChat({
        userId: user?.id,
        message: query,
        history: updatedHistory.slice(1, -1),
        onToken: (text) => {
          accumulated += text;
          setRulesHistory((prev) => {
            if (!assistantStarted) {
              assistantStarted = true;
              return [...prev, { role: "assistant", text: accumulated }];
            }
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", text: accumulated };
            return copy;
          });
        },
      });
    } catch (err) {
      const errorText = `Error: ${err.message || "Connection lost."}`;
      setRulesHistory((prev) => {
        if (!assistantStarted) {
          return [...prev, { role: "assistant", text: errorText }];
        }
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          text: accumulated ? `${accumulated}\n\n${errorText}` : errorText,
        };
        return copy;
      });
    } finally {
      setRulesStreaming(false);
    }
  };

  // Submit NPC Chat query
  const handleNpcSubmit = async (e) => {
    e.preventDefault();
    if (!npcQuery.trim() || !selectedNpcId || npcStreaming) return;

    const query = npcQuery.trim();
    const npc = npcs.find((n) => n.id.toString() === selectedNpcId);
    if (!npc) return;

    setNpcQuery("");

    const userMsg = { role: "user", text: query };
    const updatedHistory = [...npcHistory, userMsg];
    setNpcHistory(updatedHistory);
    setNpcStreaming(true);

    let accumulated = "";
    let assistantStarted = false;

    try {
      await streamAiChat({
        userId: user?.id,
        message: query,
        npcId: Number(selectedNpcId),
        history: updatedHistory.slice(1, -1),
        onToken: (text) => {
          accumulated += text;
          setNpcHistory((prev) => {
            if (!assistantStarted) {
              assistantStarted = true;
              return [...prev, { role: "assistant", text: accumulated }];
            }
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", text: accumulated };
            return copy;
          });
        },
      });
    } catch (err) {
      const errorText = `Error: ${err.message || "Connection lost."}`;
      setNpcHistory((prev) => {
        if (!assistantStarted) {
          return [...prev, { role: "assistant", text: errorText }];
        }
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          text: accumulated ? `${accumulated}\n\n${errorText}` : errorText,
        };
        return copy;
      });
    } finally {
      setNpcStreaming(false);
    }
  };

  const clearRulesHistory = () => {
    setRulesHistory([
      {
        role: "assistant",
        text: "Hail! I am your D&D Rules Scholar. Ask me any question about spells, combat, actions, items, or general D&D rules, and I will search the library to help you.",
      },
    ]);
  };

  const clearNpcHistory = () => {
    const npc = npcs.find((n) => n.id.toString() === selectedNpcId);
    setNpcHistory([
      {
        role: "assistant",
        text: npc ? `You are now talking to ${npc.name}. Ask your questions, adventurer.` : "Select an NPC to start roleplaying.",
      },
    ]);
  };

  return (
    <div style={styles.container} className="fade-in">
      {/* Tab Selector Nav */}
      <div style={styles.tabNav}>
        <button
          onClick={() => setActiveTab("rules")}
          style={{
            ...styles.tabBtn,
            background: activeTab === "rules" ? "var(--color-accent-dim)" : "rgba(255,255,255,0.02)",
            color: activeTab === "rules" ? "var(--color-accent)" : "var(--color-muted)",
            borderColor: activeTab === "rules" ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
          }}
          className="touch-target btn-hover-scale"
        >
          📜 Rules Scholar
        </button>
        <button
          onClick={() => setActiveTab("npc")}
          style={{
            ...styles.tabBtn,
            background: activeTab === "npc" ? "var(--color-accent-dim)" : "rgba(255,255,255,0.02)",
            color: activeTab === "npc" ? "var(--color-accent)" : "var(--color-muted)",
            borderColor: activeTab === "npc" ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
          }}
          className="touch-target btn-hover-scale"
        >
          🗣️ NPC Roleplay
        </button>
      </div>

      {/* Rules Scholar View */}
      {activeTab === "rules" && (
        <div style={styles.viewBody}>
          <div style={styles.headerRow}>
            <span style={styles.panelSubtitle}>Query rules, spells, or combat terms</span>
            <button onClick={clearRulesHistory} style={styles.resetBtn} className="btn-hover-scale">
              Clear Logs
            </button>
          </div>

          {/* Messages Scrollbox */}
          <div ref={rulesScrollRef} style={styles.scrollArea}>
            {rulesHistory.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.bubble,
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  background: msg.role === "user" ? "rgba(200, 151, 58, 0.1)" : "rgba(255, 255, 255, 0.04)",
                  borderColor: msg.role === "user" ? "rgba(200, 151, 58, 0.3)" : "rgba(255, 255, 255, 0.06)",
                }}
              >
                <div style={styles.bubbleHeader}>
                  {msg.role === "user" ? user?.username || "You" : "Rules Scholar"}
                </div>
                <div 
                  className="wiki-content"
                  style={styles.bubbleText}
                  dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
                />
              </div>
            ))}
            {rulesStreaming && rulesHistory[rulesHistory.length - 1]?.role !== "assistant" && (
              <div style={{ ...styles.bubble, alignSelf: "flex-start" }}>
                <div style={styles.bubbleHeader}>Rules Scholar</div>
                <div style={styles.loadingPlaceholder}>
                  Searching archives
                  <span className="dotAnim">.</span>
                  <span className="dotAnim" style={{ animationDelay: "0.2s" }}>.</span>
                  <span className="dotAnim" style={{ animationDelay: "0.4s" }}>.</span>
                </div>
              </div>
            )}
          </div>

          {/* Form Input */}
          <form onSubmit={handleRulesSubmit} style={styles.formRow}>
            <input
              type="text"
              placeholder="Ask a rule (e.g. 'How does grappling work?')"
              value={rulesQuery}
              onChange={(e) => setRulesQuery(e.target.value)}
              style={styles.input}
              className="form-input"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={rulesStreaming || !rulesQuery.trim()}
              style={{
                ...styles.sendBtn,
                opacity: rulesQuery.trim() && !rulesStreaming ? 1 : 0.4,
              }}
              className="touch-target btn-hover-scale"
            >
              ➤
            </button>
          </form>
        </div>
      )}

      {/* NPC Roleplay View */}
      {activeTab === "npc" && (
        <div style={styles.viewBody}>
          <div style={styles.npcHeaderConfig} className="glass-panel">
            <div style={styles.npcSelectCol}>
              <label style={styles.selectLabel}>Select NPC Persona</label>
              <select
                value={selectedNpcId}
                onChange={(e) => {
                  setSelectedNpcId(e.target.value);
                  const selected = npcs.find((n) => n.id.toString() === e.target.value);
                  setNpcHistory([
                    {
                      role: "assistant",
                      text: selected ? `You are now talking to ${selected.name}. Ask your questions, adventurer.` : "Select an NPC template.",
                    },
                  ]);
                }}
                style={styles.select}
              >
                {npcs.length === 0 && <option value="">No NPC templates found</option>}
                {npcs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} {n.race ? `(${n.race})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={clearNpcHistory} style={styles.resetBtn} className="btn-hover-scale">
              Reset
            </button>
          </div>

          {/* NPC Messages Scrollbox */}
          <div ref={npcScrollRef} style={styles.scrollArea}>
            {npcHistory.map((msg, idx) => {
              const selectedNpc = npcs.find((n) => n.id.toString() === selectedNpcId);
              const senderName = msg.role === "user" ? user?.username || "You" : (selectedNpc?.name || "NPC");
              const npcAvatar = msg.role === "assistant" && selectedNpc?.imageUrl ? selectedNpc.imageUrl : "";
              return (
                <div
                  key={idx}
                  style={{
                    ...styles.bubble,
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    background: msg.role === "user" ? "rgba(200, 151, 58, 0.1)" : "rgba(255, 255, 255, 0.04)",
                    borderColor: msg.role === "user" ? "rgba(200, 151, 58, 0.3)" : "rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.15rem" }}>
                    {npcAvatar && (
                      <img 
                        src={npcAvatar} 
                        alt={senderName} 
                        style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid var(--color-accent)", objectFit: "cover" }} 
                      />
                    )}
                    <div style={styles.bubbleHeader}>{senderName}</div>
                  </div>
                  <div 
                    className="wiki-content"
                    style={styles.bubbleText}
                    dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
                  />
                </div>
              );
            })}
            {npcStreaming && npcHistory[npcHistory.length - 1]?.role !== "assistant" && (
              <div style={{ ...styles.bubble, alignSelf: "flex-start" }}>
                <div style={styles.bubbleHeader}>
                  {npcs.find((n) => n.id.toString() === selectedNpcId)?.name || "NPC"}
                </div>
                <div style={styles.loadingPlaceholder}>
                  NPC is thinking
                  <span className="dotAnim">.</span>
                  <span className="dotAnim" style={{ animationDelay: "0.2s" }}>.</span>
                  <span className="dotAnim" style={{ animationDelay: "0.4s" }}>.</span>
                </div>
              </div>
            )}
          </div>

          {/* Form Input */}
          <form onSubmit={handleNpcSubmit} style={styles.formRow}>
            <input
              type="text"
              placeholder={selectedNpcId ? `Talk to ${npcs.find((n) => n.id.toString() === selectedNpcId)?.name || "NPC"}...` : "Select an NPC template first"}
              value={npcQuery}
              onChange={(e) => setNpcQuery(e.target.value)}
              disabled={!selectedNpcId || npcStreaming}
              style={styles.input}
              className="form-input"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={npcStreaming || !npcQuery.trim() || !selectedNpcId}
              style={{
                ...styles.sendBtn,
                opacity: npcQuery.trim() && !npcStreaming && selectedNpcId ? 1 : 0.4,
              }}
              className="touch-target btn-hover-scale"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component CSS-in-JS Styles
// ---------------------------------------------------------------------------
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "0.5rem 0.75rem",
    gap: "0.5rem",
    background: "var(--color-bg)",
  },
  tabNav: {
    display: "flex",
    gap: "0.4rem",
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: "0.5rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: "6px",
    fontSize: "0.85rem",
    fontWeight: "600",
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.2s",
  },
  viewBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    overflow: "hidden",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.1rem 0.25rem",
    flexShrink: 0,
  },
  panelSubtitle: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  resetBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "0.2rem 0.6rem",
    borderRadius: "4px",
    fontSize: "0.7rem",
    color: "var(--color-muted)",
    cursor: "pointer",
  },
  npcHeaderConfig: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    gap: "1rem",
    flexShrink: 0,
  },
  npcSelectCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  selectLabel: {
    fontSize: "0.65rem",
    textTransform: "uppercase",
    fontWeight: "bold",
    color: "var(--color-accent)",
    letterSpacing: "0.03em",
  },
  select: {
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "6px",
    color: "var(--color-text)",
    padding: "0.45rem",
    fontSize: "0.85rem",
    outline: "none",
    width: "100%",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    padding: "0.25rem",
    background: "rgba(0, 0, 0, 0.15)",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.02)",
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    padding: "0.5rem 0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  bubbleHeader: {
    fontSize: "0.7rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
  },
  bubbleText: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
  },
  loadingPlaceholder: {
    fontSize: "0.8rem",
    fontStyle: "italic",
    color: "var(--color-muted)",
  },
  formRow: {
    display: "flex",
    gap: "0.4rem",
    flexShrink: 0,
    paddingTop: "0.2rem",
  },
  input: {
    flex: 1,
    padding: "0.65rem 0.95rem",
    fontSize: "0.9rem",
  },
  sendBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: "6px",
    border: "none",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    color: "#0f0e17",
    fontSize: "1.05rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.2s",
  },
  // Formatted response items
  paragraph: {
    marginBottom: "0.5rem",
    lineHeight: "1.45",
  },
  boldText: {
    color: "var(--color-accent)",
    fontWeight: "bold",
  },
  textLine: {
    marginBottom: "0.15rem",
  },
  bulletList: {
    margin: "0.15rem 0",
    paddingLeft: "1.1rem",
  },
  bulletItem: {
    fontSize: "0.82rem",
    marginBottom: "0.1rem",
  },
};
