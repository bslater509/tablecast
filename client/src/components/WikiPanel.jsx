// =============================================================================
// Tablecast — Campaign Wiki / Player Journal Panel (Phase 4)
// Allows players and DMs to view unlocked campaign logs, location info, and NPCs.
// Categorizes entries into Locations, NPCs, Lore, and Session Logs.
// =============================================================================
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Menu } from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import AiAssistButton, { AI_FIELD_ACTIONS } from "./AiAssistButton";
import TokenPresetIcon from "./TokenPresetIcon";
import { NPC_TOKEN_PRESETS, matchNpcPreset, generateTokenSvgUrl } from "../data/npcTokenPresets";
import WikiTreeSidebar from "./WikiTreeSidebar";
import { useSocket } from "../context/SocketContext";
import { WikiPanelSkeleton } from "./PanelSkeleton";

marked.setOptions({
  gfm: true,
  breaks: true,
});

// Interactive 5e Statblock Sub-component for NPCs
function NpcStatblock({ npc, socket, isDM, onHpChange }) {
  const getMod = (score) => {
    const mod = Math.floor((Number(score || 10) - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const handleAbilityRoll = (statName, score) => {
    const modifier = Math.floor((score - 10) / 2);
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + modifier;
    if (socket) {
      socket.emit("chat:send", {
        sender: npc.name,
        text: `rolled a ${statName.charAt(0).toUpperCase() + statName.slice(1)} Check! Total: ${total}`,
        type: "roll",
        rollDetails: {
          rollName: `${statName.charAt(0).toUpperCase() + statName.slice(1)} Check`,
          formula: `1d20 + ${modifier >= 0 ? "+" : ""}${modifier}`,
          rolls: [d20],
          modifier,
          total,
          isAttack: false,
        },
      });
    }
  };

  const handleAttackRoll = (atk) => {
    const toHit = Number(atk.toHit || 0);
    const toHitD20 = Math.floor(Math.random() * 20) + 1;
    const toHitTotal = toHitD20 + toHit;

    // Simple parser for dice formulas like "1d6+2" or "2d10"
    let damageTotal = 0;
    let damageRolls = [];
    const diceExpr = (atk.damage || "1d4").trim().toLowerCase();
    const match = diceExpr.match(/^(\d+)d(\d+)(.*)$/);
    let formulaText = `Hit: 1d20 + ${toHit} | Dmg: ${diceExpr}`;
    
    if (match) {
      const count = parseInt(match[1]);
      const sides = parseInt(match[2]);
      const remainder = match[3] || "";
      let flatMod = 0;
      const modMatch = remainder.match(/([+-])\s*(\d+)/);
      if (modMatch) {
        flatMod = parseInt(modMatch[2]) * (modMatch[1] === "-" ? -1 : 1);
      }
      for (let i = 0; i < count; i++) {
        const r = Math.floor(Math.random() * sides) + 1;
        damageRolls.push(r);
        damageTotal += r;
      }
      damageTotal += flatMod;
    } else {
      damageTotal = Math.max(1, parseInt(diceExpr) || 4);
    }

    if (socket) {
      socket.emit("chat:send", {
        sender: npc.name,
        text: `swings with their ${atk.name}! Hit: ${toHitTotal} | Damage: ${damageTotal}`,
        type: "roll",
        rollDetails: {
          rollName: atk.name,
          formula: formulaText,
          isAttack: true,
          toHitRoll: toHitD20,
          toHitMod: toHit,
          toHitTotal,
          damageRolls,
          damageDice: atk.damage || "1d4",
          damageMod: 0,
          damageTotal,
        },
      });
    }
  };

  let actionsList = [];
  try {
    actionsList = JSON.parse(npc.actions || "[]");
  } catch (e) {}

  return (
    <div style={statblockStyles.block} className="glass-panel gold-border-glow">
      <div style={statblockStyles.header}>
        <div>
          <h2 style={statblockStyles.name}>{npc.name}</h2>
          <div style={statblockStyles.meta}>
            CR {npc.cr} • {npc.race} {npc.class} (Level {npc.level})
          </div>
        </div>
        {npc.imageUrl && (
          <img src={npc.imageUrl} alt={npc.name} style={statblockStyles.avatar} />
        )}
      </div>

      <div style={statblockStyles.hpAcRow}>
        <div style={statblockStyles.statItem}>
          <strong>AC:</strong> {npc.ac}
        </div>
        <div style={statblockStyles.statItem} className="hp-adjuster-widget">
          <strong>HP:</strong> {npc.hp} / {npc.maxHp}
          {isDM && (
            <div style={statblockStyles.hpControls}>
              <button
                type="button"
                onClick={() => onHpChange(Math.max(0, npc.hp - 1))}
                style={statblockStyles.hpBtn}
                className="touch-target btn-hover-scale"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => onHpChange(Math.min(npc.maxHp, npc.hp + 1))}
                style={statblockStyles.hpBtn}
                className="touch-target btn-hover-scale"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={statblockStyles.abilityGrid}>
        {["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => {
          const score = npc[stat] || 10;
          return (
            <button
              key={stat}
              type="button"
              onClick={() => handleAbilityRoll(stat, score)}
              style={statblockStyles.abilityBox}
              className="touch-target btn-hover-scale glass-panel"
            >
              <span style={statblockStyles.abilityLabel}>{stat.slice(0, 3).toUpperCase()}</span>
              <span style={statblockStyles.abilityScore}>{score}</span>
              <span style={statblockStyles.abilityMod}>{getMod(score)}</span>
            </button>
          );
        })}
      </div>

      {actionsList.length > 0 && (
        <div style={statblockStyles.actionsSection}>
          <h3 style={statblockStyles.sectionTitle}>Actions</h3>
          <div style={statblockStyles.actionsList}>
            {actionsList.map((action, i) => (
              <div key={action.name || i} style={statblockStyles.actionItem} className="glass-panel">
                <div style={statblockStyles.actionHeader}>
                  <strong style={statblockStyles.actionName}>{action.name}</strong>
                  <button
                    type="button"
                    onClick={() => handleAttackRoll(action)}
                    style={statblockStyles.rollBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Roll
                  </button>
                </div>
                {action.description && (
                  <p style={statblockStyles.actionDesc}>{action.description}</p>
                )}
                {action.damage && (
                  <div style={statblockStyles.actionDmg}>
                    <strong>Damage:</strong> {action.damage} {action.toHit ? `(Hit Bonus: +${action.toHit})` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WikiPanel({ user, isPopout = false }) {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [articles, setArticles] = useState([]);
  const [linkedSession, setLinkedSession] = useState(null);
  const [npcs, setNpcs] = useState([]);
  const [monsters, setMonsters] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Categorized Section State
  const [activeCategoryTab, setActiveCategoryTab] = useState("LOCATION"); // "LOCATION" | "NPC" | "LORE" | "LOG" | "MONSTER" | "SPELL" | "ITEM" | "RULE" | "CLASS" | "RACE"

  // Creation Flow States
  const [showCategoryPrompt, setShowCategoryPrompt] = useState(false);

  // DM Workspace Editor States
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null); // null = new article
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("LORE");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState([]);
  const [editIsVisible, setEditIsVisible] = useState(false);
  const [editorTab, setEditorTab] = useState("write"); // "write" | "preview"
  const [tagInput, setTagInput] = useState("");
  const [editorError, setEditorError] = useState(null);

  // NPC Editor Specific States
  const [editingNpc, setEditingNpc] = useState(null);
  const [importQuery, setImportQuery] = useState("");

  // Custom Delete Modal State
  const [articleToDelete, setArticleToDelete] = useState(null);

  // AI Assist / Generator states
  const [showNpcGenModal, setShowNpcGenModal] = useState(false);
  const [npcGenPrompt, setNpcGenPrompt] = useState("");
  const [npcGenLoading, setNpcGenLoading] = useState(false);
  const [npcGenError, setNpcGenError] = useState(null);
  const [npcGenStep, setNpcGenStep] = useState("interview"); // "interview" | "generating_full"
  const [npcGenProgress, setNpcGenProgress] = useState(""); // Live status message during generation
  const [npcInterviewHistory, setNpcInterviewHistory] = useState([]); // [{ question, answer: { id, label, description } }]
  const [npcCurrentQuestion, setNpcCurrentQuestion] = useState(null); // { question, choices: [{ id, label, description }] }
  const [npcInterviewSummary, setNpcInterviewSummary] = useState(""); // Summary when AI signals generate
  const [npcCopiedPrompt, setNpcCopiedPrompt] = useState(false); // "Copied!" feedback for image prompt copy
  // Monster AI Generator states
  const [showMonsterGenModal, setShowMonsterGenModal] = useState(false);
  const [monsterGenPrompt, setMonsterGenPrompt] = useState("");
  const [monsterGenLoading, setMonsterGenLoading] = useState(false);
  const [monsterGenError, setMonsterGenError] = useState(null);
  const [monsterGenStep, setMonsterGenStep] = useState("options"); // "options" | "generating"
  const [monsterGenProgress, setMonsterGenProgress] = useState("");
  const [monsterGenOptions, setMonsterGenOptions] = useState([]);
  const [monsterGenSelected, setMonsterGenSelected] = useState(null);

  // Sidebar drawer state (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Determine if user has DM privileges
  const isDM = user?.role === "DM";

  const authHeaders = { "x-tablecast-user-id": String(user?.id || "") };
  const jsonAuthHeaders = { "Content-Type": "application/json", ...authHeaders };

  const buildAssistContext = (fieldId) => {
    if (fieldId === "markdown") {
      return {
        entityType: "article",
        article: {
          title: editTitle,
          category: editCategory,
          tags: editTags,
        },
      };
    }
    if (!editingNpc) return {};
    const isMonster = activeCategoryTab === "MONSTER";
    const entityKey = isMonster ? "monster" : "npc";
    return {
      entityType: entityKey,
      [entityKey]: {
        name: editingNpc.name,
        race: editingNpc.race,
        class: editingNpc.class,
        level: editingNpc.level,
        alignment: editingNpc.alignment,
        ac: editingNpc.ac,
        hp: editingNpc.hp,
        maxHp: editingNpc.maxHp,
        cr: editingNpc.cr,
        strength: editingNpc.strength,
        dexterity: editingNpc.dexterity,
        constitution: editingNpc.constitution,
        intelligence: editingNpc.intelligence,
        wisdom: editingNpc.wisdom,
        charisma: editingNpc.charisma,
        appearance: editingNpc.appearance,
        personality: editingNpc.personality,
        history: editingNpc.history,
        partyRelationship: editingNpc.partyRelationship,
        description: editingNpc.description,
      },
    };
  };

  // Start NPC interview when the modal opens
  useEffect(() => {
    if (showNpcGenModal) {
      resetNpcGenState();
      const timer = setTimeout(() => startInterview(), 80);
      return () => clearTimeout(timer);
    }
  }, [showNpcGenModal]);

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
      // Non-streaming fallback (shouldn't happen with new endpoints, but handles edge cases)
      const body = await res.text();
      try {
        const data = JSON.parse(body);
        if (data.error) throw new Error(data.error);
        if (onResult) onResult(data);
      } catch (e) {
        // If JSON parsing fails, the body might contain partial SSE data
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
            // AI immediately has enough info — go straight to final generation
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
            // Transition to generating the full NPC (keeps loading true)
            // Pass updatedHistory explicitly to avoid stale closure issues
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

    // Use the explicitly provided history, or fall back to state (which may be stale in callbacks)
    const effectiveHistory = historyOverride || npcInterviewHistory;

    // Build a summary from interview history if not provided
    const summaryText = interviewResult.summary || effectiveHistory.map(
      (h, i) => `${h.question}: ${h.answer.label}${h.answer.description ? " — " + h.answer.description : ""}`
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

          setEditingNpc((prev) => ({
            ...prev,
            name: aiData.name || prev.name,
            race: aiData.race || prev.race,
            class: aiData.class || prev.class,
            level: Number(aiData.level) || prev.level,
            hp: Number(aiData.hp) || prev.hp,
            maxHp: Number(aiData.maxHp) || Number(aiData.hp) || prev.maxHp,
            ac: Number(aiData.ac) || prev.ac,
            cr: aiData.cr || prev.cr,
            strength: Number(aiData.strength) || prev.strength,
            dexterity: Number(aiData.dexterity) || prev.dexterity,
            constitution: Number(aiData.constitution) || prev.constitution,
            intelligence: Number(aiData.intelligence) || prev.intelligence,
            wisdom: Number(aiData.wisdom) || prev.wisdom,
            charisma: Number(aiData.charisma) || prev.charisma,
            alignment: aiData.alignment || prev.alignment,
            appearance: aiData.appearance || prev.appearance,
            personality: aiData.personality || prev.personality,
            history: aiData.history || prev.history,
            partyRelationship: aiData.partyRelationship || prev.partyRelationship,
            description: aiData.description || prev.description,
            actions: Array.isArray(aiData.actions) ? JSON.stringify(aiData.actions) : prev.actions,
            modifiers: JSON.stringify(mods)
          }));

          // Close modal and reset
          setShowNpcGenModal(false);
          resetNpcGenState();
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

  // Reset NPC gen modal to initial interview step
  function resetNpcGenModal() {
    setShowNpcGenModal(false);
    resetNpcGenState();
  }

  useEffect(() => {
    if (showMonsterGenModal) {
      resetMonsterGenState();
    }
  }, [showMonsterGenModal]);

  // Reset monster gen state
  function resetMonsterGenState() {
    setMonsterGenPrompt("");
    setMonsterGenLoading(false);
    setMonsterGenError(null);
    setMonsterGenStep("options");
    setMonsterGenProgress("");
    setMonsterGenOptions([]);
    setMonsterGenSelected(null);
  }

  function resetMonsterGenModal() {
    setShowMonsterGenModal(false);
    resetMonsterGenState();
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
        setEditingNpc({
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
        });
        setActiveCategoryTab("MONSTER");
        setIsEditing(true);
        setShowMonsterGenModal(false);
      } else {
        throw new Error("Invalid monster data received.");
      }
    } catch (err) {
      setMonsterGenError(err.message);
    } finally {
      setMonsterGenLoading(false);
    }
  }

  const calculateModifier = (score) => {
    const mod = Math.floor((Number(score || 10) - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  // Build an image generation prompt from NPC data (look, location, gear, vibe)
  function buildImagePrompt(npc, styleSuffix = "") {
    const parts = [];
    // Core identity
    parts.push(`Fantasy portrait of ${npc.name || "an NPC"}`);
    if (npc.race) parts.push(`a ${npc.race}`);
    if (npc.class) parts.push(`${npc.class}`);
    // Alignment / vibe
    if (npc.alignment) parts.push(`with a ${npc.alignment.toLowerCase()} alignment`);
    // Appearance (strip markdown for cleaner prompt)
    if (npc.appearance) {
      const clean = npc.appearance.replace(/[*#>`_~\[\]]/g, "").trim();
      if (clean) parts.push(clean);
    }
    // Personality flavour
    if (npc.personality) {
      const clean = npc.personality.replace(/[*#>`_~\[\]]/g, "").trim().slice(0, 160);
      if (clean) parts.push(`Personality: ${clean}`);
    }
    // Description / location hints
    if (npc.description) {
      const clean = npc.description.replace(/[*#>`_~\[\]]/g, "").trim().slice(0, 200);
      if (clean) parts.push(clean);
    }
    // Gear / equipment from actions
    if (npc.actions) {
      try {
        const actions = JSON.parse(npc.actions);
        const weaponNames = actions.map(a => a.name).filter(Boolean).slice(0, 3);
        if (weaponNames.length > 0) {
          parts.push(`wielding ${weaponNames.join(", ")}`);
        }
      } catch (e) {}
    }
    // Default style qualifier
    parts.push("D&D 5e character art, detailed fantasy illustration, full body portrait, professional lighting");
    // Append DM's custom style suffix from settings (if any)
    if (styleSuffix) {
      parts.push(styleSuffix);
    }
    return parts.join(", ");
  }

  // Copy the image prompt to clipboard with brief feedback
  async function handleCopyImagePrompt(npc) {
    try {
      // Fetch the DM's configured image style from the backend
      let styleSuffix = "";
      try {
        const styleRes = await fetch("/api/ai/image-style");
        if (styleRes.ok) {
          const styleData = await styleRes.json();
          styleSuffix = styleData.style || "";
        }
      } catch (e) {
        // Non-critical - proceed without style
      }

      const prompt = buildImagePrompt(npc, styleSuffix);
      await navigator.clipboard.writeText(prompt);
      setNpcCopiedPrompt(true);
      setTimeout(() => setNpcCopiedPrompt(false), 2000);
    } catch (err) {
      console.error("[Image Prompt] Clipboard copy failed:", err);
      // Fallback: select text in a temp input
      let styleSuffix = "";
      try {
        const styleRes = await fetch("/api/ai/image-style");
        if (styleRes.ok) {
          const styleData = await styleRes.json();
          styleSuffix = styleData.style || "";
        }
      } catch (e) {}
      const prompt = buildImagePrompt(npc, styleSuffix);
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setNpcCopiedPrompt(true);
      setTimeout(() => setNpcCopiedPrompt(false), 2000);
    }
  }

  // Fetch articles and NPCs on mount/user role change
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const wikiUrl = isDM ? "/api/wiki" : "/api/wiki?visible=true";
        const wikiRes = await fetch(wikiUrl, { headers: authHeaders });
        if (!wikiRes.ok) {
          throw new Error("Failed to load campaign records.");
        }
        const wikiData = await wikiRes.json();
        setArticles(wikiData);

        const npcsRes = await fetch("/api/npcs", { headers: authHeaders });
        if (npcsRes.ok) {
          const npcsData = await npcsRes.json();
          setNpcs(npcsData);
        }

        const monstersRes = await fetch("/api/monsters", { headers: authHeaders });
        if (monstersRes.ok) {
          const monstersData = await monstersRes.json();
          setMonsters(monstersData);
        }
      } catch (err) {
        console.error("[WikiPanel] Fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isDM]);

  useEffect(() => {
    async function loadLinkedSession() {
      if (!selectedArticle || selectedArticle.category !== "LOG" || !isDM) {
        setLinkedSession(null);
        return;
      }

      try {
        const res = await fetch("/api/sessions", { headers: authHeaders });
        if (!res.ok) {
          setLinkedSession(null);
          return;
        }
        const sessions = await res.json();
        const match = sessions.find((session) => session.wikiLogId === selectedArticle.id);
        setLinkedSession(match || null);
      } catch (err) {
        console.error("[WikiPanel] Failed to load linked session:", err);
        setLinkedSession(null);
      }
    }

    loadLinkedSession();
  }, [selectedArticle, isDM, authHeaders]);

  // ── Real-time wiki sync via Socket.io ──────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleCreated = (data) => {
      if (data?.article) {
        setArticles((prev) => [data.article, ...prev]);
      }
    };
    const handleUpdated = (data) => {
      if (data?.article) {
        const updated = data.article;
        setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setSelectedArticle((prev) => (prev?.id === updated.id ? updated : prev));
      }
    };
    const handleDeleted = (data) => {
      if (data?.id != null) {
        setArticles((prev) => prev.filter((a) => a.id !== data.id));
        setSelectedArticle((prev) => (prev?.id === data.id ? null : prev));
      }
    };

    socket.on("wiki:article:created", handleCreated);
    socket.on("wiki:article:updated", handleUpdated);
    socket.on("wiki:article:deleted", handleDeleted);

    return () => {
      socket.off("wiki:article:created", handleCreated);
      socket.off("wiki:article:updated", handleUpdated);
      socket.off("wiki:article:deleted", handleDeleted);
    };
  }, [socket]);

  if (loading) {
    return <WikiPanelSkeleton />;
  }

  // Filter list by search query
  const filteredArticles = articles.filter((article) => {
    const query = searchQuery.toLowerCase();
    const titleMatch = article.title.toLowerCase().includes(query);
    const contentMatch = article.content.toLowerCase().includes(query);
    
    let tagsMatch = false;
    try {
      const tags = JSON.parse(article.tags || "[]");
      tagsMatch = tags.some((t) => t.toLowerCase().includes(query));
    } catch (e) {}

    return titleMatch || contentMatch || tagsMatch;
  });

  const filteredNpcs = npcs.filter((npc) => {
    const query = searchQuery.toLowerCase();
    const nameMatch = npc.name.toLowerCase().includes(query);
    const raceMatch = (npc.race || "").toLowerCase().includes(query);
    const classMatch = (npc.class || "").toLowerCase().includes(query);
    const descMatch = (npc.description || "").toLowerCase().includes(query);
    const alignMatch = (npc.alignment || "").toLowerCase().includes(query);
    const appearanceMatch = (npc.appearance || "").toLowerCase().includes(query);
    const personalityMatch = (npc.personality || "").toLowerCase().includes(query);
    const historyMatch = (npc.history || "").toLowerCase().includes(query);
    const relationshipMatch = (npc.partyRelationship || "").toLowerCase().includes(query);
    return nameMatch || raceMatch || classMatch || descMatch || alignMatch || appearanceMatch || personalityMatch || historyMatch || relationshipMatch;
  });

  const filteredMonsters = monsters.filter((monster) => {
    const query = searchQuery.toLowerCase();
    const nameMatch = monster.name.toLowerCase().includes(query);
    const raceMatch = (monster.race || "").toLowerCase().includes(query);
    const classMatch = (monster.class || "").toLowerCase().includes(query);
    const descMatch = (monster.description || "").toLowerCase().includes(query);
    const alignMatch = (monster.alignment || "").toLowerCase().includes(query);
    const appearanceMatch = (monster.appearance || "").toLowerCase().includes(query);
    const personalityMatch = (monster.personality || "").toLowerCase().includes(query);
    const historyMatch = (monster.history || "").toLowerCase().includes(query);
    const relationshipMatch = (monster.partyRelationship || "").toLowerCase().includes(query);
    return nameMatch || raceMatch || classMatch || descMatch || alignMatch || appearanceMatch || personalityMatch || historyMatch || relationshipMatch;
  });

  const categoryArticles = filteredArticles.filter(
    (article) => (article.category || "LORE") === activeCategoryTab
  );

  // Markdown Compilation with DOMPurify XSS Sanitization
  function compileMarkdown(markdownText) {
    if (!markdownText) return "";
    try {
      const rawHtml = marked.parse(markdownText);
      return DOMPurify.sanitize(rawHtml);
    } catch (e) {
      console.error("[WikiPanel] Markdown parsing failed:", e);
      return "<p style='color:var(--color-danger);'>Failed to parse content.</p>";
    }
  }

  // Back button handler for reading view on mobile
  function handleBack() {
    setSelectedArticle(null);
  }

  // Templates Definitions
  const templates = {
    LOCATION: `### Location Name
*Category: Dungeon / Settlement / Wilderness*
***
> **Description**
> Describe the surroundings, sights, sounds, and atmosphere that the players notice first.

- **Points of Interest:**
  - **Area 1:** Details about Area 1.
  - **Area 2:** Details about Area 2.
- **Key NPCs:** Notable NPCs found here.
`,
    NPC: `### NPC Background
*Race Class, Alignment*
***
- **Appearance**: Description of physical appearance.
- **Personality**: Character traits, bonds, flaws, and secrets.
- **History**: Brief backstory and goals.
- **Party Relationship**: Notes on how they view the player characters.
`,
    LORE: `### Lore Topic
*Item / Deity / Historic Event*
***
- **Overview**: Summary of the subject.
- **History**: Historical context, origins, or lore.
- **Properties/Secrets**: Mechanical properties, values, or hidden secrets.
`,
    LOG: `### Session Log: [Date]
*Adventure / Chapter / Arc*
***
- **Summary of Events**: What happened in the session.
- **Loot & XP Awarded**: Rewards collected by the party.
- **Active Quests / Hooks**: Current objectives and unresolved plot hooks.
`,
  };

  // Create article triggers (opens category selector modal first)
  function handleStartCreatePrompt() {
    setShowCategoryPrompt(true);
  }

  // Trigger editor mode after selecting category
  function handleSelectCategoryToCreate(category) {
    setShowCategoryPrompt(false);
    setEditId(null);
    setEditCategory(category);
    setEditorTab("write");
    setEditorError(null);

    if (category === "NPC" || category === "MONSTER") {
      setEditingNpc({
        name: "",
        race: category === "MONSTER" ? "Beast" : "Humanoid",
        class: category === "MONSTER" ? "Monster" : "Commoner",
        level: 1,
        hp: 10,
        maxHp: 10,
        ac: 10,
        cr: "0",
        imageUrl: "",
        largeImageUrl: "",
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        inventory: "[]",
        modifiers: "{}",
        actions: JSON.stringify([
          { name: "Claws", description: "Melee Weapon Attack: one target.", toHit: 2, damage: "1d4" }
        ]),
        description: "",
        alignment: "",
        appearance: "",
        personality: "",
        history: "",
        partyRelationship: "",
        isVisibleToPlayers: false,
      });
    } else {
      setEditTitle("");
      setEditContent(templates[category] || "");
      setEditTags([category.charAt(0) + category.slice(1).toLowerCase()]); // default tag
      setEditIsVisible(true);
      setTagInput("");
      setEditingNpc(null);
    }
    setIsEditing(true);
  }

  function handleStartCreatePrompt() {
    if (activeCategoryTab === "MONSTER") {
      handleSelectCategoryToCreate("MONSTER");
    } else if (["SPELL", "ITEM", "RULE", "CLASS", "RACE"].includes(activeCategoryTab)) {
      handleSelectCategoryToCreate(activeCategoryTab);
    } else {
      setShowCategoryPrompt(true);
    }
  }

  // Edit article trigger
  function handleStartEdit(item) {
    setEditId(item.id);
    setEditCategory(activeCategoryTab);
    setEditorTab("write");
    setEditorError(null);

    if (activeCategoryTab === "NPC" || activeCategoryTab === "MONSTER") {
      setEditingNpc({
        ...item,
        largeImageUrl: item.largeImageUrl || "",
        alignment: item.alignment || "",
        appearance: item.appearance || "",
        personality: item.personality || "",
        history: item.history || "",
        partyRelationship: item.partyRelationship || "",
      });
    } else {
      setEditTitle(item.title);
      setEditContent(item.content || "");
      let parsedTags = [];
      try {
        parsedTags = JSON.parse(item.tags || "[]");
      } catch (e) {}
      setEditTags(parsedTags);
      setEditIsVisible(item.isVisibleToPlayers);
      setTagInput("");
      setEditingNpc(null);
    }
    setIsEditing(true);
  }

  const parse5eToolsAlignment = (alignment) => {
    if (!alignment) return "Unaligned";
    if (typeof alignment === "string") return alignment;
    if (!Array.isArray(alignment)) return "Unaligned";

    const codes = alignment.map(item => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && Array.isArray(item.alignment)) {
        return item.alignment;
      }
      return "";
    }).flat().filter(Boolean);

    if (codes.length === 0) return "Unaligned";
    if (codes.includes("A")) return "Any alignment";
    if (codes.includes("U")) return "Unaligned";

    const mapping = {
      L: "Lawful",
      C: "Chaotic",
      G: "Good",
      E: "Evil",
      N: "Neutral"
    };

    if (codes.length === 1 && codes[0] === "N") return "Neutral";

    const words = codes.map(c => mapping[c] || c);
    return words.join(" ");
  };

  // Bestiary importer
  const handleBestiaryImport = async (bestiaryItem) => {
    try {
      const res = await fetch(`/api/reference/detail?category=monsters&name=${encodeURIComponent(bestiaryItem.name)}&source=${encodeURIComponent(bestiaryItem.source)}`, {
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to load monster details.");
      
      const details = await res.json();
      
      // Map bestiary stats to NPC model fields
      const hpVal = details.hp?.average || 10;
      const acVal = details.ac?.[0]?.ac || details.ac?.[0] || 10;
      
      // Map actions
      const actionsList = [];
      if (Array.isArray(details.action)) {
        details.action.forEach(act => {
          const entriesStr = Array.isArray(act.entries) ? act.entries.join(" ") : String(act.entries || "");
          
          // Try to extract basic hit and damage
          const hitMatch = entriesStr.match(/\{@hit (\d+)\}/);
          const toHit = hitMatch ? parseInt(hitMatch[1]) : 0;
          const dmgMatch = entriesStr.match(/\{@damage ([^}]+)\}/);
          const damage = dmgMatch ? dmgMatch[1].trim() : "";
          
          actionsList.push({
            name: act.name || "Action",
            description: entriesStr.replace(/\{@[a-z]+ ([^}]+)\}/g, "$1").replace(/\{@hit (\d+)\}/g, "+$1").replace(/\{@damage ([^}]+)\}/g, "$1"),
            toHit,
            damage
          });
        });
      }

      setIsEditing(true);
      setEditId(null);
      setEditCategory("NPC");
      setActiveCategoryTab("NPC");
      setEditorTab("write");
      setEditingNpc({
        name: details.name || "",
        race: Array.isArray(details.type) ? details.type.join(", ") : (details.type?.type || "Monster"),
        class: "Monster",
        level: Math.max(1, Math.floor(hpVal / 6)), // rough level estimation
        hp: hpVal,
        maxHp: hpVal,
        ac: acVal,
        cr: details.cr || "0",
        imageUrl: details.tokenUrl || details.imageUrl || "",
        largeImageUrl: details.imageUrl || "",
        strength: details.str || 10,
        dexterity: details.dex || 10,
        constitution: details.con || 10,
        intelligence: details.int || 10,
        wisdom: details.wis || 10,
        charisma: details.cha || 10,
        inventory: "[]",
        modifiers: JSON.stringify({
          strength: calculateModifier(details.str || 10),
          dexterity: calculateModifier(details.dex || 10),
          constitution: calculateModifier(details.con || 10),
          intelligence: calculateModifier(details.int || 10),
          wisdom: calculateModifier(details.wis || 10),
          charisma: calculateModifier(details.cha || 10),
        }),
        actions: JSON.stringify(actionsList.length ? actionsList : [
          { name: "Bite", description: "Melee Weapon Attack.", toHit: 2, damage: "1d4" }
        ]),
        description: "",
        alignment: parse5eToolsAlignment(details.alignment),
        appearance: "Physical details.",
        personality: "Mannerisms and demeanor.",
        history: "Backstory.",
        partyRelationship: "",
        isVisibleToPlayers: false,
      });
      setImportQuery("");
    } catch (err) {
      alert(`Import error: ${err.message}`);
    }
  };

  // Helper to sync HP adjusters directly from statblock
  const handleHpChange = async (newHp) => {
    if (!selectedArticle || (activeCategoryTab !== "NPC" && activeCategoryTab !== "MONSTER")) return;
    const isMonster = activeCategoryTab === "MONSTER";
    try {
      const res = await fetch(`/${isMonster ? "api/monsters" : "api/npcs"}/${selectedArticle.id}`, {
        method: "PUT",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ hp: newHp }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (isMonster) {
          setMonsters((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        } else {
          setNpcs((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        }
        setSelectedArticle(updated);
      }
    } catch (err) {
      console.error(`Failed to update ${isMonster ? "Monster" : "NPC"} HP:`, err);
    }
  };

  // NPC Editor field modifications
  const handleNpcFieldChange = (key, value) => {
    setEditingNpc((prev) => {
      const updated = { ...prev, [key]: value };
      
      const abilityFields = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
      if (abilityFields.includes(key)) {
        const mods = {};
        abilityFields.forEach(f => {
          mods[f] = calculateModifier(f === key ? value : prev[f]);
        });
        updated.modifiers = JSON.stringify(mods);
      }
      return updated;
    });
  };

  // Auto-find token image for the NPC being edited (tries API first, falls back to SVG)
  const handleNpcAutoFindImage = async () => {
    if (!editingNpc) return;
    const searchName = editingNpc.name || editingNpc.race || "";
    if (!searchName.trim()) return;

    // First try the reference token-image API
    try {
      const params = new URLSearchParams({ name: searchName.trim() });
      const res = await fetch(`/api/reference/token-image?${params.toString()}`);
      if (res.ok) {
        const match = await res.json();
        if (match?.url) {
          handleNpcFieldChange("imageUrl", match.url);
          return;
        }
      }
    } catch (err) {
      console.warn("[WikiPanel] Token lookup failed, using SVG fallback:", err);
    }

    // Fallback: generate an SVG data URI
    try {
      const resp = await fetch("/api/reference/generate-token-svg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingNpc.name || "", race: editingNpc.race || "" }),
      });
      if (resp.ok) {
        const { url } = await resp.json();
        if (url) handleNpcFieldChange("imageUrl", url);
      }
    } catch (err) {
      console.error("[WikiPanel] SVG token generation failed:", err);
    }
  };

  // Select a preset token image for the NPC (generates SVG data URI instantly)
  const handleNpcTokenPresetSelect = (preset) => {
    if (!editingNpc) return;
    const url = generateTokenSvgUrl(preset.label, preset.label);
    handleNpcFieldChange("imageUrl", url);
  };

  const handleNpcActionChange = (index, key, value) => {
    let actionsArray = [];
    try {
      actionsArray = JSON.parse(editingNpc.actions);
    } catch (e) {}

    actionsArray[index][key] = value;
    handleNpcFieldChange("actions", JSON.stringify(actionsArray));
  };

  const handleNpcAddAction = () => {
    let actionsArray = [];
    try {
      actionsArray = JSON.parse(editingNpc.actions);
    } catch (e) {}

    actionsArray.push({ name: "New Action", description: "Description", toHit: 0, damage: "" });
    handleNpcFieldChange("actions", JSON.stringify(actionsArray));
  };

  const handleNpcRemoveAction = (index) => {
    let actionsArray = [];
    try {
      actionsArray = JSON.parse(editingNpc.actions);
    } catch (e) {}

    actionsArray.splice(index, 1);
    handleNpcFieldChange("actions", JSON.stringify(actionsArray));
  };

  // Cancel edit
  function handleCancelEdit() {
    setIsEditing(false);
    setEditingNpc(null);
    setEditorError(null);
    setAssistLoadingField(null);
    setAssistUndo(null);
    setShowAssistDropdown(null);
  }

  // Delete flow confirmation triggers
  function triggerDelete(item) {
    setArticleToDelete(item);
  }

  async function confirmDelete() {
    if (!articleToDelete) return;

    if (activeCategoryTab === "NPC" || activeCategoryTab === "MONSTER") {
      const isMonster = activeCategoryTab === "MONSTER";
      try {
        const res = await fetch(`/${isMonster ? "api/monsters" : "api/npcs"}/${articleToDelete.id}`, {
          method: "DELETE",
          headers: authHeaders,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Failed to delete ${isMonster ? "Monster" : "NPC"}.`);
        }

        if (isMonster) {
          setMonsters((prev) => prev.filter((n) => n.id !== articleToDelete.id));
        } else {
          setNpcs((prev) => prev.filter((n) => n.id !== articleToDelete.id));
        }
        setSelectedArticle(null);
        setArticleToDelete(null);
      } catch (err) {
        console.error(`[WikiPanel] ${isMonster ? "Monster" : "NPC"} Delete error:`, err);
        setError(`Failed to delete ${isMonster ? "Monster" : "NPC"}: ${err.message}`);
        setArticleToDelete(null);
      }
    } else {
      try {
        const res = await fetch(`/api/wiki/${articleToDelete.id}`, {
          method: "DELETE",
          headers: authHeaders,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to delete article.");
        }

        setArticles((prev) => prev.filter((a) => a.id !== articleToDelete.id));
        setSelectedArticle(null);
        setArticleToDelete(null);
      } catch (err) {
        console.error("[WikiPanel] Delete error:", err);
        setError(`Failed to delete article: ${err.message}`);
        setArticleToDelete(null);
      }
    }
  }

  // Save changes (Create/Update)
  async function handleSave(e) {
    e.preventDefault();
    setEditorError(null);

    if (activeCategoryTab === "NPC" || activeCategoryTab === "MONSTER") {
      if (!editingNpc.name.trim()) {
        setEditorError("Name is required.");
        return;
      }

      const payload = {
        ...editingNpc,
        level: Number(editingNpc.level),
        hp: Number(editingNpc.hp),
        maxHp: Number(editingNpc.maxHp),
        ac: Number(editingNpc.ac),
        strength: Number(editingNpc.strength),
        dexterity: Number(editingNpc.dexterity),
        constitution: Number(editingNpc.constitution),
        intelligence: Number(editingNpc.intelligence),
        wisdom: Number(editingNpc.wisdom),
        charisma: Number(editingNpc.charisma),
      };

      const isMonster = activeCategoryTab === "MONSTER";
      const url = editId ? `/${isMonster ? "api/monsters" : "api/npcs"}/${editId}` : (isMonster ? "/api/monsters" : "/api/npcs");
      const method = editId ? "PUT" : "POST";

      try {
        const res = await fetch(url, {
          method,
          headers: jsonAuthHeaders,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Failed to save ${isMonster ? "Monster" : "NPC"}.`);
        }

        const saved = await res.json();

        if (editId) {
          if (isMonster) {
            setMonsters((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
          } else {
            setNpcs((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
          }
        } else {
          if (isMonster) {
            setMonsters((prev) => [...prev, saved]);
          } else {
            setNpcs((prev) => [...prev, saved]);
          }
        }
        setSelectedArticle(saved);
        setIsEditing(false);
        setEditingNpc(null);
      } catch (err) {
        console.error(`[WikiPanel] ${isMonster ? "Monster" : "NPC"} Save error:`, err);
        setEditorError(err.message);
      }
    } else {
      if (!editTitle.trim()) {
        setEditorError("Title is required.");
        return;
      }

      const payload = {
        title: editTitle.trim(),
        content: editContent,
        category: editCategory,
        isVisibleToPlayers: editIsVisible,
        tags: JSON.stringify(editTags),
      };

      const url = editId ? `/api/wiki/${editId}` : "/api/wiki";
      const method = editId ? "PUT" : "POST";

      try {
        const res = await fetch(url, {
          method,
          headers: jsonAuthHeaders,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to save article.");
        }

        const saved = await res.json();

        if (editId) {
          setArticles((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
        } else {
          setArticles((prev) => [saved, ...prev]);
        }
        setSelectedArticle(saved);
        setActiveCategoryTab(saved.category || "LORE");
        setIsEditing(false);
      } catch (err) {
        console.error("[WikiPanel] Save error:", err);
        setEditorError(err.message);
      }
    }
  }

  // Formatting Shortcuts Helper
  function insertText(prefix, suffix = "", fieldName = "description") {
    const elementId = activeCategoryTab === "NPC" ? `wiki-textarea-${fieldName}` : "wiki-markdown-textarea";
    const textarea = document.getElementById(elementId);
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const replacement = prefix + selected + suffix;

    if (activeCategoryTab === "NPC") {
      handleNpcFieldChange(fieldName, text.substring(0, start) + replacement + text.substring(end));
    } else {
      setEditContent(text.substring(0, start) + replacement + text.substring(end));
    }

    // Refocus and set cursor range
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
    }, 0);
  }

  // Tag list typing helpers
  function handleTagKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const cleaned = tagInput.trim().replace(/,/g, "");
      if (cleaned && !editTags.includes(cleaned)) {
        setEditTags([...editTags, cleaned]);
      }
      setTagInput("");
    }
  }

  function handleTagBlur() {
    const cleaned = tagInput.trim().replace(/,/g, "");
    if (cleaned && !editTags.includes(cleaned)) {
      setEditTags([...editTags, cleaned]);
    }
    setTagInput("");
  }

  function removeTag(tagToRemove) {
    setEditTags(editTags.filter((t) => t !== tagToRemove));
  }

  const listItems = activeCategoryTab === "NPC"
    ? filteredNpcs
    : activeCategoryTab === "MONSTER"
    ? filteredMonsters
    : categoryArticles;

  // ========================================================================
  // Shared render functions for DM split-pane layout (avoids duplication)
  // ========================================================================
  function renderReaderContent() {
    return (
      <div style={styles.reader} className="glass-panel gold-border-glow">
        {/* Reader Header */}
        <div style={styles.readerHeader}>
          <button
            id="wiki-back-btn"
            onClick={handleBack}
            style={styles.backBtn}
            className="touch-target btn-hover-scale"
          >
            Back
          </button>
          <div style={styles.headerRight}>
            {isDM && (
              <div style={styles.dmControlsRow}>
                <button
                  onClick={() => handleStartEdit(selectedArticle)}
                  style={styles.editBtn}
                  className="touch-target btn-hover-scale"
                >
                  Edit {activeCategoryTab === "NPC" ? "NPC" : "Article"}
                </button>
                <button
                  onClick={() => triggerDelete(selectedArticle)}
                  style={styles.deleteBtn}
                  className="touch-target btn-hover-scale"
                >
                  Delete
                </button>
              </div>
            )}
            {activeCategoryTab === "NPC" ? (
              !selectedArticle.isVisibleToPlayers && (
                <span style={styles.secretBadge}>DM Secret</span>
              )
            ) : (
              !selectedArticle.isVisibleToPlayers && (
                <span style={styles.secretBadge}>DM Secret</span>
              )
            )}
            <span style={styles.timeBadge}>
              Updated: {new Date(selectedArticle.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Reader Body */}
        <div style={styles.readerScroll}>
          {(activeCategoryTab === "NPC" || activeCategoryTab === "MONSTER") ? (
            <>
              <NpcStatblock
                npc={selectedArticle}
                socket={socket}
                isDM={isDM}
                onHpChange={handleHpChange}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <h3 style={{ ...styles.npcBioHeader, marginBottom: 0 }}>Narrative & Biography</h3>
                <button
                  type="button"
                  onClick={() => handleCopyImagePrompt(selectedArticle)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.3rem 0.6rem",
                    fontSize: "0.7rem",
                    fontWeight: "600",
                    background: npcCopiedPrompt
                      ? "rgba(22,163,74,0.15)"
                      : "rgba(200,151,58,0.1)",
                    color: npcCopiedPrompt ? "var(--color-success)" : "var(--color-accent)",
                    border: `1px solid ${
                      npcCopiedPrompt
                        ? "rgba(22,163,74,0.3)"
                        : "rgba(200,151,58,0.25)"
                    }`,
                    borderRadius: "6px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s",
                  }}
                  className="touch-target btn-hover-scale"
                  title="Copy image generation prompt to clipboard"
                >
                  {npcCopiedPrompt ? "✅ Copied!" : "🎨 Copy Image Prompt"}
                </button>
              </div>
              {selectedArticle.largeImageUrl && (
                <div
                  className="npc-banner-container"
                  onClick={() => setLightboxImage(selectedArticle.largeImageUrl)}
                  title="Click to view full uncropped image"
                >
                  <img
                    src={selectedArticle.largeImageUrl}
                    alt={selectedArticle.name}
                    className="npc-banner-image"
                  />
                </div>
              )}
              <div style={styles.npcBioDetails}>
                {selectedArticle.alignment && (
                  <div style={styles.npcBioSection}>
                    <h4 style={styles.npcBioSectionTitle}>Alignment</h4>
                    <div className="wiki-content" style={styles.npcBioText} dangerouslySetInnerHTML={{ __html: compileMarkdown(selectedArticle.alignment) }} />
                  </div>
                )}
                {selectedArticle.appearance && (
                  <div style={styles.npcBioSection}>
                    <h4 style={styles.npcBioSectionTitle}>Appearance</h4>
                    <div className="wiki-content" style={styles.npcBioText} dangerouslySetInnerHTML={{ __html: compileMarkdown(selectedArticle.appearance) }} />
                  </div>
                )}
                {selectedArticle.personality && (
                  <div style={styles.npcBioSection}>
                    <h4 style={styles.npcBioSectionTitle}>Personality & Traits</h4>
                    <div className="wiki-content" style={styles.npcBioText} dangerouslySetInnerHTML={{ __html: compileMarkdown(selectedArticle.personality) }} />
                  </div>
                )}
                {selectedArticle.history && (
                  <div style={styles.npcBioSection}>
                    <h4 style={styles.npcBioSectionTitle}>History & Goals</h4>
                    <div className="wiki-content" style={styles.npcBioText} dangerouslySetInnerHTML={{ __html: compileMarkdown(selectedArticle.history) }} />
                  </div>
                )}
                {selectedArticle.partyRelationship && (
                  <div style={styles.npcBioSection}>
                    <h4 style={styles.npcBioSectionTitle}>Party Relationship</h4>
                    <div className="wiki-content" style={styles.npcBioText} dangerouslySetInnerHTML={{ __html: compileMarkdown(selectedArticle.partyRelationship) }} />
                  </div>
                )}

              </div>
            </>
          ) : (
            <>
              {linkedSession && (
                <button
                  type="button"
                  onClick={() => navigate(`/dm/sessions/${linkedSession.id}`)}
                  style={styles.linkedSessionBadge}
                  className="touch-target"
                >
                  Linked to Session {linkedSession.sessionNumber || linkedSession.id}
                </button>
              )}
              <h1 style={styles.articleTitle}>{selectedArticle.title}</h1>

              {/* Tags list */}
              {(() => {
                try {
                  const tags = JSON.parse(selectedArticle.tags || "[]");
                  if (tags.length > 0) {
                    return (
                      <div style={styles.tagList}>
                        {tags.map((tag, i) => (
                          <span key={tag || i} style={styles.tag}>{tag}</span>
                        ))}
                      </div>
                    );
                  }
                } catch (e) {}
                return null;
              })()}

              {/* Markdown Content */}
              <div
                className="wiki-content"
                style={styles.contentBody}
                dangerouslySetInnerHTML={{ __html: compileMarkdown(selectedArticle.content) }}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  function renderListScroll() {
    return (
      <div style={styles.listScroll}>
        {loading && <p style={styles.infoText}>Consulting the archives...</p>}
        {error && <p style={styles.errorText}>Error: {error}</p>}

        {!loading && !error && listItems.length === 0 && (
          <p style={styles.infoText}>No entries found in this section.</p>
        )}

        {!loading && !error && (activeCategoryTab === "NPC" || activeCategoryTab === "MONSTER") ? (
          listItems.map((npc) => (
            <div
              key={npc.id}
              id={`wiki-npc-${npc.id}`}
              onClick={() => setSelectedArticle(npc)}
              style={styles.articleCard}
              className="glass-panel btn-hover-scale"
            >
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{npc.name}</h3>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={styles.cardSubText}>CR {npc.cr} • AC {npc.ac}</span>
                  {!npc.isVisibleToPlayers && (
                    <span style={styles.secretDot} title="Visible to DM only">🔒 DM Secret</span>
                  )}
                </div>
              </div>
              <p style={styles.cardPreview}>
                {(() => {
                  const parts = [
                    npc.alignment ? `[${npc.alignment}]` : "",
                    npc.appearance,
                    npc.personality,
                    npc.history,
                    npc.description
                  ].filter(Boolean);
                  const fullText = parts.join(" ").replace(/[#*`]/g, "").trim();
                  return fullText ? (fullText.slice(0, 100) + (fullText.length > 100 ? "..." : "")) : "No details recorded.";
                })()}
              </p>
            </div>
          ))
        ) : (
          !loading && !error && listItems.map((article) => {
            let parsedTags = [];
            try {
              parsedTags = JSON.parse(article.tags || "[]");
            } catch (e) {}

            return (
              <div
                key={article.id}
                id={`wiki-article-${article.id}`}
                onClick={() => setSelectedArticle(article)}
                style={styles.articleCard}
                className="glass-panel btn-hover-scale"
              >
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>{article.title}</h3>
                  {!article.isVisibleToPlayers && (
                    <span style={styles.secretDot} title="Visible to DM only">🔒 DM Secret</span>
                  )}
                </div>
                <p style={styles.cardPreview}>
                  {article.content
                    ? article.content.replace(/[#*`]/g, "").slice(0, 100) + (article.content.length > 100 ? "..." : "")
                    : "No details recorded."}
                </p>
                {parsedTags.length > 0 && (
                  <div style={styles.cardTags}>
                    {parsedTags.slice(0, 3).map((tag, idx) => (
                      <span key={tag || idx} style={styles.cardTag}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div style={styles.container} className="fade-in">
      {isEditing ? (
        (activeCategoryTab === "NPC" || activeCategoryTab === "MONSTER") ? (
          /*  DM NPC SHEET EDITOR  */
          <form onSubmit={handleSave} style={styles.editor} className="glass-panel gold-border-glow fade-in">
            <header style={styles.editorHeader}>
              <h2 style={styles.editorTitle}>
                {editId ? `Edit ${activeCategoryTab === "MONSTER" ? "Monster" : "NPC"}: ${editingNpc.name}` : `Create ${activeCategoryTab === "MONSTER" ? "Monster" : "NPC"} Statblock`}
              </h2>
              <div style={styles.editorHeaderActions}>
                {!editId && (
                  <button
                    type="button"
                    onClick={() => setShowNpcGenModal(true)}
                    style={{
                      ...styles.saveBtn,
                      background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
                      color: "#fffffe",
                      marginRight: "0.5rem"
                    }}
                    className="touch-target btn-hover-scale"
                  >
                    ✨ AI Generate
                  </button>
                )}
                {!editId && activeCategoryTab === "MONSTER" && (
                  <button
                    type="button"
                    onClick={() => setShowMonsterGenModal(true)}
                    style={{
                      ...styles.saveBtn,
                      background: "linear-gradient(135deg, #d97706 0%, #92400e 100%)",
                      color: "#fffffe",
                      marginRight: "0.5rem",
                    }}
                    className="touch-target btn-hover-scale"
                    title="AI Monster Generator"
                  >
                    ✨ Generate Monster
                  </button>
                )}
                {editingNpc?.name && (
                  <button
                    type="button"
                    onClick={() => handleCopyImagePrompt(editingNpc)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.72rem",
                      fontWeight: "600",
                      background: npcCopiedPrompt
                        ? "rgba(22,163,74,0.15)"
                        : "rgba(200,151,58,0.08)",
                      color: npcCopiedPrompt ? "var(--color-success)" : "var(--color-accent)",
                      border: `1px solid ${
                        npcCopiedPrompt
                          ? "rgba(22,163,74,0.3)"
                          : "rgba(200,151,58,0.2)"
                      }`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      marginRight: "0.5rem",
                      transition: "all 0.2s",
                    }}
                    className="touch-target btn-hover-scale"
                    title="Copy image generation prompt to clipboard"
                  >
                    {npcCopiedPrompt ? "✅ Copied!" : "🎨 Image Prompt"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={styles.backBtn}
                  className="touch-target"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.saveBtn}
                  className="touch-target btn-hover-scale"
                >
                  Save NPC
                </button>
              </div>
            </header>

            <div style={styles.editorBody}>
              {editorError && <p style={styles.editorErrorText}>⚠️ {editorError}</p>}

              {/* Identity & Basic Combat Stats */}
              <div style={styles.editorSection}>
                <h3 style={styles.subSectionTitle}>1. Basic Information</h3>
                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Name *</label>
                    <input
                      type="text"
                      value={editingNpc.name}
                      onChange={(e) => handleNpcFieldChange("name", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      required
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Challenge Rating (CR)</label>
                    <input
                      type="text"
                      value={editingNpc.cr}
                      onChange={(e) => handleNpcFieldChange("cr", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      placeholder="e.g. 1/4, 2, 12"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Race / Type</label>
                    <input
                      type="text"
                      value={editingNpc.race}
                      onChange={(e) => handleNpcFieldChange("race", e.target.value)}
                      style={styles.input}
                      className="form-input"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Class / Role</label>
                    <input
                      type="text"
                      value={editingNpc.class}
                      onChange={(e) => handleNpcFieldChange("class", e.target.value)}
                      style={styles.input}
                      className="form-input"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Level</label>
                    <input
                      type="number"
                      value={editingNpc.level}
                      onChange={(e) => handleNpcFieldChange("level", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      min={1}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Armor Class (AC)</label>
                    <input
                      type="number"
                      value={editingNpc.ac}
                      onChange={(e) => handleNpcFieldChange("ac", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      min={1}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Current HP</label>
                    <input
                      type="number"
                      value={editingNpc.hp}
                      onChange={(e) => handleNpcFieldChange("hp", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      min={0}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Max HP</label>
                    <input
                      type="number"
                      value={editingNpc.maxHp}
                      onChange={(e) => handleNpcFieldChange("maxHp", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      min={1}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                  <div style={{ ...styles.formGroup, flex: 1, minWidth: "200px" }}>
                    <label style={styles.label}>Avatar / Token Image URL (Optional)</label>
                    <input
                      type="text"
                      value={editingNpc.imageUrl || ""}
                      onChange={(e) => handleNpcFieldChange("imageUrl", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      placeholder="https://example.com/avatar.png or /uploads/..."
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1, minWidth: "200px" }}>
                    <label style={styles.label}>Large Portrait Image URL (Optional)</label>
                    <input
                      type="text"
                      value={editingNpc.largeImageUrl || ""}
                      onChange={(e) => handleNpcFieldChange("largeImageUrl", e.target.value)}
                      style={styles.input}
                      className="form-input"
                      placeholder="https://example.com/portrait.png or /uploads/..."
                    />
                  </div>
                  <div style={{ ...styles.checkboxGroup, flex: "0 0 auto", alignSelf: "center", marginTop: "1.25rem" }}>
                    <input
                      type="checkbox"
                      id="npcIsVisibleToPlayers"
                      checked={editingNpc.isVisibleToPlayers}
                      onChange={(e) => handleNpcFieldChange("isVisibleToPlayers", e.target.checked)}
                      style={styles.checkbox}
                    />
                    <label htmlFor="npcIsVisibleToPlayers" style={styles.checkboxLabel}>
                      Visible to Players
                    </label>
                  </div>
                </div>

                {/* Token image preview + quick presets + auto-find */}
                <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                  {editingNpc.imageUrl && (
                    <div style={styles.npcTokenPreview}>
                      <img
                        src={editingNpc.imageUrl}
                        alt="Token preview"
                        style={styles.npcTokenPreviewImg}
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                      <label style={{ ...styles.label, margin: 0 }}>Quick Token Images</label>
                      <button
                        type="button"
                        onClick={handleNpcAutoFindImage}
                        style={styles.autoFindBtn}
                        className="touch-target btn-hover-scale"
                        title={`Auto-find image for "${editingNpc.name || editingNpc.race || ""}"`}
                      >
                        Auto-find Image
                      </button>
                    </div>
                    <div style={styles.npcPresetGrid}>
                      {NPC_TOKEN_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleNpcTokenPresetSelect(preset)}
                          style={{
                            ...styles.npcPresetBtn,
                          }}
                          className="touch-target btn-hover-scale"
                          title={preset.label}
                        >
                          <TokenPresetIcon label={preset.label} size={40} />
                          <span style={styles.npcPresetLabel}>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* Core Ability Scores */}
              <div style={styles.editorSection}>
                <h3 style={styles.subSectionTitle}>2. Ability Scores & Modifiers</h3>
                <div style={styles.abilityGrid}>
                  {["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => (
                    <div key={stat} style={styles.abilityBox} className="glass-panel">
                      <span style={styles.abilityLabel}>{stat.slice(0, 3).toUpperCase()}</span>
                      <input
                        type="number"
                        value={editingNpc[stat]}
                        onChange={(e) => handleNpcFieldChange(stat, e.target.value)}
                        style={styles.abilityInput}
                        min={1}
                        max={30}
                      />
                      <span style={styles.abilityModBadge}>
                        {calculateModifier(editingNpc[stat])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions Builder */}
              <div style={styles.editorSection}>
                <div style={styles.actionsHeaderRow}>
                  <h3 style={styles.subSectionTitle}>3. Custom Actions & Attacks</h3>
                  <button
                    type="button"
                    onClick={handleNpcAddAction}
                    style={styles.addActionBtn}
                    className="touch-target btn-hover-scale"
                  >
                    + Add Action
                  </button>
                </div>

                {(() => {
                  let actionsList = [];
                  try {
                    actionsList = JSON.parse(editingNpc.actions);
                  } catch (e) {}

                  if (actionsList.length === 0) {
                    return <p style={styles.infoText}>No actions defined. Add at least one action for combat rolls.</p>;
                  }

                  return (
                    <div style={styles.actionsEditorList}>
                      {actionsList.map((action, index) => (
                        <div key={action.name || index} style={styles.actionItemBox} className="glass-panel">
                          <div style={styles.actionHeaderRow}>
                            <h4 style={styles.actionIdxLabel}>Action #{index + 1}</h4>
                            <button
                              type="button"
                              onClick={() => handleNpcRemoveAction(index)}
                              style={styles.removeActionBtn}
                              className="touch-target"
                            >
                              Remove
                            </button>
                          </div>
                          <div style={styles.actionFieldsGrid}>
                            <div style={styles.formGroup}>
                              <label style={styles.label}>Action Name</label>
                              <input
                                type="text"
                                value={action.name}
                                onChange={(e) => handleNpcActionChange(index, "name", e.target.value)}
                                style={styles.input}
                                className="form-input"
                                placeholder="e.g. Sword, Fire Bolt"
                                required
                              />
                            </div>
                            <div style={styles.formGroup}>
                              <label style={styles.label}>Hit Bonus</label>
                              <input
                                type="number"
                                value={action.toHit || 0}
                                onChange={(e) => handleNpcActionChange(index, "toHit", Number(e.target.value))}
                                style={styles.input}
                                className="form-input"
                                placeholder="e.g. 5"
                              />
                            </div>
                            <div style={styles.formGroup}>
                              <label style={styles.label}>Damage Formula</label>
                              <input
                                type="text"
                                value={action.damage || ""}
                                onChange={(e) => handleNpcActionChange(index, "damage", e.target.value)}
                                style={styles.input}
                                className="form-input"
                                placeholder="e.g. 1d8+3"
                              />
                            </div>
                          </div>
                          <div style={{ ...styles.formGroup, marginTop: "0.5rem" }}>
                            <label style={styles.label}>Description / Details</label>
                            <textarea
                              value={action.description || ""}
                              onChange={(e) => handleNpcActionChange(index, "description", e.target.value)}
                              style={styles.textareaMini}
                              className="form-input"
                              placeholder="Action details..."
                              rows={2}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Biography & Background Fields */}
              <div style={styles.editorSection}>
                <h3 style={styles.subSectionTitle}>4. NPC Narrative & Background</h3>
                <div style={styles.tabsContainer}>
                  <button
                    type="button"
                    onClick={() => setEditorTab("write")}
                    style={{
                      ...styles.tabBtn,
                      borderBottom: editorTab === "write" ? "2px solid var(--color-accent)" : "none",
                      color: editorTab === "write" ? "var(--color-accent)" : "var(--color-muted)",
                    }}
                    className="touch-target"
                  >
                    Write Sections
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("preview")}
                    style={{
                      ...styles.tabBtn,
                      borderBottom: editorTab === "preview" ? "2px solid var(--color-accent)" : "none",
                      color: editorTab === "preview" ? "var(--color-accent)" : "var(--color-muted)",
                    }}
                    className="touch-target"
                  >
                    Combined Live Preview
                  </button>
                </div>

                {editorTab === "write" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    
                    {/* Alignment Field */}
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Alignment</label>
                      <div style={styles.toolbar}>
                        <button type="button" title="Bold" onClick={() => insertText("**", "**", "alignment")} style={styles.toolbarBtn} className="touch-target"><strong>B</strong></button>
                        <button type="button" title="Italic" onClick={() => insertText("*", "*", "alignment")} style={styles.toolbarBtn} className="touch-target"><em>I</em></button>
                        <AiAssistButton
                          fieldName="alignment"
                          actions={AI_FIELD_ACTIONS.alignment}
                          currentText={editingNpc?.alignment || ""}
                          context={buildAssistContext("alignment")}
                          onApply={(reply) => {
                            setEditingNpc((prev) => ({ ...prev, alignment: reply }));
                          }}
                          onError={(msg) => setEditorError(msg)}
                          user={user}
                        />
                      </div>
                      <textarea
                        id="wiki-textarea-alignment"
                        value={editingNpc.alignment}
                        onChange={(e) => handleNpcFieldChange("alignment", e.target.value)}
                        placeholder="e.g. Lawful Good, Neutral, etc."
                        style={{ ...styles.textarea, height: "80px" }}
                        className="form-input"
                      />
                    </div>

                    {/* Appearance Field */}
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Appearance</label>
                      <div style={styles.toolbar}>
                        <button type="button" title="Bold" onClick={() => insertText("**", "**", "appearance")} style={styles.toolbarBtn} className="touch-target"><strong>B</strong></button>
                        <button type="button" title="Italic" onClick={() => insertText("*", "*", "appearance")} style={styles.toolbarBtn} className="touch-target"><em>I</em></button>
                        <button type="button" title="Header" onClick={() => insertText("\n### ", "", "appearance")} style={styles.toolbarBtn} className="touch-target">H3</button>
                        <button type="button" title="Bullet List" onClick={() => insertText("\n- ", "", "appearance")} style={styles.toolbarBtn} className="touch-target">• List</button>
                        <button type="button" title="Read Aloud Box" onClick={() => insertText("\n> ", "", "appearance")} style={styles.toolbarBtn} className="touch-target">💬 Box</button>
                        <AiAssistButton
                          fieldName="appearance"
                          actions={AI_FIELD_ACTIONS.appearance}
                          currentText={editingNpc?.appearance || ""}
                          context={buildAssistContext("appearance")}
                          onApply={(reply) => {
                            setEditingNpc((prev) => ({ ...prev, appearance: reply }));
                          }}
                          onError={(msg) => setEditorError(msg)}
                          user={user}
                        />
                      </div>
                      <textarea
                        id="wiki-textarea-appearance"
                        value={editingNpc.appearance}
                        onChange={(e) => handleNpcFieldChange("appearance", e.target.value)}
                        placeholder="Description of physical appearance..."
                        style={styles.textarea}
                        className="form-input"
                      />
                    </div>

                    {/* Personality Field */}
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Personality</label>
                      <div style={styles.toolbar}>
                        <button type="button" title="Bold" onClick={() => insertText("**", "**", "personality")} style={styles.toolbarBtn} className="touch-target"><strong>B</strong></button>
                        <button type="button" title="Italic" onClick={() => insertText("*", "*", "personality")} style={styles.toolbarBtn} className="touch-target"><em>I</em></button>
                        <button type="button" title="Header" onClick={() => insertText("\n### ", "", "personality")} style={styles.toolbarBtn} className="touch-target">H3</button>
                        <button type="button" title="Bullet List" onClick={() => insertText("\n- ", "", "personality")} style={styles.toolbarBtn} className="touch-target">• List</button>
                        <button type="button" title="Read Aloud Box" onClick={() => insertText("\n> ", "", "personality")} style={styles.toolbarBtn} className="touch-target">💬 Box</button>
                        <AiAssistButton
                          fieldName="personality"
                          actions={AI_FIELD_ACTIONS.personality}
                          currentText={editingNpc?.personality || ""}
                          context={buildAssistContext("personality")}
                          onApply={(reply) => {
                            setEditingNpc((prev) => ({ ...prev, personality: reply }));
                          }}
                          onError={(msg) => setEditorError(msg)}
                          user={user}
                        />
                      </div>
                      <textarea
                        id="wiki-textarea-personality"
                        value={editingNpc.personality}
                        onChange={(e) => handleNpcFieldChange("personality", e.target.value)}
                        placeholder="Character traits, bonds, flaws, and secrets..."
                        style={styles.textarea}
                        className="form-input"
                      />
                    </div>

                    {/* History Field */}
                    <div style={styles.formGroup}>
                      <label style={styles.label}>History</label>
                      <div style={styles.toolbar}>
                        <button type="button" title="Bold" onClick={() => insertText("**", "**", "history")} style={styles.toolbarBtn} className="touch-target"><strong>B</strong></button>
                        <button type="button" title="Italic" onClick={() => insertText("*", "*", "history")} style={styles.toolbarBtn} className="touch-target"><em>I</em></button>
                        <button type="button" title="Header" onClick={() => insertText("\n### ", "", "history")} style={styles.toolbarBtn} className="touch-target">H3</button>
                        <button type="button" title="Bullet List" onClick={() => insertText("\n- ", "", "history")} style={styles.toolbarBtn} className="touch-target">• List</button>
                        <button type="button" title="Read Aloud Box" onClick={() => insertText("\n> ", "", "history")} style={styles.toolbarBtn} className="touch-target">💬 Box</button>
                        <AiAssistButton
                          fieldName="history"
                          actions={AI_FIELD_ACTIONS.history}
                          currentText={editingNpc?.history || ""}
                          context={buildAssistContext("history")}
                          onApply={(reply) => {
                            setEditingNpc((prev) => ({ ...prev, history: reply }));
                          }}
                          onError={(msg) => setEditorError(msg)}
                          user={user}
                        />
                      </div>
                      <textarea
                        id="wiki-textarea-history"
                        value={editingNpc.history}
                        onChange={(e) => handleNpcFieldChange("history", e.target.value)}
                        placeholder="Brief backstory and goals..."
                        style={styles.textarea}
                        className="form-input"
                      />
                    </div>

                    {/* Party Relationship Field */}
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Party Relationship</label>
                      <div style={styles.toolbar}>
                        <button type="button" title="Bold" onClick={() => insertText("**", "**", "partyRelationship")} style={styles.toolbarBtn} className="touch-target"><strong>B</strong></button>
                        <button type="button" title="Italic" onClick={() => insertText("*", "*", "partyRelationship")} style={styles.toolbarBtn} className="touch-target"><em>I</em></button>
                        <button type="button" title="Header" onClick={() => insertText("\n### ", "", "partyRelationship")} style={styles.toolbarBtn} className="touch-target">H3</button>
                        <button type="button" title="Bullet List" onClick={() => insertText("\n- ", "", "partyRelationship")} style={styles.toolbarBtn} className="touch-target">• List</button>
                        <button type="button" title="Read Aloud Box" onClick={() => insertText("\n> ", "", "partyRelationship")} style={styles.toolbarBtn} className="touch-target">💬 Box</button>
                        <AiAssistButton
                          fieldName="partyRelationship"
                          actions={AI_FIELD_ACTIONS.partyRelationship}
                          currentText={editingNpc?.partyRelationship || ""}
                          context={buildAssistContext("partyRelationship")}
                          onApply={(reply) => {
                            setEditingNpc((prev) => ({ ...prev, partyRelationship: reply }));
                          }}
                          onError={(msg) => setEditorError(msg)}
                          user={user}
                        />
                      </div>
                      <textarea
                        id="wiki-textarea-partyRelationship"
                        value={editingNpc.partyRelationship}
                        onChange={(e) => handleNpcFieldChange("partyRelationship", e.target.value)}
                        placeholder="Notes on how they view the player characters..."
                        style={styles.textarea}
                        className="form-input"
                      />
                    </div>



                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {editingNpc.alignment && (
                      <div>
                        <strong style={{ color: "var(--color-accent)" }}>Alignment:</strong>
                        <div className="wiki-content" dangerouslySetInnerHTML={{ __html: compileMarkdown(editingNpc.alignment) }} />
                      </div>
                    )}
                    {editingNpc.appearance && (
                      <div>
                        <strong style={{ color: "var(--color-accent)" }}>Appearance:</strong>
                        <div className="wiki-content" dangerouslySetInnerHTML={{ __html: compileMarkdown(editingNpc.appearance) }} />
                      </div>
                    )}
                    {editingNpc.personality && (
                      <div>
                        <strong style={{ color: "var(--color-accent)" }}>Personality:</strong>
                        <div className="wiki-content" dangerouslySetInnerHTML={{ __html: compileMarkdown(editingNpc.personality) }} />
                      </div>
                    )}
                    {editingNpc.history && (
                      <div>
                        <strong style={{ color: "var(--color-accent)" }}>History:</strong>
                        <div className="wiki-content" dangerouslySetInnerHTML={{ __html: compileMarkdown(editingNpc.history) }} />
                      </div>
                    )}
                    {editingNpc.partyRelationship && (
                      <div>
                        <strong style={{ color: "var(--color-accent)" }}>Party Relationship:</strong>
                        <div className="wiki-content" dangerouslySetInnerHTML={{ __html: compileMarkdown(editingNpc.partyRelationship) }} />
                      </div>
                    )}

                  </div>
                )}
              </div>
            </div>
          </form>
        ) : (
          /*  STANDARD WIKI ARTICLE EDITOR  */
          <form onSubmit={handleSave} style={styles.editor} className="glass-panel gold-border-glow fade-in">
            <header style={styles.editorHeader}>
              <h2 style={styles.editorTitle}>
                {editId ? "Edit Campaign Article" : "Write Campaign Article"}
              </h2>
              <div style={styles.editorHeaderActions}>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={styles.backBtn}
                  className="touch-target"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.saveBtn}
                  className="touch-target btn-hover-scale"
                >
                  Save Article
                </button>
              </div>
            </header>

            <div style={styles.editorBody}>
              {editorError && <p style={styles.editorErrorText}>⚠️ {editorError}</p>}

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 2, minWidth: "200px" }}>
                  <label style={styles.label}>Article Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Sword Coast, Elminster, Old Owl Well"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={styles.input}
                    className="form-input"
                    required
                  />
                </div>

                <div style={{ ...styles.formGroup, width: "160px" }}>
                  <label style={styles.label}>Section/Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    style={styles.select}
                    className="form-input"
                  >
                    <option value="LOCATION">Location</option>
                    <option value="NPC">NPC</option>
                    <option value="LORE">Lore & Item</option>
                    <option value="LOG">Session Log</option>
                  </select>
                </div>

                <div style={styles.checkboxGroup}>
                  <input
                    type="checkbox"
                    id="isVisibleToPlayers"
                    checked={editIsVisible}
                    onChange={(e) => setEditIsVisible(e.target.checked)}
                    style={styles.checkbox}
                  />
                  <label htmlFor="isVisibleToPlayers" style={styles.checkboxLabel}>
                    Visible to Players
                  </label>
                </div>
              </div>

              {/* Tag chip manager */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Tags (Press Enter or Comma to add)</label>
                <div style={styles.tagChipsContainer} className="form-input">
                  {editTags.map((tag) => (
                    <span key={tag} style={styles.editorTagChip}>
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        style={styles.tagChipRemove}
                        className="touch-target"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={editTags.length === 0 ? "e.g. NPC, Location, Quest..." : ""}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={handleTagBlur}
                    style={styles.tagInputField}
                  />
                </div>
              </div>

              {/* Tab selection for Write / Live Preview */}
              <div style={styles.tabsContainer}>
                <button
                  type="button"
                  onClick={() => setEditorTab("write")}
                  style={{
                    ...styles.tabBtn,
                    borderBottom: editorTab === "write" ? "2px solid var(--color-accent)" : "none",
                    color: editorTab === "write" ? "var(--color-accent)" : "var(--color-muted)",
                  }}
                  className="touch-target"
                >
                  Write (Markdown)
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab("preview")}
                  style={{
                    ...styles.tabBtn,
                    borderBottom: editorTab === "preview" ? "2px solid var(--color-accent)" : "none",
                    color: editorTab === "preview" ? "var(--color-accent)" : "var(--color-muted)",
                  }}
                  className="touch-target"
                >
                  Live Preview
                </button>
              </div>

              {editorTab === "write" ? (
                <div style={styles.workspaceWriteContainer}>
                  {/* Toolbar */}
                  <div style={styles.toolbar}>
                    <button type="button" title="Bold" onClick={() => insertText("**", "**")} style={styles.toolbarBtn} className="touch-target"><strong>B</strong></button>
                    <button type="button" title="Italic" onClick={() => insertText("*", "*")} style={styles.toolbarBtn} className="touch-target"><em>I</em></button>
                    <button type="button" title="Header" onClick={() => insertText("\n### ", "")} style={styles.toolbarBtn} className="touch-target">H3</button>
                    <button type="button" title="Bullet List" onClick={() => insertText("\n- ", "")} style={styles.toolbarBtn} className="touch-target">• List</button>
                    <button type="button" title="Read Aloud Box" onClick={() => insertText("\n> ", "")} style={styles.toolbarBtn} className="touch-target">💬 Box</button>
                    <AiAssistButton
                      fieldName="markdown"
                      actions={AI_FIELD_ACTIONS.markdown}
                      currentText={editContent || ""}
                      context={buildAssistContext("markdown")}
                      onApply={(reply) => {
                        setEditContent(reply);
                      }}
                      onError={(msg) => setEditorError(msg)}
                      user={user}
                    />
                  </div>

                  <textarea
                    id="wiki-markdown-textarea"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Record your campaign details..."
                    style={styles.textarea}
                    className="form-input"
                  />
                </div>
              ) : (
                <div
                  style={styles.previewContainer}
                  className="wiki-content"
                  dangerouslySetInnerHTML={{ __html: compileMarkdown(editContent) }}
                />
              )}
            </div>
          </form>
        )
      ) : isDM && !isPopout ? (
        /*  DM: SPLIT-PANE LAYOUT  */
        <div style={styles.splitPaneLayout}>
          <WikiTreeSidebar
            articles={articles}
            npcs={npcs}
            monsters={monsters}
            activeCategoryTab={activeCategoryTab}
            selectedArticle={selectedArticle}
            searchQuery={searchQuery}
            onSelectCategory={(tab) => setActiveCategoryTab(tab)}
            onSelectArticle={(item) => setSelectedArticle(item)}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            isDM={isDM}
            onCreateNew={(tab) => handleSelectCategoryToCreate(tab)}
          />
          <div style={styles.splitContent}>
            {selectedArticle ? renderReaderContent() : (
              <div style={styles.listView}>
                <div style={styles.wikiTopBar}>
                  <button
                    onClick={() => setSidebarOpen(true)}
                    style={styles.menuBtn}
                    className="touch-target wiki-topbar-menu-btn"
                    aria-label="Open wiki index"
                  >
                    <Menu size={20} />
                  </button>
                  <input
                    id="wiki-search-input"
                    type="text"
                    placeholder={`Search ${(activeCategoryTab || "all").toLowerCase()} entries...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={styles.searchInput}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      style={styles.clearBtn}
                      className="touch-target"
                    >
                      ✕
                    </button>
                  )}
                  {isDM && (
                    <button
                      onClick={handleStartCreatePrompt}
                      style={styles.createBtn}
                      className="touch-target btn-hover-scale"
                    >
                      {activeCategoryTab === "NPC"
                        ? "+ New NPC"
                        : activeCategoryTab === "MONSTER"
                          ? "+ New Monster"
                          : "+ New Entry"}
                    </button>
                  )}
                </div>
                {renderListScroll()}
              </div>
            )}
          </div>
        </div>
      ) : selectedArticle ? (
        /*  PLAYER/POPOUT: ARTICLE / NPC READER VIEW  */
        renderReaderContent()
      ) : (
        /*  PLAYER/POPOUT: SEARCH LIST VIEW  */
        <div style={styles.listView}>
          {/* Top Section Category Tabs */}
          <div style={styles.sectionTabsContainer} className="glass-panel">
            <button
              onClick={() => setActiveCategoryTab("LOCATION")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "LOCATION" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "LOCATION" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "LOCATION" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              🗺️ Locations
            </button>
            <button
              onClick={() => setActiveCategoryTab("NPC")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "NPC" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "NPC" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "NPC" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              👤 NPCs
            </button>
            <button
              onClick={() => setActiveCategoryTab("LORE")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "LORE" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "LORE" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "LORE" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              📜 Lore & Items
            </button>
            <button
              onClick={() => setActiveCategoryTab("LOG")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "LOG" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "LOG" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "LOG" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              📓 Session Logs
            </button>
            <button
              onClick={() => setActiveCategoryTab("MONSTER")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "MONSTER" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "MONSTER" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "MONSTER" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              👹 Monsters
            </button>
            <button
              onClick={() => setActiveCategoryTab("SPELL")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "SPELL" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "SPELL" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "SPELL" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              ✨ Spells
            </button>
            <button
              onClick={() => setActiveCategoryTab("ITEM")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "ITEM" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "ITEM" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "ITEM" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              📦 Items
            </button>
            <button
              onClick={() => setActiveCategoryTab("RULE")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "RULE" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "RULE" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "RULE" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              📖 Rules
            </button>
            <button
              onClick={() => setActiveCategoryTab("CLASS")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "CLASS" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "CLASS" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "CLASS" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              🛡️ Classes
            </button>
            <button
              onClick={() => setActiveCategoryTab("RACE")}
              style={{
                ...styles.sectionTabBtn,
                background: activeCategoryTab === "RACE" ? "var(--color-accent-dim)" : "transparent",
                color: activeCategoryTab === "RACE" ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: activeCategoryTab === "RACE" ? "2px solid var(--color-accent)" : "none",
              }}
              className="touch-target"
            >
              👥 Races
            </button>
            {!isPopout && user?.role === "DM" && (
              <button
                onClick={() => window.open("/#/dm/popout/wiki", "_blank", "width=800,height=800,resizable=yes,scrollbars=yes")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-accent)",
                  fontSize: "1.15rem",
                  cursor: "pointer",
                  marginLeft: "auto",
                  paddingRight: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
                className="touch-target btn-hover-scale"
                title="Pop out Wiki"
                aria-label="Pop out Wiki"
              >
                <ExternalLink size={17} />
              </button>
            )}
          </div>

          <div style={styles.searchBarContainer}>
            <input
              id="wiki-search-input"
              type="text"
              placeholder={`Search ${activeCategoryTab.toLowerCase()}s...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ ...styles.clearBtn, right: isDM && activeCategoryTab === "NPC" ? "155px" : "15px" }}
                className="touch-target"
              >
                ✕
              </button>
            )}
            {isDM && (
              <button
                onClick={handleStartCreatePrompt}
                style={styles.createBtn}
                className="touch-target btn-hover-scale"
              >
                {activeCategoryTab === "NPC" ? "+ New NPC" : activeCategoryTab === "MONSTER" ? "+ New Monster" : "+ New Entry"}
              </button>
            )}
          </div>

          {renderListScroll()}
        </div>
      )}

      {/* AI NPC GENERATOR MODAL */}
      {showNpcGenModal && (
        <div style={styles.modalOverlay} className="fade-in">
          <div style={{ ...styles.categoryPromptBox, width: "90%", maxWidth: "520px" }} className="glass-panel gold-border-glow">
            <header style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, color: "var(--color-accent)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <span>✨ AI NPC Creator</span>
              </h3>
              <button
                type="button"
                onClick={resetNpcGenModal}
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
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent; e.currentTarget.style.background = c.bg.replace('0.1', '0.18'); }}
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
                  <p style={{ ...styles.editorErrorText, marginBottom: "1rem" }}>⚠️ {npcGenError}</p>
                )}

                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={resetNpcGenModal}
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
      )}

      {/* AI Monster Generator Modal */}
      {showMonsterGenModal && (
        <div style={styles.modalOverlay} onClick={() => !monsterGenLoading && resetMonsterGenState()}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>✨ AI Monster Generator</h3>
              <button onClick={() => !monsterGenLoading && resetMonsterGenState()} style={styles.modalCloseBtn} className="touch-target" disabled={monsterGenLoading}>
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
      )}

      {/* NEW ENTRY CATEGORY CHOICE MODAL */}
      {showCategoryPrompt && (
        <div style={styles.modalOverlay} className="fade-in">
          <div style={styles.categoryPromptBox} className="glass-panel gold-border-glow">
            <header style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, color: "var(--color-accent)" }}>New Wiki Entry</h3>
              <button
                onClick={() => setShowCategoryPrompt(false)}
                style={styles.modalCloseBtn}
                className="touch-target"
              >
                ✕
              </button>
            </header>
            <div style={styles.modalBody}>
              <p style={{ marginBottom: "1rem", textAlign: "center", color: "var(--color-muted)" }}>
                What category of lore would you like to add to the archives?
              </p>
              <div style={styles.categoryPromptGrid}>
                <button
                  type="button"
                  onClick={() => handleSelectCategoryToCreate("LOCATION")}
                  style={styles.categoryPromptBtn}
                  className="touch-target btn-hover-scale glass-panel"
                >
                  <span style={styles.categoryPromptIcon}>🗺️</span>
                  <span style={styles.categoryPromptLabel}>Location</span>
                  <span style={styles.categoryPromptDesc}>Dungeons, settlements, landmarks</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCategoryToCreate("NPC")}
                  style={styles.categoryPromptBtn}
                  className="touch-target btn-hover-scale glass-panel"
                >
                  <span style={styles.categoryPromptIcon}>👤</span>
                  <span style={styles.categoryPromptLabel}>NPC</span>
                  <span style={styles.categoryPromptDesc}>Allies, notable figures</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCategoryToCreate("MONSTER")}
                  style={styles.categoryPromptBtn}
                  className="touch-target btn-hover-scale glass-panel"
                >
                  <span style={styles.categoryPromptIcon}>👹</span>
                  <span style={styles.categoryPromptLabel}>Monster</span>
                  <span style={styles.categoryPromptDesc}>Hostile beasts and enemies</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCategoryToCreate("LORE")}
                  style={styles.categoryPromptBtn}
                  className="touch-target btn-hover-scale glass-panel"
                >
                  <span style={styles.categoryPromptIcon}>📜</span>
                  <span style={styles.categoryPromptLabel}>Lore & Item</span>
                  <span style={styles.categoryPromptDesc}>Historical facts, magic items, organizations</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCategoryToCreate("LOG")}
                  style={styles.categoryPromptBtn}
                  className="touch-target btn-hover-scale glass-panel"
                >
                  <span style={styles.categoryPromptIcon}>📓</span>
                  <span style={styles.categoryPromptLabel}>Session Log</span>
                  <span style={styles.categoryPromptDesc}>Summaries of game sessions and dates</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION DELETE MODAL */}
      {articleToDelete && (
        <div style={styles.modalOverlay} className="fade-in">
          <div style={styles.modalContent} className="glass-panel gold-border-glow">
            <header style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Confirm Destruction</h3>
              <button
                onClick={() => setArticleToDelete(null)}
                style={styles.modalCloseBtn}
                className="touch-target"
              >
                ✕
              </button>
            </header>
            <div style={styles.modalBody}>
              <p>Are you sure you want to permanently delete and burn the entry <strong>"{articleToDelete.title || articleToDelete.name}"</strong>?</p>
              <p style={{ color: "var(--color-danger)", fontSize: "0.8rem", marginTop: "0.5rem" }}>This action cannot be undone.</p>
            </div>
            <footer style={styles.modalFooter}>
              <button
                onClick={() => setArticleToDelete(null)}
                style={styles.modalCancelBtn}
                className="touch-target"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={styles.confirmDeleteBtn}
                className="touch-target btn-hover-scale"
              >
                Destroy Entry
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Large Portrait/Artwork */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-content-wrapper">
            <img src={lightboxImage} alt="NPC Portrait Full size" className="lightbox-image" />
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "0.75rem",
    gap: "0.75rem",
    position: "relative",
  },
  /* DM split-pane layout */
  splitPaneLayout: {
    display: "flex",
    flexDirection: "row",
    height: "100%",
    gap: 0,
    overflow: "hidden",
    borderRadius: "8px",
    border: "1px solid var(--color-border-light)",
  },
  splitContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  },
  /* Top bar for DM wiki list view */
  wikiTopBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.6rem 0.75rem",
    borderBottom: "1px solid var(--color-border-light)",
    background: "rgba(0, 0, 0, 0.15)",
    flexShrink: 0,
  },
  menuBtn: {
    display: "none",
    background: "transparent",
    border: "1px solid var(--color-border-light)",
    borderRadius: "6px",
    color: "var(--color-muted)",
    cursor: "pointer",
    padding: "0.35rem",
    flexShrink: 0,
  },
  listView: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: "0.75rem",
  },
  sectionTabsContainer: {
    display: "flex",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    background: "rgba(0, 0, 0, 0.2)",
    flexShrink: 0,
    overflowX: "auto",
  },
  sectionTabBtn: {
    flex: 1,
    minWidth: "100px",
    background: "transparent",
    border: "none",
    padding: "0.65rem 0.35rem",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontWeight: 700,
    textAlign: "center",
    whiteSpace: "nowrap",
    transition: "all 0.2s",
  },
  searchBarContainer: {
    display: "flex",
    position: "relative",
    flexShrink: 0,
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  npcAutocompleteWrapper: {
    flex: "1 1 100%",
    marginBottom: "0.25rem",
  },
  importInput: {
    padding: "0.6rem 1rem",
    fontSize: "0.85rem",
    width: "100%",
  },
  searchInput: {
    flex: 1,
    padding: "0.75rem 1rem",
    fontSize: "0.95rem",
    borderRadius: "0.5rem",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    background: "rgba(0,0,0,0.3)",
    color: "var(--color-text)",
    outline: "none",
    minWidth: "180px",
  },
  clearBtn: {
    position: "absolute",
    top: "12px",
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "0.95rem",
    cursor: "pointer",
    padding: "0 0.75rem",
  },
  createBtn: {
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
  listScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  articleCard: {
    padding: "0.85rem 1rem",
    borderRadius: "8px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: "1.05rem",
    fontWeight: 600,
    color: "var(--color-accent)",
    margin: 0,
  },
  cardSubText: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  secretDot: {
    fontSize: "0.72rem",
    color: "var(--color-danger)",
    background: "rgba(235, 87, 87, 0.12)",
    border: "1px solid rgba(235, 87, 87, 0.2)",
    padding: "0.1rem 0.35rem",
    borderRadius: "3px",
  },
  cardPreview: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    lineHeight: 1.4,
    margin: 0,
  },
  cardTags: {
    display: "flex",
    gap: "0.35rem",
    marginTop: "0.25rem",
  },
  cardTag: {
    fontSize: "0.65rem",
    background: "rgba(255, 255, 255, 0.04)",
    padding: "0.15rem 0.4rem",
    borderRadius: "4px",
    color: "var(--color-muted)",
    border: "1px solid rgba(255,255,255,0.04)",
  },
  infoText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
  errorText: {
    textAlign: "center",
    color: "var(--color-danger)",
    fontSize: "0.85rem",
    marginTop: "2.5rem",
  },

  /* Reader View */
  reader: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRadius: "12px",
    overflow: "hidden",
  },
  readerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.65rem 0.75rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
  },
  npcOptionCard: {
    width: "100%",
    textAlign: "left",
    padding: "0.7rem 0.85rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    transition: "transform 0.15s, box-shadow 0.15s",
    minHeight: "44px",
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
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
  },
  dmControlsRow: {
    display: "flex",
    gap: "0.35rem",
  },
  editBtn: {
    padding: "0.45rem 0.75rem",
    borderRadius: "4px",
    background: "rgba(200, 151, 58, 0.1)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: "44px",
  },
  deleteBtn: {
    padding: "0.45rem 0.75rem",
    borderRadius: "4px",
    background: "rgba(235, 87, 87, 0.08)",
    border: "1px solid rgba(235, 87, 87, 0.25)",
    color: "var(--color-danger)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: "44px",
  },
  secretBadge: {
    fontSize: "0.65rem",
    background: "rgba(235, 87, 87, 0.12)",
    border: "1px solid rgba(235, 87, 87, 0.25)",
    color: "var(--color-danger)",
    padding: "0.15rem 0.4rem",
    borderRadius: "4px",
    fontWeight: 600,
  },
  timeBadge: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
  },
  readerScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "1.25rem",
  },
  linkedSessionBadge: {
    display: "inline-flex",
    alignItems: "center",
    marginBottom: "0.75rem",
    padding: "0.35rem 0.75rem",
    borderRadius: "999px",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    background: "rgba(200, 151, 58, 0.12)",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "44px",
  },
  articleTitle: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    marginBottom: "0.5rem",
    lineHeight: 1.25,
    margin: 0,
  },
  npcBioHeader: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: "0.35rem",
    marginTop: "1.5rem",
    marginBottom: "0.75rem",
  },
  npcBioDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginTop: "0.5rem",
  },
  npcBioSection: {
    padding: "0.8rem 1rem",
    borderRadius: "6px",
    background: "rgba(255, 255, 255, 0.02)",
    borderLeft: "3px solid var(--color-accent)",
  },
  npcBioSectionTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 0.4rem 0",
  },
  npcBioText: {
    fontSize: "0.9rem",
    lineHeight: "1.45",
  },
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
    marginBottom: "1.25rem",
  },
  tag: {
    fontSize: "0.7rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    padding: "0.2rem 0.5rem",
    borderRadius: "4px",
    color: "var(--color-accent)",
  },
  contentBody: {
    fontSize: "0.95rem",
    lineHeight: 1.6,
  },

  /* Workspace Editor */
  editor: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRadius: "12px",
    overflow: "hidden",
  },
  editorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.65rem 0.75rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
  },
  editorTitle: {
    fontSize: "1.15rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    margin: 0,
  },
  editorHeaderActions: {
    display: "flex",
    gap: "0.5rem",
  },
  saveBtn: {
    padding: "0.45rem 1rem",
    borderRadius: "4px",
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    border: "none",
    color: "var(--color-bg)",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 700,
    minHeight: "44px",
  },
  editorBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "1rem",
    gap: "1.25rem",
    overflowY: "auto",
  },
  editorErrorText: {
    color: "var(--color-danger)",
    fontSize: "0.8rem",
    background: "rgba(235, 87, 87, 0.08)",
    border: "1px solid rgba(235, 87, 87, 0.2)",
    padding: "0.5rem",
    borderRadius: "4px",
    margin: 0,
  },

  formRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "1rem",
    flexWrap: "wrap",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  input: {
    padding: "0.55rem 0.75rem",
    fontSize: "0.85rem",
  },
  select: {
    padding: "0.55rem 0.75rem",
    fontSize: "0.85rem",
    background: "rgba(0,0,0,0.3)",
    color: "var(--color-text)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    outline: "none",
    cursor: "pointer",
  },
  checkboxGroup: {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    minHeight: "38px",
  },
  checkbox: {
    cursor: "pointer",
    width: "16px",
    height: "16px",
    accentColor: "var(--color-accent)",
  },
  checkboxLabel: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
    cursor: "pointer",
    userSelect: "none",
  },
  tagChipsContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
    alignItems: "center",
    padding: "0.4rem 0.6rem",
  },
  editorTagChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.72rem",
    background: "rgba(200, 151, 58, 0.12)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    padding: "0.15rem 0.45rem",
    borderRadius: "4px",
    color: "var(--color-accent)",
  },
  tagChipRemove: {
    background: "transparent",
    border: "none",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.65rem",
    padding: "0.1rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tagInputField: {
    flex: 1,
    minWidth: "120px",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    padding: "0.1rem 0",
  },
  tabsContainer: {
    display: "flex",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    gap: "1rem",
    flexShrink: 0,
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    padding: "0.45rem 0.25rem",
  },
  workspaceWriteContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    minHeight: "280px",
  },
  toolbar: {
    display: "flex",
    gap: "0.35rem",
    alignItems: "center",
    background: "rgba(0,0,0,0.2)",
    padding: "0.35rem",
    borderRadius: "6px",
    flexWrap: "wrap",
    border: "1px solid rgba(255, 255, 255, 0.04)",
  },
  toolbarBtn: {
    minWidth: "32px",
    height: "32px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "4px",
    color: "var(--color-text)",
    fontSize: "0.75rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  textarea: {
    flex: 1,
    resize: "none",
    minHeight: "220px",
    fontFamily: "Courier New, Courier, monospace",
    fontSize: "0.9rem",
    lineHeight: "1.45",
  },
  textareaMini: {
    padding: "0.55rem 0.75rem",
    fontSize: "0.85rem",
    resize: "vertical",
  },
  previewContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "0.75rem",
    border: "1px solid rgba(255,255,255,0.04)",
    borderRadius: "6px",
    background: "rgba(0,0,0,0.15)",
    minHeight: "280px",
  },

  /* NPC editor section styles */
  editorSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
  },
  subSectionTitle: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    paddingBottom: "0.25rem",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "0.75rem",
  },
  abilityGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "0.5rem",
    "@media (max-width: 600px)": {
      gridTemplateColumns: "repeat(3, 1fr)",
    },
  },
  abilityBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.6rem 0.4rem",
    borderRadius: "8px",
    gap: "0.25rem",
  },
  abilityLabel: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "var(--color-muted)",
  },
  abilityInput: {
    width: "45px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
    textAlign: "center",
    color: "var(--color-text)",
    fontSize: "1rem",
    fontWeight: "bold",
    outline: "none",
    padding: "0.1rem 0",
  },
  abilityModBadge: {
    fontSize: "0.72rem",
    color: "var(--color-accent)",
    background: "rgba(200,151,58,0.1)",
    padding: "0.05rem 0.35rem",
    borderRadius: "4px",
    fontWeight: 600,
  },
  actionsHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addActionBtn: {
    padding: "0.4rem 0.85rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200,151,58,0.35)",
    borderRadius: "6px",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "36px",
  },
  actionsEditorList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
  },
  actionItemBox: {
    borderRadius: "8px",
    padding: "0.85rem",
    background: "rgba(255,255,255,0.01)",
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  removeActionBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-danger)",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  actionFieldsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 100px 140px",
    gap: "0.75rem",
  },
  actionIdxLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--color-muted)",
    margin: 0,
  },

  /* CATEGORY CHOICE MODAL */
  categoryPromptBox: {
    width: "100%",
    maxWidth: "520px",
    borderRadius: "12px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    background: "rgba(15, 14, 23, 0.95)",
    boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
  },
  categoryPromptGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
    marginTop: "0.5rem",
    "@media (max-width: 500px)": {
      gridTemplateColumns: "1fr",
    },
  },
  categoryPromptBtn: {
    padding: "1rem",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "0.35rem",
    transition: "all 0.2s",
  },
  categoryPromptIcon: {
    fontSize: "1.75rem",
    marginBottom: "0.25rem",
  },
  categoryPromptLabel: {
    fontSize: "0.95rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
  },
  categoryPromptDesc: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
    lineHeight: 1.3,
  },

  /* MODAL OVERLAY STYLES */
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
  modalBody: {
    fontSize: "0.85rem",
    lineHeight: 1.5,
    color: "var(--color-text)",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.5rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: "0.75rem",
  },
  modalCancelBtn: {
    padding: "0.45rem 0.85rem",
    borderRadius: "4px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: "44px",
  },
  confirmDeleteBtn: {
    padding: "0.45rem 1rem",
    borderRadius: "4px",
    background: "rgba(235, 87, 87, 0.15)",
    border: "1px solid rgba(235, 87, 87, 0.35)",
    color: "var(--color-danger)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 700,
    minHeight: "44px",
  },
  // NPC token image preview
  npcTokenPreview: {
    width: "64px",
    height: "64px",
    borderRadius: "8px",
    overflow: "hidden",
    border: "2px solid var(--color-accent)",
    flexShrink: 0,
    background: "var(--color-surface)",
  },
  npcTokenPreviewImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  // Auto-find button
  autoFindBtn: {
    padding: "0.3rem 0.75rem",
    borderRadius: "6px",
    background: "rgba(100, 180, 255, 0.1)",
    border: "1px solid rgba(100, 180, 255, 0.25)",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.72rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  // NPC token preset grid
  npcPresetGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem",
  },
  npcPresetBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.2rem",
    padding: "0.3rem",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.03)",
    cursor: "pointer",
    width: "60px",
  },
  npcPresetImg: {
    width: "40px",
    height: "40px",
    borderRadius: "4px",
    objectFit: "cover",
  },
  npcPresetLabel: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    textAlign: "center",
    lineHeight: 1.1,
  },
};

const statblockStyles = {
  block: {
    padding: "1rem",
    borderRadius: "8px",
    background: "rgba(15, 12, 30, 0.4)",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
    marginBottom: "1.25rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: "1.3rem",
    color: "var(--color-accent)",
    fontWeight: "bold",
    margin: 0,
  },
  meta: {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
  },
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid rgba(200, 151, 58, 0.3)",
  },
  hpAcRow: {
    display: "flex",
    gap: "1.5rem",
    fontSize: "0.88rem",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "0.5rem",
  },
  statItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  hpControls: {
    display: "inline-flex",
    gap: "0.25rem",
    marginLeft: "0.5rem",
  },
  hpBtn: {
    padding: "0.1rem 0.4rem",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.7rem",
    fontWeight: "bold",
  },
  abilityGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "0.4rem",
  },
  abilityBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem 0.25rem",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "6px",
    cursor: "pointer",
  },
  abilityLabel: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    fontWeight: "bold",
  },
  abilityScore: {
    fontSize: "0.9rem",
    fontWeight: "bold",
    color: "var(--color-text)",
  },
  abilityMod: {
    fontSize: "0.7rem",
    color: "var(--color-accent)",
    fontWeight: "bold",
  },
  actionsSection: {
    marginTop: "0.5rem",
  },
  sectionTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "var(--color-accent)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "0.2rem",
    marginBottom: "0.4rem",
  },
  actionsList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  actionItem: {
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.01)",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  actionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionName: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
  },
  rollBtn: {
    padding: "0.2rem 0.6rem",
    background: "rgba(200, 151, 58, 0.12)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    borderRadius: "4px",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.7rem",
    fontWeight: "bold",
  },
  actionDesc: {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
    margin: 0,
  },
  actionDmg: {
    fontSize: "0.78rem",
    color: "var(--color-text)",
  },

};
