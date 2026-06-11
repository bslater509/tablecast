// =============================================================================
// Tablecast — Campaign Wiki / Player Journal Panel (Phase 4)
// Allows players and DMs to view unlocked campaign logs, location info, and NPCs.
// Categorizes entries into Locations, NPCs, Lore, and Session Logs.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Menu } from "lucide-react";
import { marked } from "marked";
import AiAssistButton, { AI_FIELD_ACTIONS } from "./AiAssistButton";
import TokenPresetIcon from "./TokenPresetIcon";
import { NPC_TOKEN_PRESETS, matchNpcPreset, generateTokenSvgUrl } from "../data/npcTokenPresets";
import WikiTreeSidebar from "./WikiTreeSidebar";
import NpcStatblock from "./wiki/NpcStatblock";
import styles from "./wiki/wikiStyles";
import { calculateModifier, buildImagePrompt, compileMarkdown, parse5eToolsAlignment } from "./wiki/wikiUtils";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { WikiPanelSkeleton } from "./PanelSkeleton";
import { getAuthHeaders, getJsonAuthHeaders } from "../utils/authHeaders";
import NpcGenModal from "./wiki/NpcGenModal";
import MonsterGenModal from "./wiki/MonsterGenModal";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const SELECTED_ARTICLE_STORAGE_KEY = "tablecast.selectedArticleId";
const CATEGORY_TAB_STORAGE_KEY = "tablecast.wikiCategoryTab";

// NpcStatblock has been moved to ./wiki/NpcStatblock.jsx

export default function WikiPanel({ user, isPopout = false }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const npcTimerRef = useRef(null);
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
  const [activeCategoryTab, setActiveCategoryTab] = useState(() => {
    return localStorage.getItem(CATEGORY_TAB_STORAGE_KEY) || "LOCATION";
  }); // "LOCATION" | "NPC" | "LORE" | "LOG" | "MONSTER" | "SPELL" | "ITEM" | "RULE" | "CLASS" | "RACE"

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

  // AI Generator Modals state
  const [showNpcGenModal, setShowNpcGenModal] = useState(false);
  const [showMonsterGenModal, setShowMonsterGenModal] = useState(false);
  const [npcCopiedPrompt, setNpcCopiedPrompt] = useState(false); // "Copied!" feedback for image prompt copy

  // Sidebar drawer state (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Reader header overflow menu (mobile)
  const [showReaderMenu, setShowReaderMenu] = useState(false);

  // Determine if user has DM privileges
  const isDM = user?.role === "DM";

  const authHeaders = getAuthHeaders(user);
  const jsonAuthHeaders = getJsonAuthHeaders(user);

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
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (npcTimerRef.current) clearTimeout(npcTimerRef.current);
    };
  }, []);

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
      npcTimerRef.current = setTimeout(() => setNpcCopiedPrompt(false), 2000);
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
      npcTimerRef.current = setTimeout(() => setNpcCopiedPrompt(false), 2000);
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

        // Restore previously selected article
        const storedArticleId = localStorage.getItem(SELECTED_ARTICLE_STORAGE_KEY);
        if (storedArticleId) {
          const match = wikiData.find(a => a.id === Number(storedArticleId));
          if (match) setSelectedArticle(match);
        } else {
          localStorage.removeItem(SELECTED_ARTICLE_STORAGE_KEY);
        }

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

  // Persist selected category tab
  useEffect(() => {
    localStorage.setItem(CATEGORY_TAB_STORAGE_KEY, activeCategoryTab);
  }, [activeCategoryTab]);

  // Persist selected article
  useEffect(() => {
    if (selectedArticle) {
      localStorage.setItem(SELECTED_ARTICLE_STORAGE_KEY, String(selectedArticle.id));
    } else {
      localStorage.removeItem(SELECTED_ARTICLE_STORAGE_KEY);
    }
  }, [selectedArticle]);

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
    } else if (["NPC", "LOCATION", "LORE", "LOG"].includes(activeCategoryTab)) {
      setShowCategoryPrompt(true);
    } else {
      // Fallback for other categories: go to category prompt
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
      addToast(`Import error: ${err.message}`, "error");
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
        <div style={styles.readerHeader} className="wiki-reader-header">
          <button
            id="wiki-back-btn"
            onClick={handleBack}
            style={styles.backBtn}
            className="touch-target btn-hover-scale"
          >
            Back
          </button>
          <div style={styles.headerRight} className="wiki-reader-header-right">
            {isDM && (
              <div style={{ ...styles.dmControlsRow, position: "relative" }}>
                <button
                  onClick={() => handleStartEdit(selectedArticle)}
                  style={styles.editBtn}
                  className="touch-target btn-hover-scale"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowReaderMenu((v) => !v)}
                  style={styles.readerMenuBtn}
                  className="touch-target btn-hover-scale"
                  aria-label="More actions"
                  title="More actions"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
                {showReaderMenu && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 99 }}
                      onClick={() => setShowReaderMenu(false)}
                    />
                    <div className="wiki-reader-menu-dropdown">
                      <button
                        onClick={() => { triggerDelete(selectedArticle); setShowReaderMenu(false); }}
                        className="danger"
                      >
                        🗑️ Delete
                      </button>
                      <span style={{ fontSize: "0.65rem", color: "var(--color-muted)", padding: "0.25rem 0.75rem" }}>
                        Updated: {new Date(selectedArticle.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                )}
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
            <span style={styles.timeBadge} className="wiki-updated-badge">
              {new Date(selectedArticle.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Reader Body */}
        <div style={styles.readerScroll} className="wiki-reader-scroll">
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
              className="glass-panel btn-hover-scale wiki-article-card"
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
                className="glass-panel btn-hover-scale wiki-article-card"
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
              <div style={styles.editorHeaderActions} className="wiki-editor-header-actions">
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
                          <div style={styles.actionFieldsGrid} className="wiki-actions-fields-grid">
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
              <div style={styles.editorHeaderActions} className="wiki-editor-header-actions">
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
      ) : !isPopout ? (
        /*  SPLIT-PANE LAYOUT (DM + Player)  */
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
            onCreateNew={isDM ? (tab) => handleSelectCategoryToCreate(tab) : undefined}
          />
          <div style={styles.splitContent}>
            {selectedArticle ? renderReaderContent() : (
              <div style={styles.listView}>
                <div style={styles.wikiTopBar} className="wiki-top-bar">
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
          <div style={styles.sectionTabsContainer} className="glass-panel wiki-category-tabs">
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

          <div style={styles.searchBarContainer} className="wiki-search-bar-container">
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

      {/* AI NPC GENERATOR MODAL — extracted to wiki/NpcGenModal.jsx */}
      <NpcGenModal
        show={showNpcGenModal}
        onClose={() => setShowNpcGenModal(false)}
        jsonAuthHeaders={jsonAuthHeaders}
        onNpcCreated={(npcData) => {
          setEditingNpc((prev) => ({ ...prev, ...npcData }));
        }}
      />

      {/* AI MONSTER GENERATOR MODAL — extracted to wiki/MonsterGenModal.jsx */}
      <MonsterGenModal
        show={showMonsterGenModal}
        onClose={() => setShowMonsterGenModal(false)}
        jsonAuthHeaders={jsonAuthHeaders}
        onMonsterCreated={(monsterData) => {
          setEditingNpc(monsterData);
          setActiveCategoryTab("MONSTER");
          setIsEditing(true);
        }}
      />

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

// styles have been moved to ./wiki/wikiStyles.js

// statblockStyles has been moved to ./wiki/NpcStatblock.jsx
