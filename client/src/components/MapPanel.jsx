// =============================================================================
// Tablecast — Virtual Tabletop (VTT) Engine (Phase 5)
// Act as the VTT Engine Developer: HTML5 Canvas, touch events, and Fog of War.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";

export default function MapPanel({ user }) {
  const { socket, isConnected } = useSocket();

  // Map & token state
  const [mapsList, setMapsList] = useState([]);
  const [activeMap, setActiveMap] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [availableCharacters, setAvailableCharacters] = useState([]);

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
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [newTokenCharacterId, setNewTokenCharacterId] = useState("");
  const [newTokenImageUrl, setNewTokenImageUrl] = useState("");
  const [newTokenIsMonster, setNewTokenIsMonster] = useState(false);

  // Refs for HTML elements & drawing loop
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [mapImageLoaded, setMapImageLoaded] = useState(false);
  const tokenImagesRef = useRef({}); // tokenId -> Image instance cache

  const gridSize = activeMap?.gridSize || 50;

  // ---------------------------------------------------------------------------
  // Load data & initial socket listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadMaps();
    loadCharacters();
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
    
    const scaleX = canvas.width / imgW;
    const scaleY = canvas.height / imgH;
    const fitScale = Math.min(scaleX, scaleY, 1.0) * 0.95; // fits nicely with margins

    setZoom(fitScale);
    setPanOffset({
      x: (canvas.width - imgW * fitScale) / 2,
      y: (canvas.height - imgH * fitScale) / 2
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

    socket.on("map:selected", handleMapSelected);
    socket.on("token:moved", handleTokenMoved);
    socket.on("token:created", handleTokenCreated);
    socket.on("token:deleted", handleTokenDeleted);
    socket.on("fog:updated", handleFogUpdated);

    return () => {
      socket.off("map:selected", handleMapSelected);
      socket.off("token:moved", handleTokenMoved);
      socket.off("token:created", handleTokenCreated);
      socket.off("token:deleted", handleTokenDeleted);
      socket.off("fog:updated", handleFogUpdated);
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
        const imgUrl = token.imageUrl || token.character?.imageUrl;
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
          const label = token.label || token.character?.name || "T";
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

  const handleStart = (clientX, clientY) => {
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
      if (user?.role === "DM") {
        setIsDrawing(true);
        setCurrentPolygon(prev => [...prev, { x, y }]);
      }
    }
  };

  const handleMove = (clientX, clientY) => {
    const { x, y, screenX, screenY } = getWorldCoordinates(clientX, clientY);
    setMousePosWorld({ x, y });

    if (dragState) {
      setDragState(prev => ({
        ...prev,
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

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  const handleZoom = (amount) => {
    setZoom(prev => Math.max(0.1, Math.min(prev + amount, 3.0)));
  };

  const handleSelectMap = (mapId) => {
    if (user?.role === "DM" && socket && isConnected) {
      socket.emit("map:select", { mapId });
    }
    fetchMapDetails(mapId);
  };

  const handleCreateMap = async (e) => {
    e.preventDefault();
    if (!newMapName.trim() || !newMapFile) return;

    // Read the map background as base64
    const reader = new FileReader();
    reader.readAsDataURL(newMapFile);
    reader.onload = async () => {
      try {
        const res = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newMapName,
            gridSize: newMapGridSize,
            gridType: "SQUARE",
            imageData: reader.result
          })
        });

        if (res.ok) {
          const map = await res.json();
          setShowAddMapModal(false);
          setNewMapName("");
          setNewMapFile(null);
          
          // Re-load list and auto-select newly made map
          await loadMaps(map.id);
          
          // Broadcast select if DM
          if (user?.role === "DM" && socket && isConnected) {
            socket.emit("map:select", { mapId: map.id });
          }
        }
      } catch (err) {
        console.error("Failed to create map:", err);
      }
    };
  };

  const handleCreateToken = async (e) => {
    e.preventDefault();
    if (!activeMap) return;

    let label = newTokenLabel.trim();
    let imageUrl = newTokenImageUrl.trim();
    let charId = null;

    if (!newTokenIsMonster && newTokenCharacterId) {
      const char = availableCharacters.find(c => c.id === Number(newTokenCharacterId));
      if (char) {
        label = char.name;
        charId = char.id;
      }
    }

    if (!label) {
      alert("Please enter a token label or choose a character.");
      return;
    }

    try {
      const res = await fetch(`/api/maps/${activeMap.id}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: charId,
          label,
          imageUrl,
          x: 0,
          y: 0
        })
      });

      if (res.ok) {
        const token = await res.json();
        
        // Notify socket peers
        if (socket && isConnected) {
          socket.emit("token:create", token);
        } else {
          setTokens(prev => [...prev, token]);
        }

        setShowAddTokenModal(false);
        setNewTokenLabel("");
        setNewTokenCharacterId("");
        setNewTokenImageUrl("");
      }
    } catch (err) {
      console.error("Failed to create token:", err);
    }
  };

  const handleDeleteToken = async (tokenId) => {
    if (!confirm("Are you sure you want to delete this token?")) return;

    try {
      const res = await fetch(`/api/maps/tokens/${tokenId}`, {
        method: "DELETE"
      });

      if (res.ok) {
        if (socket && isConnected) {
          socket.emit("token:delete", { id: tokenId });
        } else {
          setTokens(prev => prev.filter(t => t.id !== tokenId));
        }
        setSelectedTokenId(null);
      }
    } catch (err) {
      console.error("Failed to delete token:", err);
    }
  };

  const handleUndoFog = () => {
    if (!activeMap || user?.role !== "DM") return;
    const polys = parseFogState(activeMap.fogState);
    if (polys.length === 0) return;
    
    const updated = polys.slice(0, polys.length - 1);
    if (socket && isConnected) {
      socket.emit("fog:update", { mapId: activeMap.id, fogState: updated });
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
      socket.emit("fog:update", { mapId: activeMap.id, fogState: updated });
    }
  };

  const handleFinishFogPolygon = () => {
    if (currentPolygon.length > 2) {
      const newPoly = {
        type: tool === "draw-fog" ? "hide" : "reveal",
        points: currentPolygon
      };
      
      const parsedFog = parseFogState(activeMap.fogState);
      const updatedFog = [...parsedFog, newPoly];

      if (socket && isConnected) {
        socket.emit("fog:update", {
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
          <h2 style={styles.title}>🗺️ Tacticians Grid (VTT)</h2>
          {activeMap && (
            <span style={styles.mapNameBadge}>
              Active: {activeMap.name} ({activeMap.gridSize}px Grid)
            </span>
          )}
        </div>
        
        <div style={styles.headerControls}>
          {/* DM-only Map selector */}
          {user?.role === "DM" && (
            <div style={styles.dmMapSelector}>
              <select
                value={activeMap?.id || ""}
                onChange={(e) => handleSelectMap(Number(e.target.value))}
                style={styles.select}
                className="form-input"
              >
                {mapsList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowAddMapModal(true)}
                style={styles.btnSmall}
                className="btn-hover-scale glass-panel touch-target"
              >
                ➕ New Map
              </button>
            </div>
          )}

          <span style={styles.status}>
            {isConnected ? "🟢 Live Sync" : "🔴 Offline Mode"}
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
          
          onTouchStart={(e) => {
            if (e.touches.length > 0) {
              const t = e.touches[0];
              handleStart(t.clientX, t.clientY);
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length > 0) {
              const t = e.touches[0];
              handleMove(t.clientX, t.clientY);
            }
          }}
          onTouchEnd={handleEnd}
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
                  setTool("draw-fog");
                  setCurrentPolygon([]);
                }}
                style={{
                  ...styles.toolBtn,
                  background: tool === "draw-fog" ? "var(--color-accent-dim)" : "transparent",
                  borderColor: tool === "draw-fog" ? "var(--color-accent)" : "rgba(255,255,255,0.05)"
                }}
                title="Draw Fog (Hide area)"
                className="touch-target btn-hover-scale"
              >
                🥷 Mask
              </button>
              
              <button
                onClick={() => {
                  setTool("reveal-fog");
                  setCurrentPolygon([]);
                }}
                style={{
                  ...styles.toolBtn,
                  background: tool === "reveal-fog" ? "var(--color-accent-dim)" : "transparent",
                  borderColor: tool === "reveal-fog" ? "var(--color-accent)" : "rgba(255,255,255,0.05)"
                }}
                title="Reveal Fog (Carve hole)"
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
            # Grid
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
            🔄
          </button>
        </div>

        {/* Floating Token and Utility control */}
        <div style={styles.floatingTokensControl} className="glass-panel">
          <h4 style={styles.smallPanelHeader}>⚔️ Token Control</h4>
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
                Delete Selected
              </button>
            )}
          </div>
        </div>

        {/* Floating Fog Actions for DM */}
        {user?.role === "DM" && (tool === "draw-fog" || tool === "reveal-fog") && (
          <div style={styles.floatingFogActions} className="glass-panel">
            <h4 style={styles.smallPanelHeader}>🌫️ Fog Control</h4>
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
                ✅ Finish Shape ({currentPolygon.length} pts)
              </button>
            )}
          </div>
        )}
      </div>

      {/* MODAL: ADD MAP */}
      {showAddMapModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard} className="glass-panel gold-border-glow">
            <h3 style={styles.modalTitle}>⚔️ Upload Campaign Map</h3>
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
                <label style={styles.label}>Choose Image File</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewMapFile(e.target.files[0])}
                  style={styles.fileInput}
                  required
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
            <h3 style={styles.modalTitle}>🛡️ Add Token to VTT</h3>
            <form onSubmit={handleCreateToken} style={styles.form}>
              
              {user?.role === "DM" && (
                <div style={styles.formGroupRow}>
                  <label style={{ ...styles.label, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={newTokenIsMonster}
                      onChange={(e) => setNewTokenIsMonster(e.target.checked)}
                      style={{ marginRight: "0.5rem" }}
                    />
                    Generic Monster / NPC Token
                  </label>
                </div>
              )}

              {(!newTokenIsMonster && user?.role === "DM") || user?.role === "PLAYER" ? (
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
              ) : (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Monster / NPC Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Goblin Archer, Orc Chieftain..."
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    style={styles.input}
                    className="form-input"
                    required
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
    height: "36px",
    color: "var(--color-text)",
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
    height: "36px",
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
    height: "36px",
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
    gap: "0.25rem",
    padding: "0.35rem",
    borderRadius: "6px",
    zIndex: 100,
    background: "rgba(10, 8, 20, 0.88)",
  },
  toolBtn: {
    width: "36px",
    height: "36px",
    border: "1px solid transparent",
    borderRadius: "4px",
    color: "var(--color-text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.85rem",
    cursor: "pointer",
    background: "transparent",
    fontWeight: "bold",
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
    minWidth: "160px",
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
    gap: "0.35rem",
  },
  btnAction: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--color-text)",
    fontSize: "0.75rem",
    padding: "0.35rem",
    cursor: "pointer",
    fontWeight: 600,
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
    borderRadius: "8px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
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
};
