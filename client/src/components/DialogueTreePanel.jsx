// =============================================================================
// Tablecast  NPC Dialogue Tree Builder & Player Viewer
// Dual-mode component: DM tree editor (builder) and player dialogue viewer.
// Modes: "builder" (DM only) and "player" (read-only dialogue playback).
// =============================================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown,
  Circle,
  Edit3,
  FileText,
  MessageCircle,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { WikiPanelSkeleton } from "./PanelSkeleton";

// eslint-disable-next-line unused-imports/no-unused-vars
const debug = import.meta.env.DEV ? console.log : () => {};

const SKILL_TYPES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "acrobatics",
  "animal_handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight_of_hand",
  "stealth",
  "survival",
];

const DEFAULT_DIALOGUE_TREE = {
  startNodeId: null,
  nodes: [],
};

export default function DialogueTreePanel({ user, readOnly = false, isPopout = false, initialNpcId = null }) {
  const { addToast } = useToast();
  const { socket } = useSocket();
  const isDm = user?.role === "DM" && !readOnly;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id, user?.isCharacter]);

  // -------------------------------------------------------------------------
  // NPC Selector State
  // -------------------------------------------------------------------------
  const [npcs, setNpcs] = useState([]);
  const [selectedNpcId, setSelectedNpcId] = useState(initialNpcId);
  const [npcSearch, setNpcSearch] = useState("");
  const [loadingNpcs, setLoadingNpcs] = useState(true);

  // -------------------------------------------------------------------------
  // Dialogue Tree State
  // -------------------------------------------------------------------------
  const [dialogueTree, setDialogueTree] = useState(DEFAULT_DIALOGUE_TREE);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [npcName, setNpcName] = useState("");
  const [loadingTree, setLoadingTree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [validationWarnings, setValidationWarnings] = useState([]);

  // -------------------------------------------------------------------------
  // Mode State
  // -------------------------------------------------------------------------
  const [activeMode, setActiveMode] = useState("builder"); // "builder" | "player"

  // -------------------------------------------------------------------------
  // Player mode state
  // -------------------------------------------------------------------------
  const [dialogueActive, setDialogueActive] = useState(false);
  const [currentNode, setCurrentNode] = useState(null);
  const [dialogueMessages, setDialogueMessages] = useState([]);
  const [lastChoiceIndex, setLastChoiceIndex] = useState(null);
  const [advancing, setAdvancing] = useState(false);

  // -------------------------------------------------------------------------
  // New node form state
  // -------------------------------------------------------------------------
  const [showNewNodeForm, setShowNewNodeForm] = useState(false);
  const [newNodeIdInput, setNewNodeIdInput] = useState("");

  // -------------------------------------------------------------------------
  // NPC Data Fetching
  // -------------------------------------------------------------------------
  const fetchNpcs = useCallback(async () => {
    try {
      setLoadingNpcs(true);
      const res = await fetch("/api/npcs", { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load NPCs.");
      const data = await res.json();
      setNpcs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingNpcs(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchNpcs();
  }, [fetchNpcs]);

  // -------------------------------------------------------------------------
  // Dialogue Tree Fetching
  // -------------------------------------------------------------------------
  const fetchDialogueTree = useCallback(
    async (npcId) => {
      if (!npcId) return;
      try {
        setLoadingTree(true);
        setError(null);
        const res = await fetch(`/api/npcs/${npcId}/dialogue`, { headers: authHeaders });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load dialogue tree.");
        }
        const data = await res.json();
        setDialogueTree(data.dialogueTree || DEFAULT_DIALOGUE_TREE);
        setNpcName(data.npcName || "");
        setSelectedNodeId(null);
        setCurrentNode(null);
        setDialogueActive(false);
        setDialogueMessages([]);
      } catch (err) {
        setError(err.message);
        setDialogueTree(DEFAULT_DIALOGUE_TREE);
      } finally {
        setLoadingTree(false);
      }
    },
    [authHeaders]
  );

  useEffect(() => {
    if (selectedNpcId) {
      fetchDialogueTree(selectedNpcId);
    }
  }, [selectedNpcId, fetchDialogueTree]);

  // -------------------------------------------------------------------------
  // Filtered NPC list
  // -------------------------------------------------------------------------
  const filteredNpcs = useMemo(() => {
    if (!npcSearch.trim()) return npcs;
    const q = npcSearch.toLowerCase();
    return npcs.filter(
      (npc) =>
        npc.name.toLowerCase().includes(q) || (npc.race || "").toLowerCase().includes(q)
    );
  }, [npcs, npcSearch]);

  // -------------------------------------------------------------------------
  // Select NPC by id
  // -------------------------------------------------------------------------
  const selectedNpc = useMemo(
    () => npcs.find((n) => n.id === selectedNpcId) || null,
    [npcs, selectedNpcId]
  );

  // -------------------------------------------------------------------------
  // Tree helpers
  // -------------------------------------------------------------------------
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return dialogueTree.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [dialogueTree.nodes, selectedNodeId]);

  // eslint-disable-next-line unused-imports/no-unused-vars
  const rootNode = useMemo(() => {
    if (dialogueTree.startNodeId) {
      return dialogueTree.nodes.find((n) => n.id === dialogueTree.startNodeId) || null;
    }
    return dialogueTree.nodes.find((n) => n.isRoot) || null;
  }, [dialogueTree]);

  // -------------------------------------------------------------------------
  // Node color coding
  // -------------------------------------------------------------------------
  function getNodeColor(node) {
    if (!node) return "var(--color-text, #e5e7eb)";
    if (node.id === dialogueTree.startNodeId || node.isRoot) return "var(--color-accent, #c8973a)"; // gold
    if (node.choices?.some((c) => c.skillCheck)) return "#3b82f6"; // blue
    if (!node.choices || node.choices.length === 0) return "#22c55e"; // green (terminal)
    return "var(--color-text, #e5e7eb)";
  }

  function getNodeLabel(node) {
    if (node.id === dialogueTree.startNodeId || node.isRoot) return "Root";
    if (node.choices?.some((c) => c.skillCheck)) return "Skill Check";
    if (!node.choices || node.choices.length === 0) return "Terminal";
    return "";
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  function validateTree(tree) {
    const warnings = [];
    const nodeIds = new Set(tree.nodes.map((n) => n.id));

    // Check startNodeId
    if (!tree.startNodeId) {
      warnings.push("No start node set — the dialogue will have no entry point.");
    } else if (!nodeIds.has(tree.startNodeId)) {
      warnings.push(`Start node "${tree.startNodeId}" does not exist in the node list.`);
    }

    // Check for broken nextNodeId references
    for (const node of tree.nodes) {
      if (node.choices) {
        for (const choice of node.choices) {
          if (choice.nextNodeId && !nodeIds.has(choice.nextNodeId)) {
            warnings.push(
              `Node "${node.id}" → Choice "${choice.text}" references missing node "${choice.nextNodeId}".`
            );
          }
        }
      }
      if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
        warnings.push(
          `Node "${node.id}" has nextNodeId "${node.nextNodeId}" which does not exist.`
        );
      }
    }

    // Check for duplicate node IDs
    const seen = new Set();
    for (const node of tree.nodes) {
      if (seen.has(node.id)) {
        warnings.push(`Duplicate node ID: "${node.id}".`);
      }
      seen.add(node.id);
    }

    // Check for empty nodes
    for (const node of tree.nodes) {
      if (!node.npcText || node.npcText.trim() === "") {
        warnings.push(`Node "${node.id}" has no dialog text.`);
      }
    }

    setValidationWarnings(warnings);
    return warnings;
  }

  // -------------------------------------------------------------------------
  // Node CRUD
  // -------------------------------------------------------------------------
  function handleCreateNode() {
    const id = newNodeIdInput.trim() || `node_${Date.now()}`;
    const existing = dialogueTree.nodes.find((n) => n.id === id);
    if (existing) {
      addToast(`Node ID "${id}" already exists.`, "warning");
      return;
    }

    const newNode = {
      id,
      npcText: "",
      choices: [],
      isRoot: false,
      onEnter: [],
      tags: [],
    };

    setDialogueTree((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(id);
    setShowNewNodeForm(false);
    setNewNodeIdInput("");
    addToast(`Node "${id}" created.`, "success");
  }

  function handleDeleteNode(nodeId) {
    if (!window.confirm(`Delete node "${nodeId}"? This cannot be undone.`)) return;
    setDialogueTree((prev) => {
      const newNodes = prev.nodes.filter((n) => n.id !== nodeId);
      const newStartNodeId = prev.startNodeId === nodeId ? null : prev.startNodeId;

      // Also remove references to this node in choices
      const cleanedNodes = newNodes.map((n) => ({
        ...n,
        choices: (n.choices || []).map((c) => ({
          ...c,
          nextNodeId: c.nextNodeId === nodeId ? null : c.nextNodeId,
        })),
        nextNodeId: n.nextNodeId === nodeId ? null : n.nextNodeId,
      }));

      return {
        startNodeId: newStartNodeId,
        nodes: cleanedNodes,
      };
    });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    addToast(`Node "${nodeId}" deleted.`, "info");
  }

  function handleNodeFieldChange(field, value) {
    if (!selectedNodeId) return;
    setDialogueTree((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === selectedNodeId ? { ...n, [field]: value } : n)),
    }));
  }

  function handleSetAsRoot() {
    if (!selectedNodeId) return;
    setDialogueTree((prev) => ({
      ...prev,
      startNodeId: selectedNodeId,
      nodes: prev.nodes.map((n) => ({
        ...n,
        isRoot: n.id === selectedNodeId,
      })),
    }));
    addToast(`Node "${selectedNodeId}" set as root.`, "success");
  }

  // -------------------------------------------------------------------------
  // Choice CRUD
  // -------------------------------------------------------------------------
  function handleAddChoice() {
    if (!selectedNode) return;
    const choiceId = `choice_${Date.now()}`;
    const newChoice = {
      id: choiceId,
      text: "",
      nextNodeId: dialogueTree.nodes.length > 0 ? dialogueTree.nodes[0].id : null,
      condition: null,
      skillCheck: null,
    };
    handleNodeFieldChange("choices", [...(selectedNode.choices || []), newChoice]);
  }

  function handleDeleteChoice(choiceIndex) {
    if (!selectedNode || !selectedNode.choices) return;
    const updated = selectedNode.choices.filter((_, i) => i !== choiceIndex);
    handleNodeFieldChange("choices", updated);
  }

  function handleChoiceFieldChange(choiceIndex, field, value) {
    if (!selectedNode || !selectedNode.choices) return;
    const updated = selectedNode.choices.map((c, i) =>
      i === choiceIndex ? { ...c, [field]: value } : c
    );
    handleNodeFieldChange("choices", updated);
  }

  function handleToggleSkillCheck(choiceIndex) {
    if (!selectedNode || !selectedNode.choices) return;
    // eslint-disable-next-line unused-imports/no-unused-vars
    const choice = selectedNode.choices[choiceIndex];
    const updated = selectedNode.choices.map((c, i) => {
      if (i !== choiceIndex) return c;
      if (c.skillCheck) {
        // eslint-disable-next-line unused-imports/no-unused-vars
        const { skillCheck, ...rest } = c;
        return rest;
      }
      return { ...c, skillCheck: { type: "persuasion", dc: 10 } };
    });
    handleNodeFieldChange("choices", updated);
  }

  function handleSkillCheckFieldChange(choiceIndex, field, value) {
    if (!selectedNode || !selectedNode.choices) return;
    const choice = selectedNode.choices[choiceIndex];
    if (!choice.skillCheck) return;
    const updated = selectedNode.choices.map((c, i) =>
      i === choiceIndex
        ? { ...c, skillCheck: { ...c.skillCheck, [field]: value } }
        : c
    );
    handleNodeFieldChange("choices", updated);
  }

  // -------------------------------------------------------------------------
  // Tags helpers
  // -------------------------------------------------------------------------
  function handleAddTag(tag) {
    if (!selectedNode || !tag.trim()) return;
    const currentTags = selectedNode.tags || [];
    if (currentTags.includes(tag.trim())) return;
    handleNodeFieldChange("tags", [...currentTags, tag.trim()]);
  }

  function handleRemoveTag(tag) {
    if (!selectedNode) return;
    const currentTags = selectedNode.tags || [];
    handleNodeFieldChange(
      "tags",
      currentTags.filter((t) => t !== tag)
    );
  }

  // -------------------------------------------------------------------------
  // On-Enter effects helpers
  // -------------------------------------------------------------------------
  function handleAddOnEnter() {
    if (!selectedNode) return;
    const current = selectedNode.onEnter || [];
    handleNodeFieldChange("onEnter", [...current, ""]);
  }

  function handleRemoveOnEnter(index) {
    if (!selectedNode) return;
    const current = selectedNode.onEnter || [];
    handleNodeFieldChange(
      "onEnter",
      current.filter((_, i) => i !== index)
    );
  }

  function handleOnEnterChange(index, value) {
    if (!selectedNode) return;
    const current = selectedNode.onEnter || [];
    handleNodeFieldChange(
      "onEnter",
      current.map((e, i) => (i === index ? value : e))
    );
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  async function handleSave() {
    if (!selectedNpcId) return;

    const warnings = validateTree(dialogueTree);
    if (warnings.length > 0) {
      const proceed = window.confirm(
        `There are ${warnings.length} issue(s) with the tree.\n\n${warnings.join("\n")}\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/npcs/${selectedNpcId}/dialogue`, {
        method: "PUT",
        headers: getJsonAuthHeaders(user, "application/json"),
        body: JSON.stringify({ dialogueTree }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save dialogue tree.");
      }
      addToast("Dialogue tree saved successfully.", "success");
    } catch (err) {
      setError(err.message);
      addToast(`Save failed: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Player mode: Start dialogue
  // -------------------------------------------------------------------------
  async function handleStartDialogue() {
    if (!selectedNpcId) return;
    try {
      setAdvancing(true);
      setError(null);
      const res = await fetch(`/api/npcs/${selectedNpcId}/dialogue/start`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start dialogue.");
      }
      const data = await res.json();
      setCurrentNode(data.node);
      setDialogueActive(true);
      setDialogueMessages([{ type: "npc", text: data.node.npcText || "(silence)" }]);
      setLastChoiceIndex(null);
    } catch (err) {
      setError(err.message);
      addToast(err.message, "error");
    } finally {
      setAdvancing(false);
    }
  }

  // -------------------------------------------------------------------------
  // Player mode: Advance dialogue
  // -------------------------------------------------------------------------
  async function handleAdvanceDialogue(choiceIndex) {
    if (!selectedNpcId || !currentNode) return;
    try {
      setAdvancing(true);
      setError(null);
      const res = await fetch(`/api/npcs/${selectedNpcId}/dialogue/advance`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          nodeId: currentNode.id,
          choiceIndex: choiceIndex !== undefined ? choiceIndex : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to advance dialogue.");
      }
      const data = await res.json();
      setLastChoiceIndex(choiceIndex);

      // Show previous node data + messages
      const newMessages = [...dialogueMessages];

      // Remove last NPC message if re-advancing from same node
      if (data.messages) {
        for (const msg of data.messages) {
          newMessages.push({ type: "system", text: msg });
        }
      }

      if (data.nextNode) {
        newMessages.push({ type: "npc", text: data.nextNode.npcText || "(silence)" });
        setCurrentNode(data.nextNode);
      } else {
        newMessages.push({ type: "system", text: "— Dialogue ended —" });
        setCurrentNode(null);
        setDialogueActive(false);
      }

      setDialogueMessages(newMessages);
    } catch (err) {
      setError(err.message);
      addToast(err.message, "error");
    } finally {
      setAdvancing(false);
    }
  }

  // -------------------------------------------------------------------------
  // Player mode: Exit dialogue
  // -------------------------------------------------------------------------
  function handleExitDialogue() {
    setDialogueActive(false);
    setCurrentNode(null);
    setDialogueMessages([]);
    setLastChoiceIndex(null);
  }

  // -------------------------------------------------------------------------
  // Socket listeners for dialogue sync
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const handleDialogueStart = (data) => {
      if (data.npcId === selectedNpcId) {
        setCurrentNode(data.startNode);
        setDialogueActive(true);
        setDialogueMessages([{ type: "npc", text: data.startNode?.npcText || "" }]);
      }
    };

    const handleDialogueAdvance = (data) => {
      if (data.npcId === selectedNpcId) {
        if (data.nextNode) {
          setDialogueMessages((prev) => [
            ...prev,
            ...(data.messages || []).map((m) => ({ type: "system", text: m })),
            { type: "npc", text: data.nextNode.npcText || "" },
          ]);
          setCurrentNode(data.nextNode);
        } else {
          setDialogueMessages((prev) => [
            ...prev,
            { type: "system", text: "— Dialogue ended —" },
          ]);
          setCurrentNode(null);
          setDialogueActive(false);
        }
      }
    };

    socket.on("dialogue:start", handleDialogueStart);
    socket.on("dialogue:advance", handleDialogueAdvance);

    return () => {
      socket.off("dialogue:start", handleDialogueStart);
      socket.off("dialogue:advance", handleDialogueAdvance);
    };
  }, [socket, selectedNpcId]);

  // -------------------------------------------------------------------------
  // Render Helpers
  // -------------------------------------------------------------------------

  function renderNpcSelector() {
    return (
      <div style={styles.section}>
        <div style={styles.selectorHeader}>
          <h3 style={styles.sectionTitle}>
            <MessageCircle size={16} />
            NPC Dialogue
          </h3>
          {isDm && (
            <div style={styles.modeToggle}>
              <button
                className={`touch-target btn-hover-scale ${activeMode === "builder" ? "gold-border-glow" : ""}`}
                style={{
                  ...styles.modeBtn,
                  ...(activeMode === "builder" ? styles.modeBtnActive : {}),
                }}
                onClick={() => setActiveMode("builder")}
              >
                <Edit3 size={14} />
                Builder
              </button>
              <button
                className={`touch-target btn-hover-scale ${activeMode === "player" ? "gold-border-glow" : ""}`}
                style={{
                  ...styles.modeBtn,
                  ...(activeMode === "player" ? styles.modeBtnActive : {}),
                }}
                onClick={() => setActiveMode("player")}
              >
                <Play size={14} />
                Player
              </button>
            </div>
          )}
        </div>

        {/* NPC search */}
        <div style={styles.searchWrap}>
          <input
            type="text"
            className="form-input"
            placeholder="Search NPCs by name or race..."
            value={npcSearch}
            onChange={(e) => setNpcSearch(e.target.value)}
            style={styles.searchInput}
          />
          {npcSearch && (
            <button
              className="touch-target"
              style={styles.clearBtn}
              onClick={() => setNpcSearch("")}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* NPC list */}
        <div style={styles.npcList}>
          {loadingNpcs ? (
            <div style={styles.loadingText}>Loading NPCs...</div>
          ) : filteredNpcs.length === 0 ? (
            <div style={styles.emptyText}>
              {npcSearch ? "No NPCs match your search." : "No NPCs found. Create some in the Wiki panel first."}
            </div>
          ) : (
            filteredNpcs.map((npc) => {
              const hasTree = npc.dialogueTree && npc.dialogueTree !== "{}";
              return (
                <button
                  key={npc.id}
                  className={`touch-target btn-hover-scale ${selectedNpcId === npc.id ? "gold-border-glow glass-panel" : ""}`}
                  style={{
                    ...styles.npcItem,
                    ...(selectedNpcId === npc.id ? styles.npcItemSelected : {}),
                  }}
                  onClick={() => setSelectedNpcId(npc.id)}
                >
                  <div style={styles.npcItemInfo}>
                    <div style={styles.npcItemName}>{npc.name}</div>
                    {npc.race && <div style={styles.npcItemRace}>{npc.race}</div>}
                  </div>
                  <div
                    style={{
                      ...styles.treeBadge,
                      background: hasTree ? "rgba(34, 197, 94, 0.2)" : "rgba(107, 114, 128, 0.2)",
                      color: hasTree ? "#22c55e" : "#6b7280",
                    }}
                    title={hasTree ? "Has dialogue tree" : "No dialogue tree"}
                  >
                    <FileText size={12} />
                    {hasTree ? "Tree" : "Empty"}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  function renderBuilderView() {
    if (!selectedNpc) {
      return (
        <div style={styles.emptyState}>
          <MessageCircle size={48} opacity={0.3} />
          <p>Select an NPC from the left panel to start building their dialogue tree.</p>
        </div>
      );
    }

    return (
      <div style={styles.builderLayout}>
        {/* Tree visualization (left / top) */}
        <div style={styles.treePanel}>
          <div style={styles.treePanelHeader}>
            <h4 style={styles.panelTitle}>
              <ChevronDown size={14} />
              Tree: {npcName}
            </h4>
            <div style={styles.treePanelActions}>
              <button
                className="touch-target btn-hover-scale"
                style={styles.smallBtn}
                onClick={() => {
                  setShowNewNodeForm(true);
                  setNewNodeIdInput(`node_${dialogueTree.nodes.length + 1}`);
                }}
                title="Add node"
              >
                <Plus size={14} />
                Node
              </button>
              <button
                className="touch-target btn-hover-scale"
                style={{ ...styles.smallBtn, ...styles.saveBtn }}
                onClick={handleSave}
                disabled={saving}
                title="Save dialogue tree"
              >
                <Save size={14} />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Validation warnings */}
          {validationWarnings.length > 0 && (
            <div style={styles.warningsBox}>
              {validationWarnings.map((w, i) => (
                <div key={i} style={styles.warningItem}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* New node form */}
          {showNewNodeForm && (
            <div style={styles.newNodeForm}>
              <input
                type="text"
                className="form-input"
                placeholder="Node ID (e.g. node_5)"
                value={newNodeIdInput}
                onChange={(e) => setNewNodeIdInput(e.target.value)}
                style={styles.newNodeInput}
              />
              <div style={styles.newNodeActions}>
                <button
                  className="touch-target btn-hover-scale"
                  style={styles.confirmBtn}
                  onClick={handleCreateNode}
                >
                  Create
                </button>
                <button
                  className="touch-target btn-hover-scale"
                  style={styles.cancelBtn}
                  onClick={() => setShowNewNodeForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Node list */}
          {loadingTree ? (
            <div style={styles.loadingText}>Loading tree...</div>
          ) : dialogueTree.nodes.length === 0 ? (
            <div style={styles.emptyText}>
              No nodes yet. Click "+ Node" to add the first dialogue node.
            </div>
          ) : (
            <div style={styles.nodeList}>
              {dialogueTree.nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const color = getNodeColor(node);
                const label = getNodeLabel(node);
                const choiceCount = node.choices?.length || 0;
                return (
                  <button
                    key={node.id}
                    className={`touch-target btn-hover-scale ${isSelected ? "glass-panel" : ""}`}
                    style={{
                      ...styles.nodeCard,
                      borderLeftColor: color,
                      ...(isSelected ? styles.nodeCardSelected : {}),
                    }}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div style={styles.nodeCardHeader}>
                      <span style={{ ...styles.nodeCardId, color }}>{node.id}</span>
                      {label && <span style={{ ...styles.nodeCardLabel, background: `${color}22`, color }}>{label}</span>}
                    </div>
                    <div style={styles.nodeCardPreview}>
                      {node.npcText
                        ? node.npcText.length > 80
                          ? `${node.npcText.slice(0, 80)}...`
                          : node.npcText
                        : <span style={{ opacity: 0.4 }}>(empty)</span>}
                    </div>
                    <div style={styles.nodeCardMeta}>
                      <span>{choiceCount} choice{choiceCount !== 1 ? "s" : ""}</span>
                      {node.tags?.length > 0 && (
                        <span style={styles.tagBadge}>{node.tags.length} tag{node.tags.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Node editor (right / bottom) */}
        <div style={styles.editorPanel}>
          {selectedNode ? (
            <div style={styles.editorContent}>
              <div style={styles.editorHeader}>
                <h4 style={styles.panelTitle}>Editing: {selectedNode.id}</h4>
                <div style={styles.editorActions}>
                  <button
                    className="touch-target btn-hover-scale"
                    style={{ ...styles.smallBtn, ...styles.rootBtn }}
                    onClick={handleSetAsRoot}
                    title="Set as root node"
                  >
                    <Circle size={14} />
                    Set Root
                  </button>
                  <button
                    className="touch-target btn-hover-scale"
                    style={{ ...styles.smallBtn, ...styles.dangerBtn }}
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    title="Delete node"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* NPC Text */}
              <div style={styles.formGroup}>
                <label style={styles.label}>NPC Dialog Text</label>
                <textarea
                  className="form-input"
                  value={selectedNode.npcText || ""}
                  onChange={(e) => handleNodeFieldChange("npcText", e.target.value)}
                  style={styles.textarea}
                  rows={4}
                  placeholder="What does the NPC say?"
                />
              </div>

              {/* Tags */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Tags</label>
                <div style={styles.tagsDisplay}>
                  {(selectedNode.tags || []).map((tag) => (
                    <span key={tag} style={styles.tagChip}>
                      {tag}
                      <button
                        className="touch-target"
                        style={styles.tagRemove}
                        onClick={() => handleRemoveTag(tag)}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <TagInput onAdd={handleAddTag} />
              </div>

              {/* On-Enter Effects */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  On-Enter Effects
                  <button
                    className="touch-target"
                    style={styles.addRowBtn}
                    onClick={handleAddOnEnter}
                    title="Add effect"
                  >
                    <Plus size={12} />
                  </button>
                </label>
                {(selectedNode.onEnter || []).length === 0 ? (
                  <div style={styles.hintText}>No effects. Effects run when this node is entered.</div>
                ) : (
                  (selectedNode.onEnter || []).map((effect, i) => (
                    <div key={i} style={styles.effectRow}>
                      <input
                        type="text"
                        className="form-input"
                        value={effect}
                        onChange={(e) => handleOnEnterChange(i, e.target.value)}
                        style={styles.effectInput}
                        placeholder='e.g. "give_item: ancient_key"'
                      />
                      <button
                        className="touch-target"
                        style={styles.removeRowBtn}
                        onClick={() => handleRemoveOnEnter(i)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Choices */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Choices
                  <button
                    className="touch-target"
                    style={styles.addRowBtn}
                    onClick={handleAddChoice}
                    title="Add choice"
                  >
                    <Plus size={12} />
                    Add Choice
                  </button>
                </label>

                {(selectedNode.choices || []).length === 0 ? (
                  <div style={styles.hintText}>
                    No choices — this node is a terminal or auto-advances.
                  </div>
                ) : (
                  (selectedNode.choices || []).map((choice, i) => (
                    <div key={choice.id || i} style={styles.choiceCard}>
                      <div style={styles.choiceHeader}>
                        <span style={styles.choiceIndex}>#{i + 1}</span>
                        <button
                          className="touch-target"
                          style={styles.removeRowBtn}
                          onClick={() => handleDeleteChoice(i)}
                          title="Delete choice"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.labelSmall}>Choice Text</label>
                        <input
                          type="text"
                          className="form-input"
                          value={choice.text || ""}
                          onChange={(e) => handleChoiceFieldChange(i, "text", e.target.value)}
                          style={styles.input}
                          placeholder="What the player sees"
                        />
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.labelSmall}>Next Node</label>
                        <select
                          className="form-input"
                          value={choice.nextNodeId || ""}
                          onChange={(e) => handleChoiceFieldChange(i, "nextNodeId", e.target.value)}
                          style={styles.input}
                        >
                          <option value="">— None (end) —</option>
                          {dialogueTree.nodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.id}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Skill Check toggle */}
                      <div style={styles.skillCheckWrap}>
                        <label style={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={!!choice.skillCheck}
                            onChange={() => handleToggleSkillCheck(i)}
                          />
                          <span style={{ fontSize: 12 }}>Skill Check</span>
                        </label>

                        {choice.skillCheck && (
                          <div style={styles.skillCheckFields}>
                            <div style={styles.formGroup}>
                              <label style={styles.labelSmall}>Skill</label>
                              <select
                                className="form-input"
                                value={choice.skillCheck.type || "persuasion"}
                                onChange={(e) => handleSkillCheckFieldChange(i, "type", e.target.value)}
                                style={styles.input}
                              >
                                {SKILL_TYPES.map((s) => (
                                  <option key={s} value={s}>
                                    {s.replace(/_/g, " ")}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={styles.formGroup}>
                              <label style={styles.labelSmall}>DC</label>
                              <input
                                type="number"
                                className="form-input"
                                value={choice.skillCheck.dc || 10}
                                onChange={(e) =>
                                  handleSkillCheckFieldChange(i, "dc", Math.max(1, parseInt(e.target.value, 10) || 10))
                                }
                                style={{ ...styles.input, width: 80 }}
                                min={1}
                                max={30}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <Edit3 size={36} opacity={0.3} />
              <p>Select a node from the tree to edit its properties.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderPlayerView() {
    if (!selectedNpc) {
      return (
        <div style={styles.emptyState}>
          <MessageCircle size={48} opacity={0.3} />
          <p>
            {isDm
              ? "Select an NPC from the left panel to preview or start their dialogue."
              : "Select an NPC to start a conversation."}
          </p>
        </div>
      );
    }

    return (
      <div style={styles.playerLayout}>
        {/* Dialogue header */}
        <div style={styles.playerHeader}>
          <div style={styles.playerNpcInfo}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{npcName}</h3>
            {selectedNpc?.race && (
              <span style={{ fontSize: 13, opacity: 0.6 }}>{selectedNpc.race}</span>
            )}
          </div>
          <div style={styles.playerActions}>
            {dialogueActive ? (
              <button
                className="touch-target btn-hover-scale"
                style={{ ...styles.playerBtn, background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={handleExitDialogue}
              >
                <Square size={14} />
                Exit Dialogue
              </button>
            ) : (
              <button
                className="touch-target btn-hover-scale gold-border-glow"
                style={{ ...styles.playerBtn, background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", borderColor: "rgba(34, 197, 94, 0.3)" }}
                onClick={handleStartDialogue}
                disabled={advancing}
              >
                <Play size={14} />
                {advancing ? "Starting..." : "Start Dialogue"}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && <div style={styles.errorBanner}>{error}</div>}

        {/* No dialogue tree */}
        {!dialogueTree.nodes || dialogueTree.nodes.length === 0 ? (
          <div style={styles.emptyState}>
            <FileText size={36} opacity={0.3} />
            <p>This NPC has no dialogue tree yet.</p>
          </div>
        ) : dialogueActive && currentNode ? (
          /* Active dialogue */
          <div style={styles.dialogueView}>
            {/* Messages */}
            <div style={styles.dialogueMessages}>
              {dialogueMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.dialogueBubble,
                    ...(msg.type === "npc"
                      ? styles.dialogueBubbleNpc
                      : msg.type === "system"
                      ? styles.dialogueBubbleSystem
                      : styles.dialogueBubbleChoice),
                  }}
                >
                  {msg.type === "npc" && (
                    <div style={styles.dialogueSpeaker}>{npcName}</div>
                  )}
                  <div style={styles.dialogueText}>{msg.text}</div>
                </div>
              ))}
            </div>

            {/* Choices */}
            {currentNode.choices && currentNode.choices.length > 0 && (
              <div style={styles.choicesArea}>
                <div style={styles.choicesLabel}>Your response:</div>
                {currentNode.choices.map((choice, i) => {
                  const isSelected = lastChoiceIndex === i;
                  const hasSkillCheck = !!choice.skillCheck;
                  return (
                    <button
                      key={choice.id || i}
                      className={`touch-target btn-hover-scale ${isSelected ? "gold-border-glow" : ""}`}
                      style={{
                        ...styles.choiceBtn,
                        ...(isSelected ? styles.choiceBtnSelected : {}),
                        ...(hasSkillCheck ? styles.choiceBtnSkill : {}),
                      }}
                      onClick={() => handleAdvanceDialogue(i)}
                      disabled={advancing}
                    >
                      <div style={styles.choiceBtnContent}>
                        <span>{choice.text || "(continue)"}</span>
                        {hasSkillCheck && (
                          <span style={styles.skillBadge}>
                            {choice.skillCheck.type.replace(/_/g, " ")} DC {choice.skillCheck.dc}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Auto advance if no choices */}
            {(!currentNode.choices || currentNode.choices.length === 0) && (
              <div style={styles.autoAdvanceArea}>
                <button
                  className="touch-target btn-hover-scale"
                  style={styles.continueBtn}
                  onClick={() => handleAdvanceDialogue(undefined)}
                  disabled={advancing}
                >
                  {advancing ? "..." : "Continue →"}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Not started */
          !dialogueActive && (
            <div style={styles.dialogueStartPrompt}>
              <MessageCircle size={36} opacity={0.3} />
              <p>Click "Start Dialogue" to begin the conversation with {npcName}.</p>
            </div>
          )
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Tag Input sub-component
  // -------------------------------------------------------------------------
  function TagInput({ onAdd }) {
    const [value, setValue] = useState("");
    const [showInput, setShowInput] = useState(false);

    function handleSubmit() {
      if (value.trim()) {
        onAdd(value.trim());
        setValue("");
        setShowInput(false);
      }
    }

    if (!showInput) {
      return (
        <button
          className="touch-target btn-hover-scale"
          style={styles.addTagBtn}
          onClick={() => setShowInput(true)}
        >
          <Plus size={12} />
          Add Tag
        </button>
      );
    }

    return (
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <input
          type="text"
          className="form-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") setShowInput(false);
          }}
          style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
          placeholder="Tag name..."
          autoFocus
        />
        <button
          className="touch-target btn-hover-scale"
          style={{ ...styles.smallBtn, background: "rgba(34,197,94,0.2)", color: "#22c55e" }}
          onClick={handleSubmit}
        >
          Add
        </button>
        <button
          className="touch-target btn-hover-scale"
          style={{ ...styles.smallBtn, background: "rgba(107,114,128,0.2)", color: "#9ca3af" }}
          onClick={() => setShowInput(false)}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  if (loadingNpcs) {
    return <WikiPanelSkeleton />;
  }

  return (
    <div style={{ ...styles.container, ...(isPopout ? styles.popoutContainer : {}) }}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.layout}>
        {/* Left: NPC selector (always visible) */}
        <div style={styles.sidebar}>{renderNpcSelector()}</div>

        {/* Right: Content area */}
        <div style={styles.content}>
          {activeMode === "builder" && isDm ? renderBuilderView() : renderPlayerView()}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: "0.75rem",
    padding: "0.75rem",
    overflow: "hidden",
  },
  popoutContainer: {
    padding: "0.5rem",
  },
  layout: {
    display: "flex",
    gap: "0.75rem",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  sidebar: {
    width: "260px",
    minWidth: "200px",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    overflow: "hidden",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    paddingRight: "0.75rem",
  },
  content: {
    flex: 1,
    minWidth: 0,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  selectorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    color: "var(--color-text, #e5e7eb)",
  },
  modeToggle: {
    display: "flex",
    gap: "0.25rem",
  },
  modeBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-text, #e5e7eb)",
    cursor: "pointer",
    minHeight: "32px",
    transition: "all 0.15s",
  },
  modeBtnActive: {
    background: "rgba(200,151,58,0.15)",
    borderColor: "rgba(200,151,58,0.4)",
    color: "var(--color-accent, #c8973a)",
  },
  searchWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchInput: {
    width: "100%",
    padding: "8px 32px 8px 12px",
    fontSize: 13,
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-text, #e5e7eb)",
    outline: "none",
    boxSizing: "border-box",
  },
  clearBtn: {
    position: "absolute",
    right: 6,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    minHeight: 28,
  },
  npcList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    overflow: "auto",
    flex: 1,
    minHeight: 0,
  },
  npcItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "8px 10px",
    borderRadius: "10px",
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--color-text, #e5e7eb)",
    textAlign: "left",
    cursor: "pointer",
    minHeight: "44px",
    transition: "all 0.15s",
    width: "100%",
  },
  npcItemSelected: {
    borderColor: "rgba(200,151,58,0.3)",
    background: "rgba(200,151,58,0.08)",
  },
  npcItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  npcItemName: {
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  npcItemRace: {
    fontSize: 11,
    opacity: 0.5,
  },
  treeBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
    padding: "2px 8px",
    borderRadius: "9999px",
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  // Builder layout
  builderLayout: {
    display: "flex",
    gap: "0.75rem",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  treePanel: {
    width: "40%",
    minWidth: 240,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    overflow: "hidden",
  },
  treePanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
  },
  panelTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    color: "var(--color-text, #e5e7eb)",
  },
  treePanelActions: {
    display: "flex",
    gap: "0.25rem",
  },
  smallBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.06)",
    color: "var(--color-text, #e5e7eb)",
    cursor: "pointer",
    minHeight: "32px",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },
  saveBtn: {
    background: "rgba(34,197,94,0.15)",
    color: "#22c55e",
    borderColor: "rgba(34,197,94,0.3)",
  },
  rootBtn: {
    background: "rgba(200,151,58,0.15)",
    color: "#c8973a",
    borderColor: "rgba(200,151,58,0.3)",
  },
  dangerBtn: {
    background: "rgba(239,68,68,0.15)",
    color: "#ef4444",
    borderColor: "rgba(239,68,68,0.3)",
  },
  warningsBox: {
    padding: "8px 10px",
    borderRadius: "8px",
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.2)",
    fontSize: 12,
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  warningItem: {
    color: "#fbbf24",
  },
  newNodeForm: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "8px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
  },
  newNodeInput: {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-text, #e5e7eb)",
    outline: "none",
    boxSizing: "border-box",
  },
  newNodeActions: {
    display: "flex",
    gap: "0.3rem",
  },
  confirmBtn: {
    padding: "4px 14px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: "8px",
    background: "rgba(34,197,94,0.15)",
    color: "#22c55e",
    cursor: "pointer",
    minHeight: "32px",
  },
  cancelBtn: {
    padding: "4px 14px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(107,114,128,0.3)",
    borderRadius: "8px",
    background: "rgba(107,114,128,0.1)",
    color: "#9ca3af",
    cursor: "pointer",
    minHeight: "32px",
  },

  // Node cards
  nodeList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    overflow: "auto",
    flex: 1,
    minHeight: 0,
  },
  nodeCard: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    padding: "8px 10px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.06)",
    borderLeft: "3px solid",
    background: "rgba(255,255,255,0.02)",
    color: "var(--color-text, #e5e7eb)",
    textAlign: "left",
    cursor: "pointer",
    minHeight: "44px",
    width: "100%",
    transition: "all 0.15s",
  },
  nodeCardSelected: {
    background: "rgba(200,151,58,0.08)",
    borderColor: "rgba(200,151,58,0.2)",
  },
  nodeCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  nodeCardId: {
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "monospace",
  },
  nodeCardLabel: {
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: "9999px",
  },
  nodeCardPreview: {
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  nodeCardMeta: {
    display: "flex",
    gap: "0.4rem",
    fontSize: 10,
    opacity: 0.4,
  },
  tagBadge: {
    background: "rgba(200,151,58,0.15)",
    color: "#c8973a",
    padding: "0 4px",
    borderRadius: "4px",
  },

  // Editor panel
  editorPanel: {
    flex: 1,
    minWidth: 0,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  },
  editorContent: {
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  editorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexShrink: 0,
  },
  editorActions: {
    display: "flex",
    gap: "0.25rem",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    opacity: 0.8,
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: 600,
    opacity: 0.6,
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-text, #e5e7eb)",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: 1.4,
    boxSizing: "border-box",
  },
  input: {
    width: "100%",
    padding: "6px 10px",
    fontSize: 13,
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-text, #e5e7eb)",
    outline: "none",
    boxSizing: "border-box",
  },
  hintText: {
    fontSize: 12,
    opacity: 0.4,
    fontStyle: "italic",
    padding: "4px 0",
  },
  addRowBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.2rem",
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: "6px",
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    cursor: "pointer",
    minHeight: 24,
    transition: "all 0.15s",
  },
  removeRowBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    border: "none",
    borderRadius: "4px",
    background: "rgba(239,68,68,0.15)",
    color: "#ef4444",
    cursor: "pointer",
    minWidth: 24,
    minHeight: 24,
    flexShrink: 0,
  },

  // Tags
  tagsDisplay: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.25rem",
  },
  tagChip: {
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
    padding: "2px 6px",
    borderRadius: "6px",
    background: "rgba(200,151,58,0.12)",
    color: "#c8973a",
    fontSize: 11,
    fontWeight: 600,
  },
  tagRemove: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: "none",
    background: "none",
    color: "#c8973a",
    cursor: "pointer",
    minWidth: 16,
    minHeight: 16,
  },
  addTagBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.2rem",
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 600,
    border: "1px dashed rgba(200,151,58,0.3)",
    borderRadius: "6px",
    background: "transparent",
    color: "#c8973a",
    cursor: "pointer",
    minHeight: 28,
    transition: "all 0.15s",
  },

  // Effects
  effectRow: {
    display: "flex",
    gap: "0.3rem",
    alignItems: "center",
  },
  effectInput: {
    flex: 1,
    padding: "4px 8px",
    fontSize: 12,
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--color-text, #e5e7eb)",
    outline: "none",
    fontFamily: "monospace",
  },

  // Choices
  choiceCard: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
    marginBottom: "0.4rem",
  },
  choiceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  choiceIndex: {
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.5,
    fontFamily: "monospace",
  },
  skillCheckWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: 12,
    cursor: "pointer",
  },
  skillCheckFields: {
    display: "flex",
    gap: "0.5rem",
    padding: "6px 8px",
    borderRadius: "8px",
    background: "rgba(59,130,246,0.08)",
    border: "1px solid rgba(59,130,246,0.15)",
  },

  // Empty / loading states
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding: "2rem 1rem",
    textAlign: "center",
    color: "var(--color-text, #e5e7eb)",
    opacity: 0.6,
    flex: 1,
  },
  loadingText: {
    fontSize: 13,
    opacity: 0.5,
    padding: "1rem",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 12,
    opacity: 0.4,
    padding: "1rem",
    textAlign: "center",
    fontStyle: "italic",
  },
  errorBanner: {
    background: "rgba(239,68,68,0.15)",
    color: "#fca5a5",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: 13,
    border: "1px solid rgba(239,68,68,0.2)",
  },

  // Player mode
  playerLayout: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    flex: 1,
    minHeight: 0,
  },
  playerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexShrink: 0,
    paddingBottom: "0.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  playerNpcInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
  },
  playerActions: {
    display: "flex",
    gap: "0.4rem",
  },
  playerBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    border: "1px solid",
    borderRadius: "10px",
    cursor: "pointer",
    minHeight: "44px",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  dialogueView: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    flex: 1,
    overflow: "hidden",
  },
  dialogueMessages: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    overflow: "auto",
    flex: 1,
    minHeight: 0,
    padding: "0.25rem 0",
  },
  dialogueBubble: {
    padding: "10px 14px",
    borderRadius: "14px",
    maxWidth: "85%",
    wordBreak: "break-word",
    lineHeight: 1.4,
    fontSize: 14,
  },
  dialogueBubbleNpc: {
    alignSelf: "flex-start",
    background: "rgba(200,151,58,0.1)",
    border: "1px solid rgba(200,151,58,0.15)",
    borderBottomLeftRadius: "4px",
    color: "var(--color-text, #e5e7eb)",
  },
  dialogueBubbleChoice: {
    alignSelf: "flex-end",
    background: "rgba(59,130,246,0.1)",
    border: "1px solid rgba(59,130,246,0.15)",
    borderBottomRightRadius: "4px",
    color: "#93c5fd",
  },
  dialogueBubbleSystem: {
    alignSelf: "center",
    background: "rgba(107,114,128,0.1)",
    border: "1px solid rgba(107,114,128,0.1)",
    fontSize: 12,
    fontStyle: "italic",
    color: "#9ca3af",
    maxWidth: "70%",
    textAlign: "center",
  },
  dialogueSpeaker: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-accent, #c8973a)",
    marginBottom: 4,
  },
  dialogueText: {
    whiteSpace: "pre-wrap",
  },
  choicesArea: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "0.75rem 0 0",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  choicesLabel: {
    fontSize: 12,
    fontWeight: 600,
    opacity: 0.5,
    marginBottom: "0.2rem",
  },
  choiceBtn: {
    display: "flex",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: "12px",
    border: "1px solid rgba(59,130,246,0.2)",
    background: "rgba(59,130,246,0.06)",
    color: "var(--color-text, #e5e7eb)",
    textAlign: "left",
    cursor: "pointer",
    minHeight: "44px",
    fontSize: 14,
    transition: "all 0.15s",
    width: "100%",
  },
  choiceBtnSelected: {
    background: "rgba(59,130,246,0.15)",
    borderColor: "rgba(59,130,246,0.4)",
  },
  choiceBtnSkill: {
    borderLeft: "3px solid #3b82f6",
  },
  choiceBtnContent: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    width: "100%",
  },
  skillBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "#60a5fa",
    background: "rgba(59,130,246,0.1)",
    padding: "1px 8px",
    borderRadius: "9999px",
    alignSelf: "flex-start",
  },
  autoAdvanceArea: {
    display: "flex",
    justifyContent: "center",
    padding: "0.75rem 0",
    flexShrink: 0,
  },
  continueBtn: {
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    border: "1px solid rgba(200,151,58,0.3)",
    borderRadius: "12px",
    background: "rgba(200,151,58,0.1)",
    color: "var(--color-accent, #c8973a)",
    cursor: "pointer",
    minHeight: "44px",
    transition: "all 0.15s",
  },
  dialogueStartPrompt: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding: "2rem 1rem",
    textAlign: "center",
    color: "var(--color-text, #e5e7eb)",
    opacity: 0.5,
    flex: 1,
  },
};
