// =============================================================================
// Tablecast  Virtual Tabletop (VTT) Engine (Phase 5)
// Act as the VTT Engine Developer: HTML5 Canvas, touch events, and Fog of War.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  Eye,
  Grid3x3,
  Hand,
  Maximize2,
  Plus,
  Trash2,
  Undo2,
  UserPlus,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import Autocomplete from "./Autocomplete";
import TokenPresetIcon from "./TokenPresetIcon";
import { NPC_TOKEN_PRESETS, generateTokenSvgUrl } from "../data/npcTokenPresets";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const DRAG_THRESHOLD_PX = 9;

const MAP_IMPORT_PRESETS = [
  { label: "Blank 5 ft Grid", name: "Blank Encounter Grid", path: "/uploads/placeholder_map.png", gridSize: 50 },
  { label: "AitFR Adventurer Map", name: "AitFR Encounter Map", path: "https://5e.tools/img/adventure/AitFR-AVT/13_1476395018.webp", gridSize: 70 },
  { label: "AitFR Dungeon Map", name: "AitFR Dungeon Map", path: "https://5e.tools/img/adventure/AitFR-DN/16_1476395070.webp", gridSize: 70 },
];



export default function MapPanel({ user, isPopout = false }) {
  const { socket, isConnected, reconnectCount } = useSocket();
  const { addToast } = useToast();
  const { showConfirm } = useConfirm();

  // Map & token state
  const [mapsList, setMapsList] = useState([]);
  const [activeMap, setActiveMap] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [availableCharacters, setAvailableCharacters] = useState([]);
  const [availableNpcs, setAvailableNpcs] = useState([]);
  const [tokenType, setTokenType] = useState("character"); // "character", "npc", "monster"
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

  // AI Encounter Builder states
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

  // Toolbar & View state
  const [tool, setTool] = useState("select"); // "select" (pan/token move), "draw-fog", "reveal-fog"
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [selectedTokenId, setSelectedTokenId] = useState(null);

  // Drawing state (Fog of War)
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState([]); // [{x, y}, ...] in map world coordinates
  const [mousePosWorld, setMousePosWorld] = useState(null);

  // Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState(null);
  // dragState: { tokenId, startGridPos, currentWorldPos, offset }

  // Modals / Dropdowns
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

  // Refs for HTML elements & drawing loop
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [mapImageLoaded, setMapImageLoaded] = useState(false);
  const tokenImagesRef = useRef({}); // tokenId -> Image instance cache
  const gestureRef = useRef(null);
  const activeMapRef = useRef(activeMap);
  activeMapRef.current = activeMap;
  const selectedTokenIdRef = useRef(selectedTokenId);
  const currentFetchIdRef = useRef(0);
  const drawRafIdRef = useRef(null);
  const pendingMovesRef = useRef([]);
  const triggerRedrawRef = useRef(() => {});

  useEffect(() => { selectedTokenIdRef.current = selectedTokenId; }, [selectedTokenId]);

  const gridSize = activeMap?.gridSize || 50;
  const authHeaders = { "x-tablecast-user-id": String(user?.id || "") };
  const jsonAuthHeaders = { "Content-Type": "application/json", ...authHeaders };
  const withUser = (payload = {}) => ({ ...payload, userId: user?.id });
  const isDM = user?.role === "DM";

  // ---------------------------------------------------------------------------
  // Load data & initial socket listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const id = ++currentFetchIdRef.current;
    loadMaps(null, id);
    loadCharacters(id);
    loadNpcs(id);
    loadMonsters(id);

    return () => {
      // Mark any in-flight fetches as stale by incrementing the fetch ID
      currentFetchIdRef.current = currentFetchIdRef.current + 1;
    };
  }, []);

  function isStale(fetchId) {
    return fetchId !== currentFetchIdRef.current;
  }

  async function loadMaps(autoSelectId = null, fetchId) {
    try {
      setLoadError(null);
      const res = await fetch("/api/maps", { headers: authHeaders });
      if (fetchId !== undefined && isStale(fetchId)) return;
      if (res.ok) {
        const data = await res.json();
        if (fetchId !== undefined && isStale(fetchId)) return;
        setMapsList(data);
        
        // Auto-select map if requested, or select the first map as a starting point
        if (data.length > 0) {
          const mapToSelect = autoSelectId 
            ? data.find(m => m.id === autoSelectId) 
            : data[0];
          
          if (mapToSelect) {
            fetchMapDetails(mapToSelect.id);
          }
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
      const res = await fetch("/api/characters", {
        headers: { "x-tablecast-user-id": String(user?.id || "") },
      });
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
        setLoadError("Failed to load NPCs. Check server connection.");
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
        console.error("Failed to load Monsters list:", err);
        setLoadError("Failed to load monsters. Check server connection.");
      }
    }
  }

  async function fetchMapDetails(mapId) {
    const fetchId = ++currentFetchIdRef.current;
    try {
      const res = await fetch(`/api/maps/${mapId}`, { headers: authHeaders });
      if (fetchId !== currentFetchIdRef.current) return; // stale response
      if (res.ok) {
        const data = await res.json();
        if (fetchId !== currentFetchIdRef.current) return;
        setActiveMap(data);
        tokenImagesRef.current = {};
        setTokens(data.tokens || []);
        setMapImageLoaded(false);

        // Preload map background image
        const img = new Image();
        img.src = data.imageUrl;
        const loadedMapId = fetchId;
        img.onload = () => {
          if (loadedMapId !== currentFetchIdRef.current) return; // stale image load
          imageRef.current = img;
          setMapImageLoaded(true);
          resetViewport(img.width, img.height);
        };
        img.onerror = () => {
          if (loadedMapId !== currentFetchIdRef.current) return;
          imageRef.current = null;
          setMapImageLoaded(false);
        };
      }
    } catch (err) {
      if (fetchId !== currentFetchIdRef.current) return;
      console.error(`Failed to fetch map details for ID ${mapId}:`, err);
    }
  }

  async function loadActiveEncounter(mapId = activeMap?.id) {
    if (!mapId) {
      setActiveEncounter(null);
      return null;
    }

    try {
      const res = await fetch(`/api/encounters/active?mapId=${mapId}`, { headers: authHeaders });
      if (!res.ok) return null;
      const data = await res.json();
      setActiveEncounter(data);
      return data;
    } catch (err) {
      console.error("Failed to load active encounter:", err);
      return null;
    }
  }

  const notifyEncounterRefresh = (encounterId = activeEncounter?.id, turnChanged = false) => {
    if (!socket || !isConnected || !encounterId) return;
    socket.emit(turnChanged ? "encounter:turn" : "encounter:refresh", withUser({ encounterId }));
  };

  const persistEncounterResult = async (res, options = {}) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Encounter action failed.");
    }
    const encounter = await res.json();
    setActiveEncounter(encounter);
    notifyEncounterRefresh(encounter.id, options.turnChanged);
    if (activeMap?.id) {
      fetchMapDetails(activeMap.id);
    }
    return encounter;
  };

  useEffect(() => {
    if (activeMap?.id) {
      loadActiveEncounter(activeMap.id);
    } else {
      setActiveEncounter(null);
    }
  }, [activeMap?.id, user?.id]);

  // Socket reconnect resync — refetch map details and encounter, replay pending moves
  useEffect(() => {
    if (reconnectCount > 0 && activeMapRef.current?.id) {
      fetchMapDetails(activeMapRef.current.id);
      loadActiveEncounter(activeMapRef.current.id);
      // Replay any pending moves that were made while offline
      const pending = pendingMovesRef.current.slice();
      pendingMovesRef.current = [];
      if (pending.length > 0 && socket) {
        for (const move of pending) {
          socket.emit("token:move", {
            userId: user?.id,
            id: move.tokenId,
            x: move.x,
            y: move.y,
          });
        }
      }
    }
  }, [reconnectCount]);

  // Helper to reset viewport zoom/pan to fit the map background centered
  const resetViewport = (imgW, imgH) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    const scaleX = rect.width / imgW;
    const scaleY = rect.height / imgH;
    const fitScale = Math.min(scaleX, scaleY, 1.0) * 0.95; // fits nicely with margins

    setZoom(fitScale);
    setPanOffset({
      x: (rect.width - imgW * fitScale) / 2,
      y: (rect.height - imgH * fitScale) / 2
    });
  };

  // Helper to parse JSON safely for Fog array
  const parseFogState = (fogStr) => {
    try {
      return JSON.parse(fogStr || "[]");
    } catch {
      return [];
    }
  };

  // ---------------------------------------------------------------------------
  // Socket.io Real-time Event Subscriptions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    // A map selection was broadcasted (typically by DM)
    const handleMapSelected = (payload) => {
      fetchMapDetails(payload.mapId);
    };

    // A token was moved
    const handleTokenMoved = (updatedToken) => {
      setTokens(prev => prev.map(t => t.id === updatedToken.id ? updatedToken : t));
    };

    // A token was created
    const handleTokenCreated = (newToken) => {
      setTokens(prev => [...prev.filter(t => t.id !== newToken.id), newToken]);
    };

    // A token was deleted
    const handleTokenDeleted = (payload) => {
      setTokens(prev => prev.filter(t => t.id !== payload.id));
      delete tokenImagesRef.current[payload.id];
      if (selectedTokenIdRef.current === payload.id) {
        setSelectedTokenId(null);
      }
    };

    // Fog of war was updated
    const handleFogUpdated = (payload) => {
      const currentMap = activeMapRef.current;
      if (currentMap && currentMap.id === payload.mapId) {
        setActiveMap(prev => ({ ...prev, fogState: payload.fogState }));
      }
    };

    // A map was deleted
    const handleMapDeleted = (payload) => {
      const deletedId = Number(payload.mapId);
      setMapsList(prev => prev.filter(m => m.id !== deletedId));
      const currentMap = activeMapRef.current;
      if (currentMap && currentMap.id === deletedId) {
        // Need to find remaining maps - use mapsList from the closure won't work
        // Instead, fetchMapDetails will handle this via the mapsList state
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
  // HTML5 Canvas Drawing Loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Canvas drawing function
    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();
      
      // Apply pan & zoom relative to coordinate space
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoom, zoom);

      const imgW = imageRef.current ? imageRef.current.width : 1000;
      const imgH = imageRef.current ? imageRef.current.height : 800;

      // 1. Draw background image
      if (mapImageLoaded && imageRef.current) {
        ctx.drawImage(imageRef.current, 0, 0);
      } else {
        // Fallback styling texture
        ctx.fillStyle = "var(--color-surface)";
        ctx.fillRect(0, 0, imgW, imgH);
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.font = "italic 16px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText("Loading Map Background Image...", imgW / 2, imgH / 2);
      }

      // 2. Draw responsive grid
      if (showGrid) {
        ctx.strokeStyle = "rgba(200, 151, 58, 0.22)";
        ctx.lineWidth = 1;

        // Draw columns (vertical lines)
        ctx.fillStyle = "rgba(200, 151, 58, 0.5)";
        ctx.font = "bold 10px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let x = 0; x <= imgW; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, imgH);
          ctx.stroke();

          // Letters A-Z index header
          const colIndex = Math.floor(x / gridSize);
          if (x + gridSize / 2 < imgW) {
            const letter = String.fromCharCode(65 + (colIndex % 26)) + (colIndex >= 26 ? Math.floor(colIndex / 26) : "");
            ctx.fillText(letter, x + gridSize / 2, 12);
          }
        }

        // Draw rows (horizontal lines)
        ctx.textAlign = "left";
        for (let y = 0; y <= imgH; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(imgW, y);
          ctx.stroke();

          const rowIndex = Math.floor(y / gridSize);
          if (y + gridSize / 2 < imgH) {
            ctx.fillText(String(rowIndex + 1), 6, y + gridSize / 2);
          }
        }
      }

      // 3. Render Fog of War composite masks
      if (activeMap) {
        const offscreen = document.createElement("canvas");
        offscreen.width = imgW;
        offscreen.height = imgH;
        const oCtx = offscreen.getContext("2d");

        if (oCtx) {
          // Fill entirely black (full mask)
          oCtx.fillStyle = "#08080c";
          oCtx.fillRect(0, 0, imgW, imgH);

          // Process fog polygons in array order (later operations override earlier ones)
          const polygons = parseFogState(activeMap.fogState);

          polygons.forEach(p => {
            if (p.type === "reveal" && p.points && p.points.length > 0) {
              oCtx.globalCompositeOperation = "destination-out";
              oCtx.beginPath();
              oCtx.moveTo(p.points[0].x, p.points[0].y);
              for (let i = 1; i < p.points.length; i++) {
                oCtx.lineTo(p.points[i].x, p.points[i].y);
              }
              oCtx.closePath();
              oCtx.fillStyle = "black";
              oCtx.fill();
            } else if (p.type === "hide" && p.points && p.points.length > 0) {
              oCtx.globalCompositeOperation = "source-over";
              oCtx.beginPath();
              oCtx.moveTo(p.points[0].x, p.points[0].y);
              for (let i = 1; i < p.points.length; i++) {
                oCtx.lineTo(p.points[i].x, p.points[i].y);
              }
              oCtx.closePath();
              oCtx.fillStyle = "#08080c";
              oCtx.fill();
            }
          });

          // Draw composite mask on VTT
          ctx.save();
          // DM sees fog at partial opacity so they can design hidden segments
          ctx.globalAlpha = user?.role === "DM" ? 0.58 : 1.0;
          ctx.drawImage(offscreen, 0, 0);
          ctx.restore();
        }
      }

      // 4. Render Active Fog Shape currently being drawn
      if (currentPolygon && currentPolygon.length > 0) {
        ctx.strokeStyle = "var(--color-accent)";
        ctx.lineWidth = 2;
        ctx.fillStyle = "rgba(200, 151, 58, 0.2)";
        ctx.beginPath();
        ctx.moveTo(currentPolygon[0].x, currentPolygon[0].y);
        for (let i = 1; i < currentPolygon.length; i++) {
          ctx.lineTo(currentPolygon[i].x, currentPolygon[i].y);
        }
        if (mousePosWorld) {
          ctx.lineTo(mousePosWorld.x, mousePosWorld.y);
        }
        ctx.stroke();
        ctx.fill();

        // Little anchor circles
        ctx.fillStyle = "var(--color-accent)";
        currentPolygon.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // 5. Render Tokens
      tokens.forEach(token => {
        let px, py;
        if (dragState && dragState.tokenId === token.id) {
          px = dragState.currentWorldPos.x;
          py = dragState.currentWorldPos.y;
        } else {
          px = (token.x + 0.5) * gridSize;
          py = (token.y + 0.5) * gridSize;
        }

        const radius = gridSize * 0.42;

        // Selection Highlight gold pulse ring
        if (selectedTokenId === token.id) {
          ctx.strokeStyle = "var(--color-accent)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw shadow
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 4;

        // Border: gold ring for characters, red for monster/NPCs
        ctx.strokeStyle = token.characterId ? "var(--color-accent)" : "var(--color-danger)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Background backing fill
        ctx.fillStyle = "var(--color-surface)";
        ctx.beginPath();
        ctx.arc(px, py, radius - 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Image rendering with cropping
        const imgUrl = token.imageUrl || token.character?.imageUrl || token.npc?.imageUrl || token.monster?.imageUrl;
        const tokenImg = tokenImagesRef.current[token.id];

        if (tokenImg && tokenImg.complete) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, radius - 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(tokenImg, px - radius, py - radius, radius * 2, radius * 2);
          ctx.restore();
        } else {
          // Initials lettering fallback
          ctx.fillStyle = "var(--color-text)";
          ctx.font = "bold 13px Segoe UI";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = token.label || token.character?.name || token.npc?.name || "T";
          ctx.fillText(label.charAt(0).toUpperCase(), px, py);
        }

        // Token Label badge below
        ctx.font = "10px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const labelText = token.label || token.character?.name || "Token";
        const textWidth = ctx.measureText(labelText).width;

        ctx.fillStyle = "rgba(10, 8, 20, 0.88)";
        ctx.fillRect(px - textWidth / 2 - 4, py + radius + 2, textWidth + 8, 12);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px - textWidth / 2 - 4, py + radius + 2, textWidth + 8, 12);

        ctx.fillStyle = "var(--color-text)";
        ctx.fillText(labelText, px, py + radius + 3);
      });

      ctx.restore();
    };

    // Schedule draw via rAF to batch multiple state changes within a frame
    if (drawRafIdRef.current) cancelAnimationFrame(drawRafIdRef.current);
    drawRafIdRef.current = requestAnimationFrame(draw);

    triggerRedrawRef.current = () => {
      if (drawRafIdRef.current) cancelAnimationFrame(drawRafIdRef.current);
      drawRafIdRef.current = requestAnimationFrame(draw);
    };

    return () => {
      if (drawRafIdRef.current) {
        cancelAnimationFrame(drawRafIdRef.current);
        drawRafIdRef.current = null;
      }
    };
  }, [
    activeMap,
    tokens,
    zoom,
    panOffset,
    showGrid,
    dragState,
    selectedTokenId,
    currentPolygon,
    mousePosWorld,
    mapImageLoaded,
    user
  ]);

  // Preload token images outside draw loop — cache them for quick rendering
  useEffect(() => {
    let cancelled = false;
    const toLoad = [];
    tokens.forEach(token => {
      const imgUrl = token.imageUrl || token.character?.imageUrl || token.npc?.imageUrl || token.monster?.imageUrl;
      if (imgUrl && !tokenImagesRef.current[token.id]) {
        toLoad.push({ id: token.id, url: imgUrl });
      }
    });
    toLoad.forEach(({ id, url }) => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        tokenImagesRef.current[id] = img;
        if (triggerRedrawRef.current) triggerRedrawRef.current();
      };
      img.onerror = () => {
        if (cancelled) return;
        tokenImagesRef.current[id] = img;
      };
      img.src = url;
    });
    return () => { cancelled = true; };
  }, [tokens]);

  // Handle auto resizing of canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      // Redraw after resizing
      if (imageRef.current) {
        resetViewport(imageRef.current.width, imageRef.current.height);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ---------------------------------------------------------------------------
  // Touch / Mouse Gesture Helpers
  // ---------------------------------------------------------------------------
  const getWorldCoordinates = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom,
      screenX,
      screenY
    };
  };

  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const getTouchMidpoint = (touches) => ({
    clientX: (touches[0].clientX + touches[1].clientX) / 2,
    clientY: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const applyZoomAt = (nextZoom, clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(nextZoom, MAX_ZOOM));
    const worldX = (screenX - panOffset.x) / zoom;
    const worldY = (screenY - panOffset.y) / zoom;

    setZoom(clampedZoom);
    setPanOffset({
      x: screenX - worldX * clampedZoom,
      y: screenY - worldY * clampedZoom,
    });
  };

  const handleStart = (clientX, clientY, options = {}) => {
    const { x, y, screenX, screenY } = getWorldCoordinates(clientX, clientY);
    setMousePosWorld({ x, y });

    if (tool === "select") {
      // Find token collision
      const hitToken = tokens.find(token => {
        const tx = (token.x + 0.5) * gridSize;
        const ty = (token.y + 0.5) * gridSize;
        const radius = gridSize * 0.42;
        const dx = x - tx;
        const dy = y - ty;
        return dx * dx + dy * dy < radius * radius;
      });

      if (hitToken) {
        // Access rules: DM can move all; Player can only move characters owned by them
        const isOwner = hitToken.character && hitToken.character.userId === user?.id;

        if (isDM || isOwner) {
          setSelectedTokenId(hitToken.id);
          setDragState({
            tokenId: hitToken.id,
            startGridPos: { x: hitToken.x, y: hitToken.y },
            currentWorldPos: { x: (hitToken.x + 0.5) * gridSize, y: (hitToken.y + 0.5) * gridSize },
            startScreenPos: { x: screenX, y: screenY },
            pending: options.isTouch === true,
            offset: {
              x: x - (hitToken.x + 0.5) * gridSize,
              y: y - (hitToken.y + 0.5) * gridSize
            }
          });
        }
      } else {
        // Background click: start panning map
        setIsPanning(true);
        setSelectedTokenId(null); // Deselect token
        setPanStart({
          x: screenX - panOffset.x,
          y: screenY - panOffset.y
        });
      }
    } else if (tool === "draw-fog" || tool === "reveal-fog") {
      if (user?.role === "DM" && activeMap) {
        setIsDrawing(true);
        setCurrentPolygon(prev => [...prev, { x, y }]);
      }
    }
  };

  const handleMove = (clientX, clientY) => {
    const { x, y, screenX, screenY } = getWorldCoordinates(clientX, clientY);

    // Only trigger React re-render when actively drawing fog (for polygon preview)
    if (isDrawing) {
      setMousePosWorld({ x, y });
    }

    if (dragState) {
      if (dragState.pending) {
        const dx = screenX - dragState.startScreenPos.x;
        const dy = screenY - dragState.startScreenPos.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      }

      setDragState(prev => ({
        ...prev,
        pending: false,
        currentWorldPos: {
          x: x - prev.offset.x,
          y: y - prev.offset.y
        }
      }));
    } else if (isPanning) {
      setPanOffset({
        x: screenX - panStart.x,
        y: screenY - panStart.y
      });
    }
  };

  const handleEnd = () => {
    if (dragState) {
      if (dragState.pending) {
        setDragState(null);
        return;
      }

      const px = dragState.currentWorldPos.x;
      const py = dragState.currentWorldPos.y;

      // Calculate nearest cell index
      const col = Math.round(px / gridSize - 0.5);
      const row = Math.round(py / gridSize - 0.5);

      // Clamp coordinates within map bounds
      const imgW = imageRef.current ? imageRef.current.width : 1000;
      const imgH = imageRef.current ? imageRef.current.height : 800;
      const maxCol = Math.max(0, Math.floor(imgW / gridSize) - 1);
      const maxRow = Math.max(0, Math.floor(imgH / gridSize) - 1);

      const clampedCol = Math.max(0, Math.min(col, maxCol));
      const clampedRow = Math.max(0, Math.min(row, maxRow));

      // Emit movement position
      if (socket && isConnected) {
        socket.emit("token:move", {
          userId: user?.id,
          id: dragState.tokenId,
          x: clampedCol,
          y: clampedRow
        });
      } else {
        // Fallback update state locally if offline
        setTokens(prev => prev.map(t => t.id === dragState.tokenId ? { ...t, x: clampedCol, y: clampedRow } : t));
        pendingMovesRef.current.push({
          tokenId: dragState.tokenId,
          x: clampedCol,
          y: clampedRow,
        });
      }

      setDragState(null);
    }

    if (isPanning) {
      setIsPanning(false);
    }
  };

  const handleTouchStart = (e) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      const midpoint = getTouchMidpoint(e.touches);
      gestureRef.current = {
        type: "pinch",
        startDistance: getTouchDistance(e.touches),
        startZoom: zoom,
        midpoint,
      };
      setDragState(null);
      setIsPanning(false);
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      gestureRef.current = null;
      handleStart(t.clientX, t.clientY, { isTouch: true });
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();

    if (e.touches.length === 2 && gestureRef.current?.type === "pinch") {
      const distance = getTouchDistance(e.touches);
      const midpoint = getTouchMidpoint(e.touches);
      const nextZoom = gestureRef.current.startZoom * (distance / gestureRef.current.startDistance);
      applyZoomAt(nextZoom, midpoint.clientX, midpoint.clientY);
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      handleMove(t.clientX, t.clientY);
    }
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();

    if (e.touches.length === 0) {
      gestureRef.current = null;
      handleEnd();
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      gestureRef.current = null;
      handleStart(t.clientX, t.clientY, { isTouch: true });
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  const handleZoom = (amount) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setZoom(prev => Math.max(MIN_ZOOM, Math.min(prev + amount, MAX_ZOOM)));
      return;
    }
    const rect = canvas.getBoundingClientRect();
    applyZoomAt(zoom + amount, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleCancelAddMap = () => {
    setShowAddMapModal(false);
    setNewMapName("");
    setNewMapGridSize(50);
    setNewMapFile(null);
    setNewMapImagePath("");
    setLoadError(null);
  };

  const handleMapPresetSelect = (presetLabel) => {
    const preset = MAP_IMPORT_PRESETS.find((item) => item.label === presetLabel);
    if (!preset) return;

    setNewMapImagePath(preset.path);
    setNewMapGridSize(preset.gridSize);
    setNewMapFile(null);
    if (!newMapName.trim()) {
      setNewMapName(preset.name);
    }
  };

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
      if (!res.ok) {
        setNewTokenImageUrl("");
        return;
      }

      const match = await res.json();
      setNewTokenImageUrl(match.url || "");
    } catch (err) {
      console.error("Failed to resolve monster token image:", err);
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

  const handleSelectMap = (mapId) => {
    if (user?.role === "DM" && socket && isConnected) {
      socket.emit("map:select", withUser({ mapId }));
    }
    tokenImagesRef.current = {};
    fetchMapDetails(mapId);
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
            imageUrl: imageData ? undefined : newMapImagePath.trim()
          })
        });

        if (res.ok) {
          const map = await res.json();
          setShowAddMapModal(false);
          setNewMapName("");
          setNewMapFile(null);
          setNewMapImagePath("");
          setLoadError(null);
          
          // Re-load list and auto-select newly made map
          await loadMaps(map.id);
          
          // Broadcast select if DM
          if (user?.role === "DM" && socket && isConnected) {
            socket.emit("map:select", withUser({ mapId: map.id }));
          }
        } else {
          const errData = await res.json().catch(() => ({ error: "Failed to create map." }));
          console.error("Failed to create map:", errData.error);
          setLoadError(errData.error || "Failed to create map.");
        }
      } catch (err) {
        console.error("Failed to create map:", err);
        setLoadError("Failed to create map. Check server connection.");
      } finally {
        setIsCreatingMap(false);
      }
    };

    if (newMapFile) {
      const reader = new FileReader();
      reader.readAsDataURL(newMapFile);
      reader.onload = () => submitMap(reader.result);
      reader.onerror = () => {
        console.error("Failed to read map image file.");
        setLoadError("Failed to read the selected image file.");
        setIsCreatingMap(false);
      };
    } else {
      await submitMap();
    }
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
      if (char) {
        label = char.name;
        charId = char.id;
      }
    } else if (tokenType === "npc" && newTokenNpcId) {
      const npc = availableNpcs.find(n => n.id === Number(newTokenNpcId));
      if (npc) {
        label = npc.name;
        npcId = npc.id;
        imageUrl = npc.imageUrl || imageUrl;
      }
    } else if (tokenType === "monster" && newTokenMonsterId) {
      const monster = availableMonsters.find(m => m.id === Number(newTokenMonsterId));
      if (monster) {
        label = monster.name;
        monsterId = monster.id;
        imageUrl = monster.imageUrl || imageUrl;
      }
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
          characterId: charId,
          npcId,
          monsterId,
          label,
          imageUrl,
          x: 0,
          y: 0,
          stats: tokenType === "monster" && newTokenStats ? JSON.stringify(newTokenStats) : null
        })
      });

      if (res.ok) {
        const token = await res.json();
        
        // Notify socket peers
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

  const handleCreateEncounter = async () => {
    if (!activeMap || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch("/api/encounters", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          mapId: activeMap.id,
          name: encounterName.trim() || `${activeMap.name} Encounter`,
        }),
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

  // AI Encounter Builder
  async function handleBuildEncounter() {
    const levels = encounterBuilderLevels
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (!levels.length) {
      setEncounterBuilderError("Enter at least one party level (e.g., 3, 5, 7).");
      return;
    }

    setEncounterBuilderLoading(true);
    setEncounterBuilderError(null);
    setEncounterBuilderProgress("Consulting your monster database...");

    try {
      const res = await fetch("/api/ai/build-encounter", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          partyLevels: levels,
          difficulty: encounterBuilderDifficulty,
          context: encounterBuilderContext.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to build encounter.");
      }

      const data = await res.json();
      if (data.encounter) {
        setEncounterBuilderResult(data.encounter);
      } else {
        throw new Error("No encounter data received.");
      }
    } catch (err) {
      setEncounterBuilderError(err.message);
    } finally {
      setEncounterBuilderLoading(false);
      setEncounterBuilderProgress("");
    }
  }

  async function handleApplyEncounterResult() {
    if (!encounterBuilderResult || !activeMap) return;
    setEncounterBuilderLoading(true);

    try {
      // Create the encounter
      const encRes = await fetch("/api/encounters", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          name: encounterBuilderResult.name || "AI Generated Encounter",
          mapId: activeMap.id,
        }),
      });
      if (!encRes.ok) throw new Error("Failed to create encounter.");
      const encounter = await encRes.json();
      setActiveEncounter(encounter);

      // Add participants from the AI result
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
          } catch (e) {
            // If monster not found, skip
          }
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
          } catch (e) {
            // If NPC not found, skip
          }
        }
      }

      setShowEncounterBuilder(false);
      setEncounterBuilderResult(null);
      loadActiveEncounter(activeMap.id);
    } catch (err) {
      setEncounterBuilderError(err.message);
    } finally {
      setEncounterBuilderLoading(false);
      setEncounterBuilderProgress("");
    }
  }

  // AI Encounter Name Generator
  async function handleGenerateEncounterName() {
    if (!activeEncounter?.participants?.length) {
      return;
    }
    setEncounterBuilderLoading(true);
    setEncounterBuilderError(null);

    try {
      const participants = activeEncounter.participants.map((p) => ({
        name: p.name || "Unknown",
        type: p.type || p.source || "unknown",
        cr: "?",
      }));

      const res = await fetch("/api/ai/encounter-description", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ participants }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate name.");
      }

      const data = await res.json();
      if (data.name) {
        const updateRes = await fetch(`/api/encounters/${activeEncounter.id}`, {
          method: "PATCH",
          headers: jsonAuthHeaders,
          body: JSON.stringify({ name: data.name }),
        });
        if (updateRes.ok) {
          const updated = await updateRes.json();
          setActiveEncounter(updated);
        }
      }
    } catch (err) {
      console.error("AI Name generation failed:", err);
    } finally {
      setEncounterBuilderLoading(false);
    }
  }

  const handleAddMonsterToEncounter = async () => {
    if (!activeEncounter || !encounterMonster?.id || !isDM || encounterBusy) return;
    setEncounterBusy(true);
    try {
      const res = await fetch(`/api/encounters/${activeEncounter.id}/participants`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          type: "monster",
          monsterId: encounterMonster.id,
          quantity: encounterQuantity,
          isHidden: encounterHidden,
        }),
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
        body: JSON.stringify({
          type: "npc",
          npcId: Number(encounterNpcId),
          isHidden: encounterHidden,
        }),
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
        body: JSON.stringify({
          type: "character",
          characterId: Number(encounterCharacterId),
          isHidden: false,
        }),
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

  const cleanText = (text) => {
    if (typeof text !== "string") return "";
    return text
      .replace(/\{@spell ([^}]+)\}/g, "$1")
      .replace(/\{@dice ([^}]+)\}/g, "($1)")
      .replace(/\{@item ([^}]+)\}/g, "$1")
      .replace(/\{@creature ([^}]+)\}/g, "$1")
      .replace(/\{@condition ([^}]+)\}/g, "$1")
      .replace(/\{@hit (\d+)\}/g, "+$1")
      .replace(/\{@damage ([^}]+)\}/g, "$1")
      .replace(/\{@filter ([^|]+)\|[^}]+\}/g, "$1")
      .replace(/\{@[a-z]+ ([^}]+)\}/g, "$1");
  };

  const handleNpcRoll = (npcName, actionName, toHitMod, dmgExpr, description) => {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const toHitTotal = d20 + Number(toHitMod || 0);
    const formatModifier = (val) => (val >= 0 ? `+${val}` : `${val}`);

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
          for (let i = 0; i < count; i++) {
            dmgRolls.push(Math.floor(Math.random() * sides) + 1);
          }
          const sumRolls = dmgRolls.reduce((a, b) => a + b, 0);
          damageTotal = sumRolls + modPart;
          dmgFormula = `${dicePart} + ${formatModifier(modPart)}`;
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
        sender: npcName,
        text,
        type: "roll",
        rollDetails: {
          rollName: actionName,
          formula: dmgExpr ? `Hit: 1d20 + ${toHitMod || 0} | Dmg: ${dmgFormula}` : `Hit: 1d20 + ${toHitMod || 0}`,
          isAttack: true,
          toHitRoll: d20,
          toHitMod: Number(toHitMod || 0),
          toHitTotal,
          damageRolls: dmgRolls,
          damageDice: dmgExpr || "",
          damageMod: dmgExpr ? (parseInt(dmgExpr.split("+")[1]) || 0) : 0,
          damageTotal,
        }
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
    const formatModifier = (val) => (val >= 0 ? `+${val}` : `${val}`);

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
        for (let i = 0; i < count; i++) {
          dmgRolls.push(Math.floor(Math.random() * sides) + 1);
        }
        const sumRolls = dmgRolls.reduce((a, b) => a + b, 0);
        damageTotal = sumRolls + modPart;
        dmgFormula = `${dicePart} + ${formatModifier(modPart)}`;
      }
    }

    if (socket && isConnected) {
      const cleanActionText = cleanText(actionText);
      const text = dmgExpr 
        ? `attacks with ${actionName}!  Hit: ${toHitTotal} | Damage: ${damageTotal}`
        : `uses ${actionName}!  ${cleanActionText}`;
      
      socket.emit("chat:send", {
        sender: monsterName,
        text,
        type: "roll",
        rollDetails: {
          rollName: actionName,
          formula: dmgExpr ? `Hit: 1d20 + ${toHitMod} | Dmg: ${dmgFormula}` : `Hit: 1d20 + ${toHitMod}`,
          isAttack: true,
          toHitRoll: d20,
          toHitMod,
          toHitTotal,
          damageRolls: dmgRolls,
          damageDice: dmgExpr,
          damageMod: dmgExpr ? (parseInt(dmgExpr.split("+")[1]) || 0) : 0,
          damageTotal,
        }
      });
    }
  };

  const handleDeleteToken = async (tokenId) => {
    if (!(await showConfirm("Delete Token?", "Are you sure you want to delete this token?"))) return;

    try {
      const res = await fetch(`/api/maps/tokens/${tokenId}`, {
        method: "DELETE",
        headers: authHeaders
      });

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

  const handleDeleteMap = async () => {
    if (!activeMap) return;
    if (!(await showConfirm(`Delete Map "${activeMap.name}"?`, `Are you sure you want to delete the map "${activeMap.name}"? This will also delete all tokens on this map.`))) return;

    try {
      const res = await fetch(`/api/maps/${activeMap.id}`, {
        method: "DELETE",
        headers: authHeaders
      });

      if (res.ok) {
        const deletedId = activeMap.id;

        // Emit deletion to socket peers
        if (socket && isConnected) {
          socket.emit("map:delete", withUser({ mapId: deletedId }));
        }

        // Update local maps list
        const updatedList = mapsList.filter(m => m.id !== deletedId);
        setMapsList(updatedList);

        if (updatedList.length > 0) {
          // Switch local map view
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
      console.error("Failed to delete map:", err);
      addToast("Failed to delete map due to a network error.", "error");
    }
  };

  const handleUndoFog = () => {
    if (!activeMap || user?.role !== "DM") return;
    const polys = parseFogState(activeMap.fogState);
    if (polys.length === 0) return;
    
    const updated = polys.slice(0, polys.length - 1);
    if (socket && isConnected) {
      socket.emit("fog:update", withUser({ mapId: activeMap.id, fogState: updated }));
    }
  };

  const handleClearFog = (revealAll) => {
    if (!activeMap || user?.role !== "DM") return;
    
    let updated = [];
    if (revealAll) {
      // One large polygon cutting out the entire map bounds
      const imgW = imageRef.current ? imageRef.current.width : 2000;
      const imgH = imageRef.current ? imageRef.current.height : 2000;
      updated = [{
        type: "reveal",
        points: [
          { x: 0, y: 0 },
          { x: imgW, y: 0 },
          { x: imgW, y: imgH },
          { x: 0, y: imgH }
        ]
      }];
    }

    if (socket && isConnected) {
      socket.emit("fog:update", withUser({ mapId: activeMap.id, fogState: updated }));
    }
  };

  const handleFinishFogPolygon = () => {
    if (!activeMap) {
      setCurrentPolygon([]);
      setIsDrawing(false);
      return;
    }

    if (currentPolygon.length > 2) {
      const newPoly = {
        type: tool === "draw-fog" ? "hide" : "reveal",
        points: currentPolygon
      };
      
      const parsedFog = parseFogState(activeMap.fogState);
      const updatedFog = [...parsedFog, newPoly];

      if (socket && isConnected) {
        socket.emit("fog:update", {
          userId: user?.id,
          mapId: activeMap.id,
          fogState: JSON.stringify(updatedFog)
        });
      }

      setCurrentPolygon([]);
      setIsDrawing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // JSX Rendering
  // ---------------------------------------------------------------------------
  return (
    <div style={styles.container} className="fade-in">
      
      {/* VTT Header */}
      <header style={styles.header}>
        <div style={styles.headerTitleBox}>
          <h2 style={styles.title}>Tacticians Grid</h2>
          {activeMap && (
            <span style={styles.mapNameBadge}>
              Active: {activeMap.name} ({activeMap.gridSize}px Grid)
            </span>
          )}
        </div>
        
        <div style={styles.headerControls}>
          {/* Map selector visible to all; editing actions only for DM */}
          <div style={styles.dmMapSelector}>
            <select
              value={activeMap?.id || ""}
              onChange={(e) => handleSelectMap(Number(e.target.value))}
              style={styles.select}
              className="form-input touch-target"
              aria-label="Select map"
            >
              {mapsList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {user?.role === "DM" && (
              <>
                <button
                  onClick={() => setShowAddMapModal(true)}
                  style={styles.btnSmall}
                  className="btn-hover-scale glass-panel touch-target"
                >
                  <Plus size={16} />
                  <span>New Map</span>
                </button>
                <button
                  onClick={handleDeleteMap}
                  style={styles.btnDangerSmall}
                  className="btn-hover-scale glass-panel touch-target"
                  disabled={!activeMap}
                >
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>

          <span style={styles.status}>
            {isConnected ? "Live Sync" : "Offline Mode"}
          </span>
        </div>
      </header>

      {/* Global error banner */}
      {loadError && !showAddMapModal && (
        <div style={styles.errorBanner}>
          <AlertCircle size={16} />
          <span>{loadError}</span>
          <button onClick={() => setLoadError(null)} style={styles.errorDismiss} className="touch-target">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Grid/Map Arena Workspace */}
      <div 
        ref={containerRef} 
        style={styles.vttWorkspace} 
        className="glass-panel gold-border-glow"
      >
        <canvas
          ref={canvasRef}
          role="application"
          aria-label="Battle map"
          tabIndex={0}
          style={styles.canvas}
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onKeyDown={(e) => {
            const step = 50;
            switch (e.key) {
              case "ArrowUp": setPanOffset(p => ({ ...p, y: p.y + step })); break;
              case "ArrowDown": setPanOffset(p => ({ ...p, y: p.y - step })); break;
              case "ArrowLeft": setPanOffset(p => ({ ...p, x: p.x + step })); break;
              case "ArrowRight": setPanOffset(p => ({ ...p, x: p.x - step })); break;
              case "=": case "+": setZoom(z => Math.min(z + 0.1, MAX_ZOOM)); break;
              case "-": setZoom(z => Math.max(z - 0.1, MIN_ZOOM)); break;
            }
          }}
          onTouchCancel={handleTouchEnd}
        />

        {activeEncounter && activeEncounter.status !== "COMPLETE" && (
          <div style={styles.combatStrip} className="glass-panel">
            <div style={styles.combatStripMeta}>
              <strong>{activeEncounter.name}</strong>
              <span>Round {activeEncounter.round} • {activeEncounter.status}</span>
            </div>
            <div style={styles.combatParticipants}>
              {(activeEncounter.participants || []).slice(0, 8).map((participant) => {
                const isCurrent = participant.id === activeEncounter.currentParticipantId;
                const hpPct = participant.maxHp ? Math.max(0, Math.min(100, (participant.currentHp / participant.maxHp) * 100)) : 0;
                return (
                  <div
                    key={participant.id}
                    style={{
                      ...styles.combatPill,
                      borderColor: isCurrent ? "var(--color-accent)" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <span style={styles.combatPillName}>{participant.name}</span>
                    <span style={styles.combatPillHp}>{participant.currentHp}/{participant.maxHp}</span>
                    <span style={{ ...styles.combatHpBar, width: `${hpPct}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isDM && showEncounterDrawer && (
          <div style={styles.encounterDrawer} className="glass-panel gold-border-glow">
            <header style={styles.detailsHeader}>
              <h4 style={styles.smallPanelHeader}>Encounter Builder</h4>
              <button onClick={() => setShowEncounterDrawer(false)} style={styles.closeBtn} aria-label="Close encounter builder">
                <X size={16} />
              </button>
            </header>

            <div style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "flex-start" }}>
              <button
                type="button"
                onClick={() => {
                  setEncounterBuilderError(null);
                  setEncounterBuilderProgress("");
                  setEncounterBuilderResult(null);
                  setShowEncounterBuilder(true);
                }}
                style={{
                  padding: "0.5rem 0.75rem", fontSize: "0.8rem", borderRadius: "6px",
                  background: "rgba(200, 151, 58, 0.15)", color: "var(--color-accent)",
                  border: "1px solid rgba(200, 151, 58, 0.3)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "0.35rem",
                  opacity: encounterBuilderLoading ? 0.6 : 1,
                }}
                className="touch-target"
                disabled={encounterBuilderLoading}
              >
                ✨ AI Build Encounter
              </button>
            </div>

            {!activeEncounter || activeEncounter.status === "COMPLETE" ? (
              <div style={styles.encounterSection}>
                <input
                  value={encounterName}
                  onChange={(e) => setEncounterName(e.target.value)}
                  placeholder={activeMap ? `${activeMap.name} Encounter` : "Encounter name"}
                  style={styles.input}
                  className="form-input"
                  disabled={!activeMap || encounterBusy}
                />
                <button
                  onClick={handleCreateEncounter}
                  disabled={!activeMap || encounterBusy}
                  style={styles.btnSubmit}
                  className="touch-target btn-hover-scale"
                >
                  Create Encounter
                </button>
              </div>
            ) : (
              <>
                <div style={styles.encounterMetaBox}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong>{activeEncounter.name}</strong>
                    {isDM && activeEncounter.participants?.length > 0 && (
                      <button
                        type="button"
                        onClick={handleGenerateEncounterName}
                        style={{
                          background: "transparent", border: "none", color: "var(--color-accent)",
                          cursor: "pointer", fontSize: "0.75rem", padding: "0.25rem",
                        }}
                        className="touch-target"
                        title="Generate encounter name"
                        disabled={encounterBuilderLoading}
                      >
                        ✨ Name
                      </button>
                    )}
                  </div>
                  <span>{activeEncounter.participants?.length || 0} combatants • Round {activeEncounter.round}</span>
                </div>

                <div style={styles.encounterSection}>
                  <label style={styles.label}>Add Bestiary Monsters</label>
                  <Autocomplete
                    category="monsters"
                    value={encounterMonsterQuery}
                    onChange={(value) => {
                      setEncounterMonsterQuery(value);
                      setEncounterMonster(null);
                    }}
                    onSelect={(monster) => {
                      setEncounterMonster(monster);
                      setEncounterMonsterQuery(monster.name);
                    }}
                    placeholder="Search monsters"
                    className="form-input"
                    inputStyle={styles.input}
                  />
                  <div style={styles.encounterRow}>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={encounterQuantity}
                      onChange={(e) => setEncounterQuantity(Number(e.target.value))}
                      style={styles.smallNumberInput}
                      className="form-input"
                    />
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={encounterHidden}
                        onChange={(e) => setEncounterHidden(e.target.checked)}
                      />
                      Hidden
                    </label>
                    <button
                      onClick={handleAddMonsterToEncounter}
                      disabled={!encounterMonster || encounterBusy}
                      style={styles.btnAction}
                      className="touch-target"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div style={styles.encounterSection}>
                  <label style={styles.label}>Add Existing NPC or Character</label>
                  <div style={styles.encounterRow}>
                    <select
                      value={encounterNpcId}
                      onChange={(e) => setEncounterNpcId(e.target.value)}
                      style={styles.select}
                      className="form-input"
                    >
                      <option value="">NPC...</option>
                      {availableNpcs.map((npc) => (
                        <option key={npc.id} value={npc.id}>{npc.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddNpcToEncounter}
                      disabled={!encounterNpcId || encounterBusy}
                      style={styles.btnAction}
                      className="touch-target"
                    >
                      Add NPC
                    </button>
                  </div>
                  <div style={styles.encounterRow}>
                    <select
                      value={encounterCharacterId}
                      onChange={(e) => setEncounterCharacterId(e.target.value)}
                      style={styles.select}
                      className="form-input"
                    >
                      <option value="">Character...</option>
                      {availableCharacters.map((character) => (
                        <option key={character.id} value={character.id}>{character.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddCharacterToEncounter}
                      disabled={!encounterCharacterId || encounterBusy}
                      style={styles.btnAction}
                      className="touch-target"
                    >
                      Add PC
                    </button>
                  </div>
                </div>

                <div style={styles.encounterRoster}>
                  {(activeEncounter.participants || []).map((participant) => {
                    const isCurrent = participant.id === activeEncounter.currentParticipantId;
                    return (
                      <div
                        key={participant.id}
                        style={{
                          ...styles.encounterRosterItem,
                          borderColor: isCurrent ? "var(--color-accent)" : "rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={styles.rosterNameRow}>
                          <strong>{participant.name}</strong>
                          <span>Init {participant.initiative}</span>
                        </div>
                        <div style={styles.encounterRow}>
                          <span style={styles.rosterHp}>HP {participant.currentHp}/{participant.maxHp} • AC {participant.ac}</span>
                          <button onClick={() => handleParticipantHp(participant, -5)} style={styles.hpAdjBtn}>-5</button>
                          <button onClick={() => handleParticipantHp(participant, -1)} style={styles.hpAdjBtn}>-1</button>
                          <button onClick={() => handleParticipantHp(participant, 1)} style={styles.hpAdjBtn}>+1</button>
                          <button onClick={() => handleParticipantHp(participant, 5)} style={styles.hpAdjBtn}>+5</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={styles.encounterSection}>
                  <label style={styles.label}>Deploy Start Cell</label>
                  <div style={styles.encounterRow}>
                    <input
                      type="number"
                      min="0"
                      value={encounterDeployX}
                      onChange={(e) => setEncounterDeployX(Number(e.target.value))}
                      style={styles.smallNumberInput}
                      className="form-input"
                      aria-label="Deploy X"
                    />
                    <input
                      type="number"
                      min="0"
                      value={encounterDeployY}
                      onChange={(e) => setEncounterDeployY(Number(e.target.value))}
                      style={styles.smallNumberInput}
                      className="form-input"
                      aria-label="Deploy Y"
                    />
                    <button onClick={handleDeployEncounter} disabled={encounterBusy} style={styles.btnAction} className="touch-target">
                      Deploy
                    </button>
                  </div>
                </div>

                <div style={styles.encounterControls}>
                  <button onClick={handleStartEncounter} disabled={encounterBusy} style={styles.btnSubmit} className="touch-target">
                    Roll Initiative
                  </button>
                  <button onClick={() => handleAdvanceEncounterTurn("previous")} disabled={encounterBusy} style={styles.btnAction} className="touch-target">
                    Prev
                  </button>
                  <button onClick={() => handleAdvanceEncounterTurn("next")} disabled={encounterBusy} style={styles.btnAction} className="touch-target">
                    Next
                  </button>
                  <button onClick={handleCompleteEncounter} disabled={encounterBusy} style={styles.btnDangerSmall} className="touch-target">
                    Complete
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Floating Tool Option Bar */}
        <div style={styles.floatingToolbar} className="glass-panel">
          <button
            onClick={() => setTool("select")}
            style={{
              ...styles.toolBtn,
              background: tool === "select" ? "var(--color-accent-dim)" : "transparent",
              borderColor: tool === "select" ? "var(--color-accent)" : "rgba(255,255,255,0.05)"
            }}
            title="Pan Map / Drag Token"
            className="touch-target btn-hover-scale"
          >
            <Hand size={17} />
            <span>Move</span>
          </button>

          {user?.role === "DM" && (
            <>
              <button
                onClick={() => {
                  if (!activeMap) return;
                  setTool("draw-fog");
                  setCurrentPolygon([]);
                }}
                disabled={!activeMap}
                style={{
                  ...styles.toolBtn,
                  background: tool === "draw-fog" ? "var(--color-accent-dim)" : "transparent",
                  borderColor: tool === "draw-fog" ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
                  opacity: activeMap ? 1 : 0.5,
                  cursor: activeMap ? "pointer" : "not-allowed"
                }}
                title={activeMap ? "Draw Fog (Hide area)" : "Select a map first"}
                className="touch-target btn-hover-scale"
              >
                <Grid3x3 size={17} />
                <span>Mask</span>
              </button>
              
              <button
                onClick={() => {
                  if (!activeMap) return;
                  setTool("reveal-fog");
                  setCurrentPolygon([]);
                }}
                disabled={!activeMap}
                style={{
                  ...styles.toolBtn,
                  background: tool === "reveal-fog" ? "var(--color-accent-dim)" : "transparent",
                  borderColor: tool === "reveal-fog" ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
                  opacity: activeMap ? 1 : 0.5,
                  cursor: activeMap ? "pointer" : "not-allowed"
                }}
                title={activeMap ? "Reveal Fog (Carve hole)" : "Select a map first"}
                className="touch-target btn-hover-scale"
              >
                <Eye size={17} />
                <span>Reveal</span>
              </button>
            </>
          )}

          <div style={styles.divider} />

          <button
            onClick={() => setShowGrid(!showGrid)}
            style={{
              ...styles.toolBtn,
              background: showGrid ? "var(--color-accent-dim)" : "transparent",
              borderColor: showGrid ? "var(--color-accent)" : "rgba(255,255,255,0.05)"
            }}
            title="Toggle Grid Lines"
            className="touch-target btn-hover-scale"
          >
            <Grid3x3 size={17} />
            <span>Grid</span>
          </button>

          <button
            onClick={() => handleZoom(0.15)}
            style={styles.toolBtn}
            title="Zoom In"
            className="touch-target btn-hover-scale"
          >
            <ZoomIn size={18} />
          </button>
          
          <button
            onClick={() => handleZoom(-0.15)}
            style={styles.toolBtn}
            title="Zoom Out"
            className="touch-target btn-hover-scale"
          >
            <ZoomOut size={18} />
          </button>

          <button
            onClick={() => {
              if (imageRef.current) {
                resetViewport(imageRef.current.width, imageRef.current.height);
              }
            }}
            style={styles.toolBtn}
            title="Reset View"
            className="touch-target btn-hover-scale"
          >
            <Maximize2 size={17} />
            <span>Fit</span>
          </button>
        </div>

        {/* Floating Token and Utility control */}
        <div style={styles.floatingTokensControl} className="glass-panel">
          <h4 style={styles.smallPanelHeader}>Token Control</h4>
          {selectedTokenId && (
            <div style={styles.selectedTokenText}>
              Selected: {tokens.find((t) => t.id === selectedTokenId)?.label || "Token"}
            </div>
          )}
          <div style={styles.tokenActionRow}>
            {isDM && (
              <button
                onClick={() => setShowEncounterDrawer(true)}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                <UserPlus size={15} />
                Encounter
              </button>
            )}
            <button
              onClick={() => setShowAddTokenModal(true)}
              style={styles.btnAction}
              className="btn-hover-scale touch-target"
            >
              <Plus size={15} />
              Add Token
            </button>
            
            {selectedTokenId && (
              <button
                onClick={() => handleDeleteToken(selectedTokenId)}
                style={{ ...styles.btnAction, background: "var(--color-danger)" }}
                className="btn-hover-scale touch-target"
              >
                <Trash2 size={15} />
                Delete
              </button>
            )}
            {selectedTokenId && (
              <button
                onClick={() => setSelectedTokenId(null)}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                <X size={15} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* AI Encounter Builder Modal */}
        {showEncounterBuilder && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 1000, padding: "1rem",
          }} onClick={() => !encounterBuilderLoading && setShowEncounterBuilder(false)}>
            <div style={{
              background: "var(--color-surface)", borderRadius: "12px",
              padding: "1.5rem", maxWidth: "500px", width: "100%",
              maxHeight: "90vh", overflow: "auto",
              border: "1px solid rgba(255,255,255,0.1)",
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, color: "var(--color-accent)" }}>✨ AI Encounter Builder</h3>
                <button onClick={() => setShowEncounterBuilder(false)} style={{
                  background: "transparent", border: "none", color: "var(--color-text)",
                  fontSize: "1.25rem", cursor: "pointer", padding: "0.25rem",
                }} className="touch-target">✕</button>
              </div>

              {!encounterBuilderResult ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "0.25rem" }}>
                      Party Levels (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={encounterBuilderLevels}
                      onChange={(e) => setEncounterBuilderLevels(e.target.value)}
                      placeholder="e.g. 3, 3, 4, 5"
                      style={{
                        padding: "0.55rem 0.75rem", fontSize: "0.85rem", borderRadius: "6px",
                        background: "rgba(0,0,0,0.3)", color: "var(--color-text)",
                        border: "1px solid rgba(255,255,255,0.08)", width: "100%",
                      }}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "0.25rem" }}>
                      Difficulty
                    </label>
                    <select
                      value={encounterBuilderDifficulty}
                      onChange={(e) => setEncounterBuilderDifficulty(e.target.value)}
                      style={{
                        padding: "0.55rem 0.75rem", fontSize: "0.85rem", borderRadius: "6px",
                        background: "rgba(0,0,0,0.3)", color: "var(--color-text)",
                        border: "1px solid rgba(255,255,255,0.08)", width: "100%",
                      }}
                      className="form-input"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="deadly">Deadly</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "0.25rem" }}>
                      Additional Context (optional)
                    </label>
                    <textarea
                      value={encounterBuilderContext}
                      onChange={(e) => setEncounterBuilderContext(e.target.value)}
                      placeholder="e.g. Forest ambush, the party is crossing a bridge..."
                      style={{
                        padding: "0.75rem", fontSize: "0.85rem", borderRadius: "6px",
                        background: "rgba(0,0,0,0.3)", color: "var(--color-text)",
                        border: "1px solid rgba(255,255,255,0.08)", minHeight: "60px", width: "100%",
                      }}
                      className="form-input"
                      rows={2}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleBuildEncounter}
                    disabled={encounterBuilderLoading || !encounterBuilderLevels.trim()}
                    style={{
                      padding: "0.6rem 1.25rem", fontSize: "0.85rem", borderRadius: "6px",
                      background: "var(--color-accent)", color: "var(--color-bg)", border: "none",
                      cursor: "pointer", alignSelf: "flex-end",
                      opacity: encounterBuilderLoading || !encounterBuilderLevels.trim() ? 0.5 : 1,
                    }}
                    className="touch-target"
                  >
                    {encounterBuilderLoading ? "Building..." : "Build Encounter"}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div>
                    <h4 style={{ margin: "0 0 0.5rem", color: "var(--color-text)" }}>
                      {encounterBuilderResult.name}
                    </h4>
                    {encounterBuilderResult.description && (
                      <p style={{ fontSize: "0.85rem", color: "var(--color-muted)", margin: "0 0 0.5rem" }}>
                        {encounterBuilderResult.description}
                      </p>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", margin: "0 0 0.25rem" }}>
                        Suggested Participants:
                      </p>
                      {(encounterBuilderResult.participants || []).map((p, i) => (
                        <div key={i} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "0.4rem 0.5rem", background: "rgba(255,255,255,0.03)",
                          borderRadius: "4px", fontSize: "0.8rem",
                        }}>
                          <span style={{ color: "var(--color-text)" }}>
                            {p.name} ({p.type || "unknown"})
                          </span>
                          <span style={{ color: "var(--color-muted)" }}>
                            ×{p.quantity || 1} — CR {p.cr || "?"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignSelf: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setEncounterBuilderResult(null)}
                      style={{
                        padding: "0.5rem 1rem", fontSize: "0.8rem", borderRadius: "6px",
                        background: "rgba(255,255,255,0.05)", color: "var(--color-text)",
                        border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
                      }}
                      className="touch-target"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyEncounterResult}
                      disabled={encounterBuilderLoading}
                      style={{
                        padding: "0.5rem 1rem", fontSize: "0.8rem", borderRadius: "6px",
                        background: "var(--color-accent)", color: "#fff", border: "none",
                        cursor: "pointer", opacity: encounterBuilderLoading ? 0.5 : 1,
                      }}
                      className="touch-target"
                    >
                      Apply to Map
                    </button>
                  </div>
                </div>
              )}

              {encounterBuilderProgress && (
                <p style={{ color: "var(--color-accent)", fontSize: "0.8rem", margin: "0.5rem 0" }}>{encounterBuilderProgress}</p>
              )}
              {encounterBuilderError && (
                <p style={{ color: "var(--color-danger)", fontSize: "0.8rem", margin: "0.5rem 0" }}>{encounterBuilderError}</p>
              )}
            </div>
          </div>
        )}

        {/* Floating Fog Actions for DM */}
        {user?.role === "DM" && (tool === "draw-fog" || tool === "reveal-fog") && (
          <div style={styles.floatingFogActions} className="glass-panel">
            <h4 style={styles.smallPanelHeader}>Fog Control</h4>
            <div style={styles.tokenActionRow}>
              <button
                onClick={handleUndoFog}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                <Undo2 size={15} />
                Undo Last
              </button>
              <button
                onClick={() => handleClearFog(false)}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                <Grid3x3 size={15} />
                Mask All
              </button>
              <button
                onClick={() => handleClearFog(true)}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                <Eye size={15} />
                Reveal All
              </button>
            </div>
            
            {isDrawing && currentPolygon.length > 2 && (
              <button
                onClick={handleFinishFogPolygon}
                style={styles.finishShapeBtn}
                className="btn-hover-scale pulse-accent-animation touch-target"
              >
                Finish Shape ({currentPolygon.length} pts)
              </button>
            )}
          </div>
        )}

        {/* Selected Token Details Sidebar (Top Right) */}
        {selectedTokenId && (
          (() => {
            const selectedToken = tokens.find(t => t.id === selectedTokenId);
            if (!selectedToken) return null;
            
            let monsterStats = null;
            if (selectedToken.stats) {
              try {
                monsterStats = JSON.parse(selectedToken.stats);
              } catch (e) {}
            }

            const npcDetail = selectedToken.npc;

            return (
              <div style={styles.floatingTokenDetails} className="glass-panel gold-border-glow">
                <header style={styles.detailsHeader}>
                  <h4 style={styles.smallPanelHeader}>Selected Token</h4>
                  <button onClick={() => setSelectedTokenId(null)} style={styles.closeBtn} aria-label="Close selected token details">
                    <X size={16} />
                  </button>
                </header>
                
                <div style={styles.detailsBody}>
                  <div style={styles.detailsRow}>
                    <strong>Name:</strong> <span>{selectedToken.label || selectedToken.character?.name || npcDetail?.name || "Token"}</span>
                  </div>

                  {/* Render player details */}
                  {selectedToken.characterId && (
                    <div style={styles.metaInfo}>
                      Lvl {selectedToken.character?.level}  {selectedToken.character?.race} {selectedToken.character?.class}
                    </div>
                  )}

                  {/* Render NPC details */}
                  {npcDetail && (
                    <div style={styles.metaInfo}>
                      CR {npcDetail.cr} • {npcDetail.race} {npcDetail.class} (Lvl {npcDetail.level})
                    </div>
                  )}

                  {/* Render NPC combat sheet */}
                  {npcDetail && (
                    <div style={styles.monsterSheet}>
                      <div style={styles.metaInfo}>
                        AC {npcDetail.ac}
                      </div>
                      
                      {/* HP Tracker */}
                      <div style={styles.hpTracker}>
                        <div style={styles.hpLabelRow}>
                          <span>HP: {npcDetail.hp} / {npcDetail.maxHp}</span>
                        </div>
                        <div style={styles.hpControlsRow}>
                          <button
                            onClick={() => {
                              const next = Math.max(0, npcDetail.hp - 1);
                              fetch(`/api/npcs/${npcDetail.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ hp: next })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, npc: { ...npcDetail, hp: next } } : t));
                                if (socket && isConnected) socket.emit("token:create", withUser({ id: selectedToken.id }));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            -1
                          </button>
                          <button
                            onClick={() => {
                              const next = Math.max(0, npcDetail.hp - 5);
                              fetch(`/api/npcs/${npcDetail.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ hp: next })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, npc: { ...npcDetail, hp: next } } : t));
                                if (socket && isConnected) socket.emit("token:create", withUser({ id: selectedToken.id }));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            -5
                          </button>
                          <button
                            onClick={() => {
                              const next = Math.min(npcDetail.maxHp, npcDetail.hp + 5);
                              fetch(`/api/npcs/${npcDetail.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ hp: next })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, npc: { ...npcDetail, hp: next } } : t));
                                if (socket && isConnected) socket.emit("token:create", withUser({ id: selectedToken.id }));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            +5
                          </button>
                          <button
                            onClick={() => {
                              const next = Math.min(npcDetail.maxHp, npcDetail.hp + 1);
                              fetch(`/api/npcs/${npcDetail.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ hp: next })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, npc: { ...npcDetail, hp: next } } : t));
                                if (socket && isConnected) socket.emit("token:create", withUser({ id: selectedToken.id }));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            +1
                          </button>
                        </div>
                      </div>

                      {/* Attributes */}
                      <div style={styles.miniStatsGrid}>
                        <div><strong>STR</strong><span>{npcDetail.strength}</span></div>
                        <div><strong>DEX</strong><span>{npcDetail.dexterity}</span></div>
                        <div><strong>CON</strong><span>{npcDetail.constitution}</span></div>
                        <div><strong>INT</strong><span>{npcDetail.intelligence}</span></div>
                        <div><strong>WIS</strong><span>{npcDetail.wisdom}</span></div>
                        <div><strong>CHA</strong><span>{npcDetail.charisma}</span></div>
                      </div>

                      {/* Rollable Actions */}
                      {npcDetail.actions && (() => {
                        let parsedActions = [];
                        try {
                          parsedActions = JSON.parse(npcDetail.actions);
                        } catch (e) {}
                        return (
                          <div style={styles.actionsSection}>
                            <h5 style={styles.actionsHeader}>NPC Actions</h5>
                            {parsedActions.map((act, i) => (
                              <button
                                key={act.name || i}
                                onClick={() => handleNpcRoll(selectedToken.label || npcDetail.name, act.name, act.toHit, act.damage, act.description)}
                                style={styles.monsterActionBtn}
                                className="touch-target btn-hover-scale"
                              >
                                {act.name}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Render monster combat sheet */}
                  {selectedToken.monster ? (
                    <div style={styles.monsterSheet}>
                      <div style={styles.metaInfo}>
                        CR {selectedToken.monster.cr || "0"} • AC {selectedToken.monster.ac || "10"}
                      </div>
                      
                      {/* HP Tracker */}
                      <div style={styles.hpTracker}>
                        <div style={styles.hpLabelRow}>
                          <span>HP: {monsterStats?.currentHp !== undefined ? monsterStats.currentHp : selectedToken.monster.hp} / {selectedToken.monster.maxHp}</span>
                        </div>
                        <div style={styles.hpControlsRow}>
                          <button
                            onClick={() => {
                              const cur = monsterStats?.currentHp !== undefined ? monsterStats.currentHp : selectedToken.monster.hp;
                              const next = Math.max(0, cur - 1);
                              const updated = { ...(monsterStats || {}), currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            -1
                          </button>
                          <button
                            onClick={() => {
                              const cur = monsterStats?.currentHp !== undefined ? monsterStats.currentHp : selectedToken.monster.hp;
                              const next = Math.max(0, cur - 5);
                              const updated = { ...(monsterStats || {}), currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            -5
                          </button>
                          <button
                            onClick={() => {
                              const cur = monsterStats?.currentHp !== undefined ? monsterStats.currentHp : selectedToken.monster.hp;
                              const max = selectedToken.monster.maxHp;
                              const next = Math.min(max, cur + 5);
                              const updated = { ...(monsterStats || {}), currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            +5
                          </button>
                          <button
                            onClick={() => {
                              const cur = monsterStats?.currentHp !== undefined ? monsterStats.currentHp : selectedToken.monster.hp;
                              const max = selectedToken.monster.maxHp;
                              const next = Math.min(max, cur + 1);
                              const updated = { ...(monsterStats || {}), currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            +1
                          </button>
                        </div>
                      </div>

                      {/* Attributes */}
                      <div style={styles.miniStatsGrid}>
                        <div><strong>STR</strong><span>{selectedToken.monster.strength}</span></div>
                        <div><strong>DEX</strong><span>{selectedToken.monster.dexterity}</span></div>
                        <div><strong>CON</strong><span>{selectedToken.monster.constitution}</span></div>
                        <div><strong>INT</strong><span>{selectedToken.monster.intelligence}</span></div>
                        <div><strong>WIS</strong><span>{selectedToken.monster.wisdom}</span></div>
                        <div><strong>CHA</strong><span>{selectedToken.monster.charisma}</span></div>
                      </div>

                      {/* Rollable Actions */}
                      {(() => {
                        let parsedActions = [];
                        try {
                          parsedActions = JSON.parse(selectedToken.monster.actions);
                        } catch (e) {}
                        return (
                          <div style={styles.actionsSection}>
                            <h5 style={styles.actionsHeader}>Monster Actions</h5>
                            {parsedActions.map((act, i) => (
                              <button
                                key={act.name || i}
                                onClick={() => handleNpcRoll(selectedToken.label || selectedToken.monster.name, act.name, act.toHit, act.damage, act.description)}
                                style={styles.monsterActionBtn}
                                className="touch-target btn-hover-scale"
                              >
                                {act.name}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  ) : monsterStats ? (
                    <div style={styles.monsterSheet}>
                      <div style={styles.metaInfo}>
                        CR {monsterStats.cr || "0"}  AC {monsterStats.ac?.[0]?.ac || monsterStats.ac?.[0] || "10"}
                      </div>
                      
                      {/* HP Tracker */}
                      <div style={styles.hpTracker}>
                        <div style={styles.hpLabelRow}>
                          <span>HP: {monsterStats.currentHp !== undefined ? monsterStats.currentHp : (monsterStats.hp?.average || 10)} / {monsterStats.hp?.average || 10}</span>
                        </div>
                        <div style={styles.hpControlsRow}>
                          <button
                            onClick={() => {
                              const cur = monsterStats.currentHp !== undefined ? monsterStats.currentHp : (monsterStats.hp?.average || 10);
                              const next = Math.max(0, cur - 1);
                              const updated = { ...monsterStats, currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            -1
                          </button>
                          <button
                            onClick={() => {
                              const cur = monsterStats.currentHp !== undefined ? monsterStats.currentHp : (monsterStats.hp?.average || 10);
                              const next = Math.max(0, cur - 5);
                              const updated = { ...monsterStats, currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            -5
                          </button>
                          <button
                            onClick={() => {
                              const cur = monsterStats.currentHp !== undefined ? monsterStats.currentHp : (monsterStats.hp?.average || 10);
                              const max = monsterStats.hp?.average || 10;
                              const next = Math.min(max, cur + 5);
                              const updated = { ...monsterStats, currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            +5
                          </button>
                          <button
                            onClick={() => {
                              const cur = monsterStats.currentHp !== undefined ? monsterStats.currentHp : (monsterStats.hp?.average || 10);
                              const max = monsterStats.hp?.average || 10;
                              const next = Math.min(max, cur + 1);
                              const updated = { ...monsterStats, currentHp: next };
                              fetch(`/api/maps/tokens/${selectedToken.id}`, {
                                method: "PUT",
                                headers: jsonAuthHeaders,
                                body: JSON.stringify({ stats: JSON.stringify(updated) })
                              }).then(() => {
                                setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
                              });
                            }}
                            style={styles.hpAdjBtn}
                          >
                            +1
                          </button>
                        </div>
                      </div>

                      {/* Attributes */}
                      <div style={styles.miniStatsGrid}>
                        <div><strong>STR</strong><span>{monsterStats.str || 10}</span></div>
                        <div><strong>DEX</strong><span>{monsterStats.dex || 10}</span></div>
                        <div><strong>CON</strong><span>{monsterStats.con || 10}</span></div>
                        <div><strong>INT</strong><span>{monsterStats.int || 10}</span></div>
                        <div><strong>WIS</strong><span>{monsterStats.wis || 10}</span></div>
                        <div><strong>CHA</strong><span>{monsterStats.cha || 10}</span></div>
                      </div>

                      {/* Rollable Actions */}
                      {monsterStats.action && (
                        <div style={styles.actionsSection}>
                          <h5 style={styles.actionsHeader}>Roll Actions</h5>
                          {monsterStats.action.map((act, i) => {
                            const entriesStr = JSON.stringify(act.entries || []);
                            const hasRoll = entriesStr.includes("{@hit") || entriesStr.includes("{@damage");
                            return (
                              <button
                                key={act.name || i}
                                onClick={() => handleMonsterRoll(selectedToken.label, act.name, entriesStr)}
                                style={styles.monsterActionBtn}
                                className="touch-target btn-hover-scale"
                              >
                                {act.name} {hasRoll ? "" : ""}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* MODAL: ADD MAP */}
      {showAddMapModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard} className="glass-panel gold-border-glow">
            <h3 style={styles.modalTitle}> Upload Campaign Map</h3>
            <form onSubmit={handleCreateMap} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Map Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sword Coast, Cragmaw Castle..."
                  value={newMapName}
                  onChange={(e) => setNewMapName(e.target.value)}
                  style={styles.input}
                  className="form-input"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Grid cell size (pixels)</label>
                <input
                  type="number"
                  value={newMapGridSize}
                  onChange={(e) => setNewMapGridSize(Number(e.target.value))}
                  style={styles.input}
                  className="form-input"
                  min={20}
                  max={200}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Quick map path</label>
                <select
                  value=""
                  onChange={(e) => handleMapPresetSelect(e.target.value)}
                  style={styles.select}
                  className="form-input touch-target"
                >
                  <option value="">Choose a preset...</option>
                  {MAP_IMPORT_PRESETS.map((preset) => (
                    <option key={preset.label} value={preset.label}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="/uploads/map.png, https://5e.tools/..., or https://..."
                  value={newMapImagePath}
                  onChange={(e) => setNewMapImagePath(e.target.value)}
                  style={styles.input}
                  className="form-input"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Choose Image File</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewMapFile(e.target.files[0])}
                  style={styles.fileInput}
                />
              </div>

              {loadError && (
                <div style={styles.modalError}>
                  <AlertCircle size={16} />
                  <span>{loadError}</span>
                </div>
              )}

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={handleCancelAddMap}
                  style={styles.btnCancel}
                  className="touch-target"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.btnSubmit}
                  className="touch-target btn-hover-scale"
                  disabled={!newMapName.trim() || isCreatingMap}
                >
                  {isCreatingMap ? "Creating..." : "Create Map"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TOKEN */}
      {showAddTokenModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard} className="glass-panel gold-border-glow">
            <h3 style={styles.modalTitle}> Add Token to VTT</h3>
            <form onSubmit={handleCreateToken} style={styles.form}>
              
              {user?.role === "DM" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Token Source Type</label>
                  <div style={styles.tokenTypeSelector}>
                    <button
                      type="button"
                      onClick={() => {
                        setTokenType("character");
                        setNewTokenIsMonster(false);
                      }}
                      style={{
                        ...styles.tokenTypeBtn,
                        border: tokenType === "character" ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.08)",
                        background: tokenType === "character" ? "var(--color-accent-dim)" : "transparent",
                        color: tokenType === "character" ? "var(--color-accent)" : "var(--color-text)",
                      }}
                      className="touch-target"
                    >
                      Player PC
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTokenType("npc");
                        setNewTokenIsMonster(false);
                      }}
                      style={{
                        ...styles.tokenTypeBtn,
                        border: tokenType === "npc" ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.08)",
                        background: tokenType === "npc" ? "var(--color-accent-dim)" : "transparent",
                        color: tokenType === "npc" ? "var(--color-accent)" : "var(--color-text)",
                      }}
                      className="touch-target"
                    >
                      Campaign NPC
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTokenType("monster");
                        setNewTokenIsMonster(true);
                      }}
                      style={{
                        ...styles.tokenTypeBtn,
                        border: tokenType === "monster" ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.08)",
                        background: tokenType === "monster" ? "var(--color-accent-dim)" : "transparent",
                        color: tokenType === "monster" ? "var(--color-accent)" : "var(--color-text)",
                      }}
                      className="touch-target"
                    >
                      Bestiary Monster
                    </button>
                  </div>
                </div>
              )}

              {user?.role === "DM" && tokenType === "monster" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Quick token presets</label>
                  <div style={styles.quickPresetGrid}>
                    {NPC_TOKEN_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleTokenPresetSelect(preset.label)}
                        style={styles.presetBtn}
                        className="touch-target btn-hover-scale"
                      >
                        <TokenPresetIcon label={preset.label} size={36} />
                        <span style={{ fontSize: "0.65rem", marginTop: "0.15rem" }}>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableCharacters.length > 0 && tokenType === "character" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Quick character tokens</label>
                  <div style={styles.quickPresetGrid}>
                    {availableCharacters
                      .filter(c => user?.role === "DM" || c.userId === user?.id)
                      .slice(0, 6)
                      .map((character) => (
                        <button
                          key={character.id}
                          type="button"
                          onClick={() => handleQuickCharacterToken(character)}
                          style={styles.presetBtn}
                          className="touch-target btn-hover-scale"
                        >
                          {character.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {tokenType === "character" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Link to Character Sheet</label>
                  <select
                    value={newTokenCharacterId}
                    onChange={(e) => setNewTokenCharacterId(e.target.value)}
                    style={styles.select}
                    className="form-input"
                    required
                  >
                    <option value="">-- Choose Character --</option>
                    {availableCharacters
                      .filter(c => user?.role === "DM" || c.userId === user?.id)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Lvl {c.level} {c.class})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {tokenType === "npc" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Link to NPC Sheet</label>
                  <select
                    value={newTokenNpcId}
                    onChange={(e) => setNewTokenNpcId(e.target.value)}
                    style={styles.select}
                    className="form-input"
                    required
                  >
                    <option value="">-- Choose NPC --</option>
                    {availableNpcs.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.name} (CR {n.cr} • {n.race})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tokenType === "monster" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Monster / NPC Label</label>
                  <Autocomplete
                    id="new-token-monster-select"
                    category="monsters"
                    placeholder="Search Bestiary e.g. Goblin, Orc..."
                    value={newTokenLabel}
                    onChange={(val) => setNewTokenLabel(val)}
                    onSelect={(monster) => {
                      setNewTokenLabel(monster.name);
                      setNewTokenStats(monster);
                      resolveMonsterTokenImage(monster);
                    }}
                    className="form-input"
                    inputStyle={styles.input}
                  />
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Token Avatar Image URL (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. https://website.com/goblin.png (or empty for initial avatar)"
                  value={newTokenImageUrl}
                  onChange={(e) => setNewTokenImageUrl(e.target.value)}
                  style={styles.input}
                  className="form-input"
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowAddTokenModal(false)}
                  style={styles.btnCancel}
                  className="touch-target"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.btnSubmit}
                  className="touch-target btn-hover-scale"
                >
                  Add Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles config
// ---------------------------------------------------------------------------
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "0.75rem",
    gap: "0.75rem",
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    background: "rgba(235, 87, 87, 0.12)",
    border: "1px solid var(--color-danger)",
    borderRadius: "6px",
    color: "var(--color-danger)",
    fontSize: "0.8rem",
    flexShrink: 0,
  },
  errorDismiss: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    color: "var(--color-danger)",
    cursor: "pointer",
    padding: "0.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "28px",
    minHeight: "28px",
  },
  tokenTypeSelector: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
  tokenTypeBtn: {
    flex: 1,
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
    flexShrink: 0,
  },
  headerTitleBox: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  title: {
    fontSize: "1.08rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  mapNameBadge: {
    fontSize: "0.75rem",
    color: "var(--color-text)",
    opacity: 0.8,
  },
  headerControls: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  dmMapSelector: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  select: {
    background: "rgba(10, 8, 20, 0.6)",
    border: "1px solid var(--color-border)",
    fontSize: "0.85rem",
    padding: "0.35rem 0.75rem",
    height: "44px",
    color: "var(--color-text)",
    borderRadius: "4px",
  },
  btnSmall: {
    border: "1px solid var(--color-border)",
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.08)",
    padding: "0.35rem 0.65rem",
    borderRadius: "7px",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 600,
    height: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
  },
  btnDangerSmall: {
    border: "1px solid var(--color-danger)",
    color: "var(--color-danger)",
    background: "rgba(235, 87, 87, 0.08)",
    padding: "0.35rem 0.65rem",
    borderRadius: "7px",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 600,
    height: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
  },
  status: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    background: "rgba(255, 255, 255, 0.05)",
    padding: "0.35rem 0.65rem",
    borderRadius: "4px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    height: "44px",
    display: "flex",
    alignItems: "center",
  },
  vttWorkspace: {
    flex: 1,
    position: "relative",
    borderRadius: "7px",
    overflow: "hidden",
    background: "var(--color-bg)",
  },
  canvas: {
    display: "block",
    width: "100%",
    height: "100%",
    cursor: "crosshair",
    touchAction: "none",
  },
  floatingToolbar: {
    position: "absolute",
    top: "12px",
    left: "12px",
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: "0.35rem",
    padding: "0.35rem",
    borderRadius: "8px",
    zIndex: 100,
    background: "rgba(12, 15, 18, 0.9)",
    maxWidth: "calc(100% - 24px)",
  },
  toolBtn: {
    minWidth: "48px",
    height: "48px",
    border: "1px solid transparent",
    borderRadius: "7px",
    color: "var(--color-text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.32rem",
    fontSize: "0.78rem",
    cursor: "pointer",
    background: "transparent",
    fontWeight: "bold",
    padding: "0 0.45rem",
  },
  divider: {
    width: "1px",
    height: "24px",
    background: "rgba(255, 255, 255, 0.1)",
    margin: "6px 4px",
  },
  floatingTokensControl: {
    position: "absolute",
    bottom: "12px",
    left: "12px",
    padding: "0.65rem",
    borderRadius: "8px",
    background: "rgba(12, 15, 18, 0.9)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    minWidth: "190px",
    maxWidth: "calc(100% - 24px)",
  },
  floatingFogActions: {
    position: "absolute",
    bottom: "12px",
    right: "12px",
    padding: "0.65rem",
    borderRadius: "8px",
    background: "rgba(12, 15, 18, 0.9)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    minWidth: "180px",
  },
  smallPanelHeader: {
    fontSize: "0.7rem",
    textTransform: "uppercase",
    color: "var(--color-accent)",
    fontWeight: 700,
    letterSpacing: "0.03em",
  },
  tokenActionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
  },
  btnAction: {
    flex: 1,
    minWidth: "72px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--color-text)",
    fontSize: "0.75rem",
    padding: "0.55rem",
    cursor: "pointer",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.3rem",
  },
  selectedTokenText: {
    color: "var(--color-text)",
    fontSize: "0.78rem",
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  finishShapeBtn: {
    marginTop: "0.25rem",
    width: "100%",
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    border: "none",
    color: "var(--color-bg)",
    fontWeight: "bold",
    borderRadius: "4px",
    fontSize: "0.75rem",
    padding: "0.35rem",
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  },
  modalCard: {
    maxWidth: "400px",
    width: "100%",
    maxHeight: "min(92vh, 720px)",
    borderRadius: "8px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    overflowY: "auto",
  },
  modalTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  formGroupRow: {
    display: "flex",
    alignItems: "center",
  },
  label: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  input: {
    width: "100%",
    fontSize: "0.85rem",
    padding: "0.5rem 0.75rem",
  },
  fileInput: {
    fontSize: "0.8rem",
    color: "var(--color-text)",
  },
  modalError: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    background: "rgba(235, 87, 87, 0.12)",
    border: "1px solid var(--color-danger)",
    borderRadius: "6px",
    color: "var(--color-danger)",
    fontSize: "0.8rem",
  },
  modalActions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  btnCancel: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: "0.5rem 1rem",
  },
  btnSubmit: {
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    border: "none",
    borderRadius: "4px",
    color: "var(--color-bg)",
    fontWeight: "bold",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: "0.5rem 1.25rem",
  },
  quickPresetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))",
    gap: "0.35rem",
  },
  presetBtn: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.35rem",
    minHeight: "44px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.15rem",
  },
  floatingTokenDetails: {
    position: "absolute",
    top: "12px",
    right: "12px",
    padding: "0.85rem",
    borderRadius: "8px",
    background: "rgba(10, 8, 20, 0.94)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    width: "260px",
    maxHeight: "60vh",
    overflowY: "auto",
  },
  combatStrip: {
    position: "absolute",
    left: "12px",
    right: "12px",
    top: "76px",
    zIndex: 90,
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.45rem",
    borderRadius: "6px",
    background: "rgba(10, 8, 20, 0.86)",
    overflowX: "auto",
  },
  combatStripMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
    minWidth: "130px",
    fontSize: "0.72rem",
    color: "var(--color-text)",
  },
  combatParticipants: {
    display: "flex",
    gap: "0.35rem",
    minWidth: 0,
  },
  combatPill: {
    position: "relative",
    minWidth: "96px",
    height: "44px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    overflow: "hidden",
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "0 0.45rem",
    flexShrink: 0,
  },
  combatPillName: {
    position: "relative",
    zIndex: 1,
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "var(--color-text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  combatPillHp: {
    position: "relative",
    zIndex: 1,
    fontSize: "0.65rem",
    color: "var(--color-muted)",
  },
  combatHpBar: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: "3px",
    background: "var(--color-success)",
  },
  encounterDrawer: {
    position: "absolute",
    top: "12px",
    right: "12px",
    bottom: "12px",
    zIndex: 180,
    width: "min(360px, calc(100% - 24px))",
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
    padding: "0.85rem",
    borderRadius: "8px",
    background: "rgba(10, 8, 20, 0.96)",
    overflowY: "auto",
  },
  encounterSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    paddingBottom: "0.55rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  encounterMetaBox: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    padding: "0.55rem",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.04)",
    fontSize: "0.8rem",
    color: "var(--color-text)",
  },
  encounterRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    minWidth: 0,
  },
  smallNumberInput: {
    width: "64px",
    minHeight: "44px",
    padding: "0.4rem",
    fontSize: "0.85rem",
  },
  checkboxLabel: {
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  encounterRoster: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  encounterRosterItem: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    padding: "0.5rem",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  rosterNameRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    fontSize: "0.78rem",
    color: "var(--color-text)",
  },
  rosterHp: {
    flex: 1,
    fontSize: "0.72rem",
    color: "var(--color-muted)",
  },
  encounterControls: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.45rem",
  },
  detailsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: "0.25rem",
    background: "transparent",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "0.95rem",
    cursor: "pointer",
    padding: "0.15rem",
  },
  detailsBody: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    fontSize: "0.8rem",
  },
  metaInfo: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    marginBottom: "0.25rem",
  },
  monsterSheet: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  hpTracker: {
    background: "rgba(235, 87, 87, 0.05)",
    border: "1px solid rgba(235, 87, 87, 0.2)",
    borderRadius: "4px",
    padding: "0.4rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  hpLabelRow: {
    fontSize: "0.75rem",
    fontWeight: "bold",
    color: "var(--color-danger)",
    textAlign: "center",
  },
  hpControlsRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.25rem",
  },
  hpAdjBtn: {
    flex: 1,
    padding: "0.25rem 0",
    fontSize: "0.7rem",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "3px",
    color: "var(--color-text)",
    cursor: "pointer",
  },
  miniStatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "0.2rem",
    textAlign: "center",
    background: "rgba(255,255,255,0.02)",
    padding: "0.35rem 0.15rem",
    borderRadius: "4px",
    fontSize: "0.65rem",
  },
  actionsSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    paddingTop: "0.4rem",
  },
  actionsHeader: {
    fontSize: "0.7rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    textTransform: "uppercase",
    marginBottom: "0.15rem",
  },
  monsterActionBtn: {
    padding: "0.45rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    borderRadius: "4px",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.75rem",
    textAlign: "left",
    fontWeight: "bold",
  },
};
