// =============================================================================
// Tablecast  Virtual Tabletop (VTT) Engine (Phase 5)
// Act as the VTT Engine Developer: HTML5 Canvas, touch events, and Fog of War.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import Autocomplete from "./Autocomplete";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const DRAG_THRESHOLD_PX = 9;

const MAP_IMPORT_PRESETS = [
  { label: "Blank 5 ft Grid", name: "Blank Encounter Grid", path: "/uploads/placeholder_map.png", gridSize: 50 },
  { label: "AitFR Adventurer Map", name: "AitFR Encounter Map", path: "/5etoolsimg/adventure/AitFR-AVT/13_1476395018.webp", gridSize: 70 },
  { label: "AitFR Dungeon Map", name: "AitFR Dungeon Map", path: "/5etoolsimg/adventure/AitFR-DN/16_1476395070.webp", gridSize: 70 },
];

const TOKEN_IMPORT_PRESETS = [
  { label: "Goblin", imageUrl: "/5etoolsimg/adventure/HotB/025-01-014.goblin-warrior-c.webp" },
  { label: "Goblin Boss", imageUrl: "/5etoolsimg/adventure/HotB/026-01-015.goblin-boss-c.webp" },
  { label: "Skeleton", imageUrl: "/5etoolsimg/adventure/DrDe/133-07-003.brandles-rest-skeleton.webp" },
  { label: "Bandit", imageUrl: "/5etoolsimg/adventure/BQGT/004-00-004.bandit.webp" },
];

export default function MapPanel({ user }) {
  const { socket, isConnected } = useSocket();

  // Map & token state
  const [mapsList, setMapsList] = useState([]);
  const [activeMap, setActiveMap] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [availableCharacters, setAvailableCharacters] = useState([]);
  const [availableNpcs, setAvailableNpcs] = useState([]);
  const [tokenType, setTokenType] = useState("character"); // "character", "npc", "monster"
  const [newTokenNpcId, setNewTokenNpcId] = useState("");

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

  const gridSize = activeMap?.gridSize || 50;
  const authHeaders = { "x-tablecast-user-id": String(user?.id || "") };
  const jsonAuthHeaders = { "Content-Type": "application/json", ...authHeaders };
  const withUser = (payload = {}) => ({ ...payload, userId: user?.id });

  // ---------------------------------------------------------------------------
  // Load data & initial socket listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadMaps();
    loadCharacters();
    loadNpcs();
  }, []);

  async function loadMaps(autoSelectId = null) {
    try {
      const res = await fetch("/api/maps");
      if (res.ok) {
        const data = await res.json();
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
      console.error("Failed to load maps list:", err);
    }
  }

  async function loadCharacters() {
    try {
      const res = await fetch("/api/characters");
      if (res.ok) {
        const data = await res.json();
        setAvailableCharacters(data);
      }
    } catch (err) {
      console.error("Failed to load characters list:", err);
    }
  }

  async function loadNpcs() {
    try {
      const res = await fetch("/api/npcs");
      if (res.ok) {
        const data = await res.json();
        setAvailableNpcs(data);
      }
    } catch (err) {
      console.error("Failed to load NPCs list:", err);
    }
  }

  async function fetchMapDetails(mapId) {
    try {
      const res = await fetch(`/api/maps/${mapId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveMap(data);
        setTokens(data.tokens || []);
        setMapImageLoaded(false);

        // Preload map background image
        const img = new Image();
        img.src = data.imageUrl;
        img.onload = () => {
          imageRef.current = img;
          setMapImageLoaded(true);
          resetViewport(img.width, img.height);
        };
        img.onerror = () => {
          imageRef.current = null;
          setMapImageLoaded(false);
        };
      }
    } catch (err) {
      console.error(`Failed to fetch map details for ID ${mapId}:`, err);
    }
  }

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
      if (selectedTokenId === payload.id) {
        setSelectedTokenId(null);
      }
    };

    // Fog of war was updated
    const handleFogUpdated = (payload) => {
      if (activeMap && activeMap.id === payload.mapId) {
        setActiveMap(prev => ({ ...prev, fogState: payload.fogState }));
      }
    };

    // A map was deleted
    const handleMapDeleted = (payload) => {
      const deletedId = Number(payload.mapId);
      setMapsList(prev => {
        const updated = prev.filter(m => m.id !== deletedId);
        // If the deleted map is the currently active map, select another one or clear
        if (activeMap && activeMap.id === deletedId) {
          if (updated.length > 0) {
            fetchMapDetails(updated[0].id);
          } else {
            setActiveMap(null);
            setTokens([]);
            imageRef.current = null;
            setMapImageLoaded(false);
          }
        }
        return updated;
      });
    };

    socket.on("map:selected", handleMapSelected);
    socket.on("token:moved", handleTokenMoved);
    socket.on("token:created", handleTokenCreated);
    socket.on("token:deleted", handleTokenDeleted);
    socket.on("fog:updated", handleFogUpdated);
    socket.on("map:deleted", handleMapDeleted);

    return () => {
      socket.off("map:selected", handleMapSelected);
      socket.off("token:moved", handleTokenMoved);
      socket.off("token:created", handleTokenCreated);
      socket.off("token:deleted", handleTokenDeleted);
      socket.off("fog:updated", handleFogUpdated);
      socket.off("map:deleted", handleMapDeleted);
    };
  }, [socket, activeMap]);

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
        ctx.fillStyle = "#181729";
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

          // Reveal paths
          oCtx.globalCompositeOperation = "destination-out";
          const polygons = parseFogState(activeMap.fogState);

          polygons.forEach(p => {
            if (p.type === "reveal" && p.points && p.points.length > 0) {
              oCtx.beginPath();
              oCtx.moveTo(p.points[0].x, p.points[0].y);
              for (let i = 1; i < p.points.length; i++) {
                oCtx.lineTo(p.points[i].x, p.points[i].y);
              }
              oCtx.closePath();
              oCtx.fillStyle = "black";
              oCtx.fill();
            }
          });

          // Re-cover hide paths
          oCtx.globalCompositeOperation = "source-over";
          polygons.forEach(p => {
            if (p.type === "hide" && p.points && p.points.length > 0) {
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
        ctx.strokeStyle = token.characterId ? "#c8973a" : "#eb5757";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Background backing fill
        ctx.fillStyle = "#1e1b38";
        ctx.beginPath();
        ctx.arc(px, py, radius - 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Image rendering with cropping
        const imgUrl = token.imageUrl || token.character?.imageUrl || token.npc?.imageUrl;
        let tokenImg = tokenImagesRef.current[token.id];

        if (imgUrl && !tokenImg) {
          const tImg = new Image();
          tImg.src = imgUrl;
          tImg.onload = () => {
            tokenImagesRef.current[token.id] = tImg;
            // Force redraw when image loads
            draw();
          };
        }

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

    draw();
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
  }, [activeMap]);

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
        const isDM = user?.role === "DM";
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
    setMousePosWorld({ x, y });

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

  const handleMapPresetSelect = (presetLabel) => {
    const preset = MAP_IMPORT_PRESETS.find((item) => item.label === presetLabel);
    if (!preset) return;

    setNewMapImagePath(preset.path);
    setNewMapGridSize(preset.gridSize);
    if (!newMapName.trim()) {
      setNewMapName(preset.name);
    }
  };

  const handleTokenPresetSelect = (presetLabel) => {
    const preset = TOKEN_IMPORT_PRESETS.find((item) => item.label === presetLabel);
    if (!preset) return;

    setNewTokenIsMonster(true);
    setNewTokenCharacterId("");
    setNewTokenLabel(preset.label);
    setNewTokenImageUrl(preset.imageUrl);
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
    fetchMapDetails(mapId);
  };

  const handleCreateMap = async (e) => {
    e.preventDefault();
    if (!newMapName.trim() || (!newMapFile && !newMapImagePath.trim())) return;

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
          
          // Re-load list and auto-select newly made map
          await loadMaps(map.id);
          
          // Broadcast select if DM
          if (user?.role === "DM" && socket && isConnected) {
            socket.emit("map:select", withUser({ mapId: map.id }));
          }
        }
      } catch (err) {
        console.error("Failed to create map:", err);
      }
    };

    if (newMapFile) {
      const reader = new FileReader();
      reader.readAsDataURL(newMapFile);
      reader.onload = () => submitMap(reader.result);
      reader.onerror = () => console.error("Failed to read map image file.");
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
    }

    if (!label) {
      alert("Please enter a token label or choose an option.");
      return;
    }

    try {
      const res = await fetch(`/api/maps/${activeMap.id}/tokens`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          characterId: charId,
          npcId,
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
        setNewTokenImageUrl("");
        setNewTokenStats(null);
        setTokenType("character");
      }
    } catch (err) {
      console.error("Failed to create token:", err);
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
    if (!confirm("Are you sure you want to delete this token?")) return;

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
    if (!confirm(`Are you sure you want to delete the map "${activeMap.name}"? This will also delete all tokens on this map.`)) return;

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
        alert(`Failed to delete map: ${errData.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Failed to delete map:", err);
      alert("Failed to delete map due to a network error.");
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
          <h2 style={styles.title}> Tacticians Grid (VTT)</h2>
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
                   New Map
                </button>
                <button
                  onClick={handleDeleteMap}
                  style={styles.btnDangerSmall}
                  className="btn-hover-scale glass-panel touch-target"
                  disabled={!activeMap}
                >
                   Delete
                </button>
              </>
            )}
          </div>

          <span style={styles.status}>
            {isConnected ? " Live Sync" : " Offline Mode"}
          </span>
        </div>
      </header>

      {/* Main Grid/Map Arena Workspace */}
      <div 
        ref={containerRef} 
        style={styles.vttWorkspace} 
        className="glass-panel gold-border-glow"
      >
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />

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
            🖐️ Move
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
                🌑 Mask
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
                👁️ Reveal
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
            ▦ Grid
          </button>

          <button
            onClick={() => handleZoom(0.15)}
            style={styles.toolBtn}
            title="Zoom In"
            className="touch-target btn-hover-scale"
          >
            ➕
          </button>
          
          <button
            onClick={() => handleZoom(-0.15)}
            style={styles.toolBtn}
            title="Zoom Out"
            className="touch-target btn-hover-scale"
          >
            ➖
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
            🎯 Fit
          </button>
        </div>

        {/* Floating Token and Utility control */}
        <div style={styles.floatingTokensControl} className="glass-panel">
          <h4 style={styles.smallPanelHeader}> Token Control</h4>
          {selectedTokenId && (
            <div style={styles.selectedTokenText}>
              Selected: {tokens.find((t) => t.id === selectedTokenId)?.label || "Token"}
            </div>
          )}
          <div style={styles.tokenActionRow}>
            <button
              onClick={() => setShowAddTokenModal(true)}
              style={styles.btnAction}
              className="btn-hover-scale touch-target"
            >
              Add Token
            </button>
            
            {selectedTokenId && (
              <button
                onClick={() => handleDeleteToken(selectedTokenId)}
                style={{ ...styles.btnAction, background: "var(--color-danger)" }}
                className="btn-hover-scale touch-target"
              >
                Delete
              </button>
            )}
            {selectedTokenId && (
              <button
                onClick={() => setSelectedTokenId(null)}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Floating Fog Actions for DM */}
        {user?.role === "DM" && (tool === "draw-fog" || tool === "reveal-fog") && (
          <div style={styles.floatingFogActions} className="glass-panel">
            <h4 style={styles.smallPanelHeader}> Fog Control</h4>
            <div style={styles.tokenActionRow}>
              <button
                onClick={handleUndoFog}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                Undo Last
              </button>
              <button
                onClick={() => handleClearFog(false)}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
                Mask All
              </button>
              <button
                onClick={() => handleClearFog(true)}
                style={styles.btnAction}
                className="btn-hover-scale touch-target"
              >
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
                  <h4 style={styles.smallPanelHeader}> Selected Token</h4>
                  <button onClick={() => setSelectedTokenId(null)} style={styles.closeBtn}>✕</button>
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
                                key={i}
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
                  {monsterStats && (
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
                                key={i}
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
                  )}
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
                  placeholder="/uploads/map.png, /5etoolsimg/..., or https://..."
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

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowAddMapModal(false)}
                  style={styles.btnCancel}
                  className="touch-target"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.btnSubmit}
                  className="touch-target btn-hover-scale"
                  disabled={!newMapName.trim() || (!newMapFile && !newMapImagePath.trim())}
                >
                  Create Map
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
                    {TOKEN_IMPORT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleTokenPresetSelect(preset.label)}
                        style={styles.presetBtn}
                        className="touch-target btn-hover-scale"
                      >
                        {preset.label}
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
    padding: "1rem",
    gap: "1rem",
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
    fontSize: "1.25rem",
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
    gap: "0.75rem",
    flexWrap: "wrap",
  },
  dmMapSelector: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
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
    borderRadius: "4px",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 600,
    height: "44px",
    display: "flex",
    alignItems: "center",
  },
  btnDangerSmall: {
    border: "1px solid var(--color-danger)",
    color: "var(--color-danger)",
    background: "rgba(235, 87, 87, 0.08)",
    padding: "0.35rem 0.65rem",
    borderRadius: "4px",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 600,
    height: "44px",
    display: "flex",
    alignItems: "center",
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
    borderRadius: "8px",
    overflow: "hidden",
    background: "#08070e",
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
    borderRadius: "6px",
    zIndex: 100,
    background: "rgba(10, 8, 20, 0.88)",
    maxWidth: "calc(100% - 24px)",
  },
  toolBtn: {
    minWidth: "48px",
    height: "48px",
    border: "1px solid transparent",
    borderRadius: "4px",
    color: "var(--color-text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: "6px",
    background: "rgba(10, 8, 20, 0.88)",
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
    borderRadius: "6px",
    background: "rgba(10, 8, 20, 0.88)",
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
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    color: "#0f0e17",
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
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    borderRadius: "4px",
    color: "#0f0e17",
    fontWeight: "bold",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: "0.5rem 1.25rem",
  },
  quickPresetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
    gap: "0.4rem",
  },
  presetBtn: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.45rem",
    minHeight: "44px",
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
    color: "#eb5757",
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
