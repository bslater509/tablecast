// =============================================================================
// useMapData — State management, data fetching, socket listeners, action handlers
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { MIN_ZOOM, MAX_ZOOM, MAP_IMPORT_PRESETS, parseFogState, cleanText } from "./MapConstants";
import { NPC_TOKEN_PRESETS, generateTokenSvgUrl } from "../../data/npcTokenPresets";
import { getAuthHeaders } from "../../utils/authHeaders";

export default function useMapData({ user, isPopout, socket, isConnected, addToast, showConfirm }) {
  // ---------------------------------------------------------------------------
  // Map & token state
  // ---------------------------------------------------------------------------
  const [mapsList, setMapsList] = useState([]);
  const [activeMap, setActiveMap] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [availableCharacters, setAvailableCharacters] = useState([]);
  const [availableNpcs, setAvailableNpcs] = useState([]);
  const [tokenType, setTokenType] = useState("character");
  const [newTokenNpcId, setNewTokenNpcId] = useState("");
  const [newTokenMonsterId, setNewTokenMonsterId] = useState("");
  const [availableMonsters, setAvailableMonsters] = useState([]);
  const [activeEncounter, setActiveEncounter] = useState(null);
  const [showEncounterDrawer, setShowEncounterDrawer] = useState(false);
  const [encounterName, setEncounterName] = useState("");
  const [encounterMonsterQuery, setEncounterMonsterQuery] = useState("");
  const [encounterMonster, setEncounterMonster] = useState(null);
  const [encounterQuantity, setEncounterQuantity] = useState(1);
  const [encounterHidden, setEncounterHidden] = useState(false);
  const [encounterNpcId, setEncounterNpcId] = useState("");
  const [encounterCharacterId, setEncounterCharacterId] = useState("");
  const [encounterDeployX, setEncounterDeployX] = useState(0);
  const [encounterDeployY, setEncounterDeployY] = useState(0);
  const [encounterBusy, setEncounterBusy] = useState(false);

  // AI Encounter Builder
  const [showEncounterBuilder, setShowEncounterBuilder] = useState(false);
  const [encounterBuilderLevels, setEncounterBuilderLevels] = useState("");
  const [encounterBuilderDifficulty, setEncounterBuilderDifficulty] = useState("medium");
  const [encounterBuilderContext, setEncounterBuilderContext] = useState("");
  const [encounterBuilderLoading, setEncounterBuilderLoading] = useState(false);
  const [encounterBuilderError, setEncounterBuilderError] = useState(null);
  const [encounterBuilderResult, setEncounterBuilderResult] = useState(null);
  const [encounterBuilderProgress, setEncounterBuilderProgress] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [isCreatingMap, setIsCreatingMap] = useState(false);

  // Toolbar & View
  const [tool, setTool] = useState("select");
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [selectedTokenId, setSelectedTokenId] = useState(null);

  // Fog of War
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [mousePosWorld, setMousePosWorld] = useState(null);

  // Ruler Tool
  const [rulerPoints, setRulerPoints] = useState([]);
  const [rulerHoverPos, setRulerHoverPos] = useState(null);

  // Dynamic Lighting
  const [showLighting, setShowLighting] = useState(false);

  // Interaction
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState(null);

  // Modals
  const [showAddMapModal, setShowAddMapModal] = useState(false);
  const [showAddTokenModal, setShowAddTokenModal] = useState(false);

  // Form states
  const [newMapName, setNewMapName] = useState("");
  const [newMapGridSize, setNewMapGridSize] = useState(50);
  const [newMapFile, setNewMapFile] = useState(null);
  const [newMapImagePath, setNewMapImagePath] = useState("");
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [newTokenCharacterId, setNewTokenCharacterId] = useState("");
  const [newTokenImageUrl, setNewTokenImageUrl] = useState("");
  const [newTokenIsMonster, setNewTokenIsMonster] = useState(false);
  const [newTokenStats, setNewTokenStats] = useState(null);

  // Refs
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [mapImageLoaded, setMapImageLoaded] = useState(false);
  const tokenImagesRef = useRef({});
  const gestureRef = useRef(null);
  const activeMapRef = useRef(activeMap);
  activeMapRef.current = activeMap;
  const selectedTokenIdRef = useRef(selectedTokenId);
  const currentFetchIdRef = useRef(0);
  const drawRafIdRef = useRef(null);
  const pendingMovesRef = useRef([]);
  const triggerRedrawRef = useRef(() => {});

  useEffect(() => { selectedTokenIdRef.current = selectedTokenId; }, [selectedTokenId]);

  // Derived values
  const gridSize = activeMap?.gridSize || 50;
  const authHeaders = getAuthHeaders(user);
  const jsonAuthHeaders = { "Content-Type": "application/json", ...authHeaders };
  const withUser = (payload = {}) => ({ ...payload, userId: user?.id });
  const isDM = user?.role === "DM";

  // ---------------------------------------------------------------------------
  // Staleness check
  // ---------------------------------------------------------------------------
  function isStale(fetchId) {
    return fetchId !== currentFetchIdRef.current;
  }

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  async function loadMaps(autoSelectId = null, fetchId) {
    try {
      setLoadError(null);
      const res = await fetch("/api/maps", { headers: authHeaders });
      if (fetchId !== undefined && isStale(fetchId)) return;
      if (res.ok) {
        const data = await res.json();
        if (fetchId !== undefined && isStale(fetchId)) return;
        setMapsList(data);
        if (data.length > 0) {
          const mapToSelect = autoSelectId ? data.find(m => m.id === autoSelectId) : data[0];
          if (mapToSelect) fetchMapDetails(mapToSelect.id);
        }
      }
    } catch (err) {
      if (fetchId === undefined || !isStale(fetchId)) {
        console.error("Failed to load maps list:", err);
        setLoadError("Failed to load maps. Check server connection.");
      }
    }
  }

  async function loadCharacters(fetchId) {
    try {
      setLoadError(null);
      const res = await fetch("/api/characters", { headers: authHeaders });
      if (fetchId !== undefined && isStale(fetchId)) return;
      if (res.ok) {
        const data = await res.json();
        if (fetchId !== undefined && isStale(fetchId)) return;
        setAvailableCharacters(data);
      }
    } catch (err) {
      if (fetchId === undefined || !isStale(fetchId)) {
        console.error("Failed to load characters list:", err);
        setLoadError("Failed to load characters. Check server connection.");
      }
    }
  }

  async function loadNpcs(fetchId) {
    try {
      setLoadError(null);
      const res = await fetch("/api/npcs");
      if (fetchId !== undefined && isStale(fetchId)) return;
      if (res.ok) {
        const data = await res.json();
        if (fetchId !== undefined && isStale(fetchId)) return;
        setAvailableNpcs(data);
      }
    } catch (err) {
      if (fetchId === undefined || !isStale(fetchId)) {
        console.error("Failed to load NPCs list:", err);
      }
    }
  }

  async function loadMonsters(fetchId) {
    try {
      setLoadError(null);
      const res = await fetch("/api/monsters");
      if (fetchId !== undefined && isStale(fetchId)) return;
      if (res.ok) {
        const data = await res.json();
        if (fetchId !== undefined && isStale(fetchId)) return;
        setAvailableMonsters(data);
      }
    } catch (err) {
      if (fetchId === undefined || !isStale(fetchId)) {
        console.error("Failed to load monsters list:", err);
      }
    }
  }

  async function fetchMapDetails(mapId) {
    try {
      const res = await fetch(`/api/maps/${mapId}`, { headers: authHeaders });
      if (res.ok) {
        const map = await res.json();
        setActiveMap(map);
        imageRef.current = null;
        setMapImageLoaded(false);
        setTokens(map.tokens || []);
        tokenImagesRef.current = {};

        // Preload map image
        if (map.imageUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            imageRef.current = img;
            setMapImageLoaded(true);
            resetViewport(img.width, img.height);
          };
          img.onerror = () => {
            // Fallback: create canvas placeholder
            const fallback = document.createElement("canvas");
            fallback.width = 2000;
            fallback.height = 2000;
            imageRef.current = fallback;
            setMapImageLoaded(true);
            resetViewport(2000, 2000);
          };
          // Handle cached images — if already complete, trigger directly
          img.src = map.imageUrl;
          if (img.complete && img.naturalWidth > 0) {
            imageRef.current = img;
            setMapImageLoaded(true);
            resetViewport(img.width, img.height);
          }
        }

        // Load encounter for this map
        loadActiveEncounter(map.id);
      }
    } catch (err) {
      console.error("Failed to load map details:", err);
    }
  }

  function resetViewport(imgW, imgH) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fitZoom = Math.min(rect.width / imgW, rect.height / imgH) * 0.9;
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(fitZoom, MAX_ZOOM));
    setZoom(clampedZoom);
    setPanOffset({
      x: (rect.width - imgW * clampedZoom) / 2,
      y: (rect.height - imgH * clampedZoom) / 2,
    });
  }

  async function loadActiveEncounter(mapId) {
    try {
      const res = await fetch(`/api/encounters/active?mapId=${mapId}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setActiveEncounter(data || null);
      }
    } catch (err) {
      console.error("Failed to load active encounter:", err);
    }
  }

  async function persistEncounterResult(res, options = {}) {
    if (res.ok) {
      const data = await res.json();
      if (options.turnChanged && data.encounter) {
        setActiveEncounter(data.encounter);
      } else if (data && data.id) {
        setActiveEncounter(data);
      } else {
        if (activeMap) loadActiveEncounter(activeMap.id);
      }
    } else {
      const errData = await res.json().catch(() => ({ error: "Request failed." }));
      addToast(errData.error || "Request failed.", "error");
    }
  }

  // ---------------------------------------------------------------------------
  // Initial data load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const id = ++currentFetchIdRef.current;
    loadMaps(null, id);
    loadCharacters(id);
    loadNpcs(id);
    loadMonsters(id);

    return () => {
      currentFetchIdRef.current = currentFetchIdRef.current + 1;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Socket listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const handleMapSelected = (payload) => { fetchMapDetails(payload.mapId); };
    const handleTokenMoved = (updatedToken) => {
      setTokens(prev => prev.map(t => t.id === updatedToken.id ? updatedToken : t));
    };
    const handleTokenCreated = (newToken) => {
      setTokens(prev => [...prev.filter(t => t.id !== newToken.id), newToken]);
    };
    const handleTokenDeleted = (payload) => {
      setTokens(prev => prev.filter(t => t.id !== payload.id));
      delete tokenImagesRef.current[payload.id];
      if (selectedTokenIdRef.current === payload.id) setSelectedTokenId(null);
    };
    const handleFogUpdated = (payload) => {
      const currentMap = activeMapRef.current;
      if (currentMap && currentMap.id === payload.mapId) {
        setActiveMap(prev => ({ ...prev, fogState: payload.fogState }));
      }
    };
    const handleMapDeleted = (payload) => {
      const deletedId = Number(payload.mapId);
      setMapsList(prev => prev.filter(m => m.id !== deletedId));
      const currentMap = activeMapRef.current;
      if (currentMap && currentMap.id === deletedId) {
        setActiveMap(null);
        setTokens([]);
        tokenImagesRef.current = {};
        imageRef.current = null;
        setMapImageLoaded(false);
      }
    };
    const handleEncounterRefresh = (payload) => {
      const currentMap = activeMapRef.current;
      if (!currentMap || Number(payload.mapId) === Number(currentMap.id)) {
        loadActiveEncounter(payload.mapId || currentMap?.id);
      }
    };

    socket.on("map:selected", handleMapSelected);
    socket.on("token:moved", handleTokenMoved);
    socket.on("token:created", handleTokenCreated);
    socket.on("token:deleted", handleTokenDeleted);
    socket.on("fog:updated", handleFogUpdated);
    socket.on("map:deleted", handleMapDeleted);
    socket.on("encounter:updated", handleEncounterRefresh);
    socket.on("encounter:turnChanged", handleEncounterRefresh);

    return () => {
      socket.off("map:selected", handleMapSelected);
      socket.off("token:moved", handleTokenMoved);
      socket.off("token:created", handleTokenCreated);
      socket.off("token:deleted", handleTokenDeleted);
      socket.off("fog:updated", handleFogUpdated);
      socket.off("map:deleted", handleMapDeleted);
      socket.off("encounter:updated", handleEncounterRefresh);
      socket.off("encounter:turnChanged", handleEncounterRefresh);
    };
  }, [socket]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  // -- Map actions --
  const handleSelectMap = (mapId) => {
    if (isDM && socket && isConnected) {
      socket.emit("map:select", withUser({ mapId }));
    }
    tokenImagesRef.current = {};
    fetchMapDetails(mapId);
  };

  const handleMapPresetSelect = (presetLabel) => {
    const preset = MAP_IMPORT_PRESETS.find((item) => item.label === presetLabel);
    if (!preset) return;
    setNewMapImagePath(preset.path);
    setNewMapGridSize(preset.gridSize);
    setNewMapFile(null);
    if (!newMapName.trim()) setNewMapName(preset.name);
  };

  const handleCancelAddMap = () => {
    setShowAddMapModal(false);
    setNewMapName("");
    setNewMapGridSize(50);
    setNewMapFile(null);
    setNewMapImagePath("");
    setLoadError(null);
  };

  const handleCreateMap = async (e) => {
    e.preventDefault();
    if (!newMapName.trim() || isCreatingMap) return;
    setIsCreatingMap(true);
    setLoadError(null);

    const submitMap = async (imageData = null) => {
      try {
        const res = await fetch("/api/maps", {
          method: "POST",
          headers: jsonAuthHeaders,
          body: JSON.stringify({
            name: newMapName,
            gridSize: newMapGridSize,
            gridType: "SQUARE",
            imageData,
            imageUrl: imageData ? undefined : newMapImagePath.trim(),
          }),
        });

        if (res.ok) {
          const map = await res.json();
          setShowAddMapModal(false);
          setNewMapName("");
          setNewMapFile(null);
          setNewMapImagePath("");
          setLoadError(null);
          await loadMaps(map.id);
          if (isDM && socket && isConnected) {
            socket.emit("map:select", withUser({ mapId: map.id }));
          }
        } else {
          const errData = await res.json().catch(() => ({ error: "Failed to create map." }));
          setLoadError(errData.error || "Failed to create map.");
        }
      } catch (err) {
        setLoadError("Failed to create map. Check server connection.");
      } finally {
        setIsCreatingMap(false);
      }
    };

    if (newMapFile) {
      const reader = new FileReader();
      reader.readAsDataURL(newMapFile);
      reader.onload = () => submitMap(reader.result);
      reader.onerror = () => { setLoadError("Failed to read the selected image file."); setIsCreatingMap(false); };
    } else {
      await submitMap();
    }
  };

  const handleDeleteMap = async () => {
    if (!activeMap) return;
    if (!(await showConfirm(`Delete Map "${activeMap.name}"?`, `Are you sure you want to delete the map "${activeMap.name}"? This will also delete all tokens on this map.`))) return;

    try {
      const res = await fetch(`/api/maps/${activeMap.id}`, { method: "DELETE", headers: authHeaders });
      if (res.ok) {
        const deletedId = activeMap.id;
        if (socket && isConnected) socket.emit("map:delete", withUser({ mapId: deletedId }));
        const updatedList = mapsList.filter(m => m.id !== deletedId);
        setMapsList(updatedList);
        if (updatedList.length > 0) {
          handleSelectMap(updatedList[0].id);
        } else {
          setActiveMap(null);
          setTokens([]);
          imageRef.current = null;
          setMapImageLoaded(false);
        }
      } else {
        const errData = await res.json();
        addToast(`Failed to delete map: ${errData.error || "Unknown error"}`, "error");
      }
    } catch (err) {
      addToast("Failed to delete map due to a network error.", "error");
    }
  };

  // -- Token actions --
  const handleTokenPresetSelect = (presetLabel) => {
    const preset = NPC_TOKEN_PRESETS.find((item) => item.label === presetLabel);
    if (!preset) return;
    const svgUrl = generateTokenSvgUrl(presetLabel, presetLabel);
    setNewTokenIsMonster(true);
    setNewTokenCharacterId("");
    setNewTokenLabel(preset.label);
    setNewTokenImageUrl(svgUrl);
    setNewTokenStats(null);
  };

  const resolveMonsterTokenImage = async (monster) => {
    if (!monster?.name) return;
    try {
      const params = new URLSearchParams({ name: monster.name });
      if (monster.source) params.set("source", monster.source);
      const res = await fetch(`/api/reference/token-image?${params.toString()}`);
      if (!res.ok) { setNewTokenImageUrl(""); return; }
      const match = await res.json();
      setNewTokenImageUrl(match.url || "");
    } catch (err) {
      setNewTokenImageUrl("");
    }
  };

  const handleQuickCharacterToken = (character) => {
    setNewTokenIsMonster(false);
    setNewTokenCharacterId(String(character.id));
    setNewTokenLabel(character.name);
    setNewTokenImageUrl(character.imageUrl || "");
    setNewTokenStats(null);
  };

  const handleCreateToken = async (e) => {
    e.preventDefault();
    if (!activeMap) return;

    let label = newTokenLabel.trim();
    let imageUrl = newTokenImageUrl.trim();
    let charId = null;
    let npcId = null;
    let monsterId = null;

    if (tokenType === "character" && newTokenCharacterId) {
      const char = availableCharacters.find(c => c.id === Number(newTokenCharacterId));
      if (char) { label = char.name; charId = char.id; }
    } else if (tokenType === "npc" && newTokenNpcId) {
      const npc = availableNpcs.find(n => n.id === Number(newTokenNpcId));
      if (npc) { label = npc.name; npcId = npc.id; imageUrl = npc.imageUrl || imageUrl; }
    } else if (tokenType === "monster" && newTokenMonsterId) {
      const monster = availableMonsters.find(m => m.id === Number(newTokenMonsterId));
      if (monster) { label = monster.name; monsterId = monster.id; imageUrl = monster.imageUrl || imageUrl; }
    }

    if (!label) {
      addToast("Please enter a token label or choose an option.", "warning");
      return;
    }

    try {
      const res = await fetch(`/api/maps/${activeMap.id}/tokens`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          characterId: charId, npcId, monsterId, label, imageUrl,
          x: 0, y: 0,
          stats: tokenType === "monster" && newTokenStats ? JSON.stringify(newTokenStats) : null,
        }),
      });

      if (res.ok) {
        const token = await res.json();
        if (socket && isConnected) {
          socket.emit("token:create", withUser(token));
        } else {
          setTokens(prev => [...prev, token]);
        }
        setShowAddTokenModal(false);
        setNewTokenLabel("");
        setNewTokenCharacterId("");
        setNewTokenNpcId("");
        setNewTokenMonsterId("");
        setNewTokenImageUrl("");
        setNewTokenStats(null);
        setTokenType("character");
      }
    } catch (err) {
      console.error("Failed to create token:", err);
    }
  };

  const handleDeleteToken = async (tokenId) => {
    if (!(await showConfirm("Delete Token?", "Are you sure you want to delete this token?"))) return;
    try {
      const res = await fetch(`/api/maps/tokens/${tokenId}`, { method: "DELETE", headers: authHeaders });
      if (res.ok) {
        if (socket && isConnected) {
          socket.emit("token:delete", withUser({ id: tokenId, broadcastOnly: true }));
        } else {
          setTokens(prev => prev.filter(t => t.id !== tokenId));
        }
        setSelectedTokenId(null);
      }
    } catch (err) {
      console.error("Failed to delete token:", err);
    }
  };

  // -- Encounter actions --
  const handleCreateEncounter = async () => {
    if (!activeMap || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch("/api/encounters", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ mapId: activeMap.id, name: encounterName.trim() || `${activeMap.name} Encounter` }),
      });
      await persistEncounterResult(res);
      setEncounterName("");
      setShowEncounterDrawer(true);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleAddMonsterToEncounter = async () => {
    if (!activeEncounter || !encounterMonster?.id || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}/participants`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ type: "monster", monsterId: encounterMonster.id, quantity: encounterQuantity, isHidden: encounterHidden }),
      });
      await persistEncounterResult(res);
      setEncounterMonster(null);
      setEncounterMonsterQuery("");
      setEncounterQuantity(1);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleAddNpcToEncounter = async () => {
    if (!activeEncounter || !encounterNpcId || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}/participants`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ type: "npc", npcId: Number(encounterNpcId), isHidden: encounterHidden }),
      });
      await persistEncounterResult(res);
      setEncounterNpcId("");
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleAddCharacterToEncounter = async () => {
    if (!activeEncounter || !encounterCharacterId || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}/participants`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ type: "character", characterId: Number(encounterCharacterId), isHidden: false }),
      });
      await persistEncounterResult(res);
      setEncounterCharacterId("");
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleDeployEncounter = async () => {
    if (!activeEncounter || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}/deploy`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ startX: encounterDeployX, startY: encounterDeployY }),
      });
      await persistEncounterResult(res);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleStartEncounter = async () => {
    if (!activeEncounter || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}/start`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ rollInitiative: true }),
      });
      await persistEncounterResult(res, { turnChanged: true });
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleAdvanceEncounterTurn = async (direction = "next") => {
    if (!activeEncounter || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}/turn`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ direction }),
      });
      await persistEncounterResult(res, { turnChanged: true });
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleCompleteEncounter = async () => {
    if (!activeEncounter || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}`, {
        method: "PATCH",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ status: "COMPLETE" }),
      });
      await persistEncounterResult(res);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleParticipantHp = async (participant, delta) => {
    if (!activeEncounter || !isDM || encounterBusy) return;
    const nextHp = Math.max(0, Math.min(participant.maxHp, participant.currentHp + delta));
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/participants/${participant.id}`, {
        method: "PATCH",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ currentHp: nextHp }),
      });
      await persistEncounterResult(res);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setEncounterBusy(false);
    }
  };

  // -- NPC / Monster roll handlers --
  const handleNpcRoll = (npcName, actionName, toHitMod, dmgExpr, description) => {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const toHitTotal = d20 + Number(toHitMod || 0);
    const fm = (val) => (val >= 0 ? `+${val}` : `${val}`);

    let damageTotal = 0;
    let dmgRolls = [];
    let dmgFormula = "";

    if (dmgExpr) {
      try {
        const cleanExpr = dmgExpr.toLowerCase().replace(/\s/g, "");
        const parts = cleanExpr.split("+");
        const dicePart = parts[0];
        const modPart = parts[1] ? parseInt(parts[1]) : 0;
        const diceMatch = dicePart.match(/^(\d+)d(\d+)$/);
        if (diceMatch) {
          const count = parseInt(diceMatch[1]);
          const sides = parseInt(diceMatch[2]);
          for (let i = 0; i < count; i++) dmgRolls.push(Math.floor(Math.random() * sides) + 1);
          const sumRolls = dmgRolls.reduce((a, b) => a + b, 0);
          damageTotal = sumRolls + modPart;
          dmgFormula = `${dicePart} + ${fm(modPart)}`;
        }
      } catch (err) {
        console.error("Failed to parse NPC damage roll:", err);
      }
    }

    if (socket && isConnected) {
      const text = dmgExpr
        ? `attacks with ${actionName}!  Hit: ${toHitTotal} | Damage: ${damageTotal}`
        : `uses ${actionName}!  ${description || ""}`;
      socket.emit("chat:send", {
        sender: npcName, text, type: "roll",
        rollDetails: {
          rollName: actionName,
          formula: dmgExpr ? `Hit: 1d20 + ${toHitMod || 0} | Dmg: ${dmgFormula}` : `Hit: 1d20 + ${toHitMod || 0}`,
          isAttack: true, toHitRoll: d20, toHitMod: Number(toHitMod || 0), toHitTotal,
          damageRolls: dmgRolls, damageDice: dmgExpr || "", damageMod: dmgExpr ? (parseInt(dmgExpr.split("+")[1]) || 0) : 0, damageTotal,
        },
      });
    }
  };

  const handleMonsterRoll = (monsterName, actionName, actionText) => {
    const hitMatch = actionText.match(/\{@hit (\d+)\}/);
    const toHitMod = hitMatch ? parseInt(hitMatch[1]) : 0;
    const dmgMatch = actionText.match(/\{@damage ([^}]+)\}/);
    const dmgExpr = dmgMatch ? dmgMatch[1].trim() : "";
    const d20 = Math.floor(Math.random() * 20) + 1;
    const toHitTotal = d20 + toHitMod;
    const fm = (val) => (val >= 0 ? `+${val}` : `${val}`);

    let damageTotal = 0;
    let dmgRolls = [];
    let dmgFormula = "";

    if (dmgExpr) {
      const parts = dmgExpr.toLowerCase().replace(/\s/g, "").split("+");
      const dicePart = parts[0];
      const modPart = parts[1] ? parseInt(parts[1]) : 0;
      const diceMatch = dicePart.match(/^(\d+)d(\d+)$/);
      if (diceMatch) {
        const count = parseInt(diceMatch[1]);
        const sides = parseInt(diceMatch[2]);
        for (let i = 0; i < count; i++) dmgRolls.push(Math.floor(Math.random() * sides) + 1);
        const sumRolls = dmgRolls.reduce((a, b) => a + b, 0);
        damageTotal = sumRolls + modPart;
        dmgFormula = `${dicePart} + ${fm(modPart)}`;
      }
    }

    if (socket && isConnected) {
      const cleanActionText = cleanText(actionText);
      const text = dmgExpr
        ? `attacks with ${actionName}!  Hit: ${toHitTotal} | Damage: ${damageTotal}`
        : `uses ${actionName}!  ${cleanActionText}`;
      socket.emit("chat:send", {
        sender: monsterName, text, type: "roll",
        rollDetails: {
          rollName: actionName,
          formula: dmgExpr ? `Hit: 1d20 + ${toHitMod} | Dmg: ${dmgFormula}` : `Hit: 1d20 + ${toHitMod}`,
          isAttack: true, toHitRoll: d20, toHitMod, toHitTotal,
          damageRolls: dmgRolls, damageDice: dmgExpr, damageMod: dmgExpr ? (parseInt(dmgExpr.split("+")[1]) || 0) : 0, damageTotal,
        },
      });
    }
  };

  // -- Ruler handlers --
  const handleRulerClick = (worldX, worldY) => {
    setRulerPoints(prev => [...prev, { x: worldX, y: worldY }]);
  };

  const handleRulerUndo = () => {
    setRulerPoints(prev => prev.length > 0 ? prev.slice(0, -1) : []);
  };

  const handleRulerClear = () => {
    setRulerPoints([]);
    setRulerHoverPos(null);
  };

  // -- Fog handlers --
  const handleUndoFog = () => {
    if (!activeMap || !isDM) return;
    const polys = parseFogState(activeMap.fogState);
    if (polys.length === 0) return;
    const updated = polys.slice(0, polys.length - 1);
    if (socket && isConnected) socket.emit("fog:update", withUser({ mapId: activeMap.id, fogState: updated }));
  };

  const handleClearFog = (revealAll) => {
    if (!activeMap || !isDM) return;
    let updated = [];
    if (revealAll) {
      const imgW = imageRef.current ? imageRef.current.width : 2000;
      const imgH = imageRef.current ? imageRef.current.height : 2000;
      updated = [{ type: "reveal", points: [{ x: 0, y: 0 }, { x: imgW, y: 0 }, { x: imgW, y: imgH }, { x: 0, y: imgH }] }];
    }
    if (socket && isConnected) socket.emit("fog:update", withUser({ mapId: activeMap.id, fogState: updated }));
  };

  const handleFinishFogPolygon = () => {
    if (!activeMap) { setCurrentPolygon([]); setIsDrawing(false); return; }
    if (currentPolygon.length > 2) {
      const newPoly = { type: tool === "draw-fog" ? "hide" : "reveal", points: currentPolygon };
      const parsedFog = parseFogState(activeMap.fogState);
      const updatedFog = [...parsedFog, newPoly];
      if (socket && isConnected) {
        socket.emit("fog:update", { userId: user?.id, mapId: activeMap.id, fogState: JSON.stringify(updatedFog) });
      }
      setCurrentPolygon([]);
      setIsDrawing(false);
    }
  };

  // -- AI Encounter Builder --
  async function handleBuildEncounter() {
    const levels = encounterBuilderLevels.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (!levels.length) { setEncounterBuilderError("Enter at least one party level (e.g., 3, 5, 7)."); return; }
    setEncounterBuilderLoading(true);
    setEncounterBuilderError(null);
    setEncounterBuilderProgress("Consulting your monster database...");

    try {
      const res = await fetch("/api/ai/build-encounter", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ partyLevels: levels, difficulty: encounterBuilderDifficulty, context: encounterBuilderContext.trim() }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to build encounter."); }
      const data = await res.json();
      if (data.encounter) { setEncounterBuilderResult(data.encounter); } else { throw new Error("No encounter data received."); }
    } catch (err) { setEncounterBuilderError(err.message); }
    finally { setEncounterBuilderLoading(false); setEncounterBuilderProgress(""); }
  }

  async function handleApplyEncounterResult() {
    if (!encounterBuilderResult || !activeMap) return;
    setEncounterBuilderLoading(true);
    try {
      const encRes = await fetch("/api/encounters", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ name: encounterBuilderResult.name || "AI Generated Encounter", mapId: activeMap.id }),
      });
      if (!encRes.ok) throw new Error("Failed to create encounter.");
      const encounter = await encRes.json();
      setActiveEncounter(encounter);

      for (const p of (encounterBuilderResult.participants || [])) {
        if (p.type === "monster") {
          try {
            const searchRes = await fetch(`/api/monsters?search=${encodeURIComponent(p.name)}`, { headers: authHeaders });
            if (searchRes.ok) {
              const monsters = await searchRes.json();
              const monster = monsters.find((m) => m.name.toLowerCase() === p.name.toLowerCase()) || monsters[0];
              if (monster) {
                for (let i = 0; i < (p.quantity || 1); i++) {
                  await fetch(`/api/encounters/${encounter.id}/participants`, {
                    method: "POST",
                    headers: jsonAuthHeaders,
                    body: JSON.stringify({ monsterId: monster.id, isHidden: false }),
                  });
                }
              }
            }
          } catch (e) { /* skip if monster not found */ }
        } else if (p.type === "npc") {
          try {
            const matchedNpc = availableNpcs.find((npc) => npc.name.toLowerCase() === String(p.name || "").toLowerCase());
            if (matchedNpc) {
              await fetch(`/api/encounters/${encounter.id}/participants`, {
                method: "POST",
                headers: jsonAuthHeaders,
                body: JSON.stringify({ npcId: matchedNpc.id, isHidden: false, type: "npc" }),
              });
            }
          } catch (e) { /* skip if NPC not found */ }
        }
      }
      setShowEncounterBuilder(false);
      setEncounterBuilderResult(null);
      loadActiveEncounter(activeMap.id);
    } catch (err) { setEncounterBuilderError(err.message); }
    finally { setEncounterBuilderLoading(false); setEncounterBuilderProgress(""); }
  }

  async function handleGenerateEncounterName() {
    if (!activeEncounter?.participants?.length) return;
    setEncounterBuilderLoading(true);
    setEncounterBuilderError(null);
    try {
      const participants = activeEncounter.participants.map((p) => ({ name: p.name || "Unknown", type: p.type || p.source || "unknown", cr: "?" }));
      const res = await fetch("/api/ai/encounter-description", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ participants }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to generate name."); }
      const data = await res.json();
      if (data.name) {
        const updateRes = await fetch(`/api/encounters/${activeEncounter.id}`, { method: "PATCH", headers: jsonAuthHeaders, body: JSON.stringify({ name: data.name }) });
        if (updateRes.ok) { const updated = await updateRes.json(); setActiveEncounter(updated); }
      }
    } catch (err) { console.error("AI Name generation failed:", err); }
    finally { setEncounterBuilderLoading(false); }
  }

  // ---------------------------------------------------------------------------
  // Return all state and handlers
  // ---------------------------------------------------------------------------
  return {
    // State
    mapsList, activeMap, tokens, availableCharacters, availableNpcs, availableMonsters,
    activeEncounter, showEncounterDrawer, encounterName, encounterMonsterQuery,
    encounterMonster, encounterQuantity, encounterHidden, encounterNpcId, encounterCharacterId,
    encounterDeployX, encounterDeployY, encounterBusy,
    showEncounterBuilder, encounterBuilderLevels, encounterBuilderDifficulty,
    encounterBuilderContext, encounterBuilderLoading, encounterBuilderError,
    encounterBuilderResult, encounterBuilderProgress, loadError, isCreatingMap,
    tool, showGrid, zoom, panOffset, selectedTokenId,
    isDrawing, currentPolygon, mousePosWorld,
    rulerPoints, rulerHoverPos,
    showLighting,
    isPanning, panStart, dragState,
    showAddMapModal, showAddTokenModal,
    newMapName, newMapGridSize, newMapFile, newMapImagePath,
    newTokenLabel, newTokenCharacterId, newTokenNpcId, newTokenMonsterId,
    newTokenImageUrl, newTokenIsMonster, newTokenStats, tokenType,
    mapImageLoaded, gridSize,

    // Refs
    containerRef, canvasRef, imageRef, tokenImagesRef, gestureRef,
    activeMapRef, selectedTokenIdRef, currentFetchIdRef, drawRafIdRef,
    pendingMovesRef, triggerRedrawRef,

    // Derived
    authHeaders, jsonAuthHeaders, withUser, isDM,

    // Setters
    setMapsList, setActiveMap, setTokens, setActiveEncounter,
    setShowEncounterDrawer, setEncounterName, setEncounterMonsterQuery,
    setEncounterMonster, setEncounterQuantity, setEncounterHidden,
    setEncounterNpcId, setEncounterCharacterId, setEncounterDeployX, setEncounterDeployY,
    setEncounterBusy,
    setShowEncounterBuilder, setEncounterBuilderLevels, setEncounterBuilderDifficulty,
    setEncounterBuilderContext, setEncounterBuilderLoading, setEncounterBuilderError,
    setEncounterBuilderResult, setEncounterBuilderProgress, setLoadError, setIsCreatingMap,
    setTool, setShowGrid, setZoom, setPanOffset, setSelectedTokenId,
    setIsDrawing, setCurrentPolygon, setMousePosWorld,
    setRulerPoints, setRulerHoverPos,
    setShowLighting,
    setIsPanning, setPanStart, setDragState,
    setShowAddMapModal, setShowAddTokenModal,
    setNewMapName, setNewMapGridSize, setNewMapFile, setNewMapImagePath,
    setNewTokenLabel, setNewTokenCharacterId, setNewTokenNpcId, setNewTokenMonsterId,
    setNewTokenImageUrl, setNewTokenIsMonster, setNewTokenStats, setTokenType,
    setMapImageLoaded,

    // Action handlers
    loadMaps, loadCharacters, loadNpcs, loadMonsters, fetchMapDetails,
    loadActiveEncounter, resetViewport, persistEncounterResult,
    handleSelectMap, handleMapPresetSelect, handleCancelAddMap, handleCreateMap, handleDeleteMap,
    handleTokenPresetSelect, resolveMonsterTokenImage, handleQuickCharacterToken,
    handleCreateToken, handleDeleteToken,
    handleCreateEncounter, handleAddMonsterToEncounter, handleAddNpcToEncounter,
    handleAddCharacterToEncounter, handleDeployEncounter, handleStartEncounter,
    handleAdvanceEncounterTurn, handleCompleteEncounter, handleParticipantHp,
    handleNpcRoll, handleMonsterRoll,
    handleRulerClick, handleRulerUndo, handleRulerClear,
    handleUndoFog, handleClearFog, handleFinishFogPolygon,
    handleBuildEncounter, handleApplyEncounterResult, handleGenerateEncounterName,
  };
}
