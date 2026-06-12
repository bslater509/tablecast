// =============================================================================
// MapCanvas — Canvas rendering for grid, fog, and tokens
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { parseFogState } from "./MapConstants";
import { parseWalls, computeAllVision } from "../../utils/dynamicLighting";

export default function MapCanvas({
  canvasRef,
  containerRef,
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
  imageRef,
  tokenImagesRef,
  gridSize,
  user,
  isDrawing,
  setIsDrawing,
  setCurrentPolygon,
  setMousePosWorld,
  setIsPanning,
  setPanStart,
  setPanOffset,
  setZoom,
  setSelectedTokenId,
  setDragState,
  socket,
  isConnected,
  setTokens,
  pendingMovesRef,
  drawRafIdRef,
  triggerRedrawRef,
  handleStart,
  handleMove,
  handleEnd,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,

  // Pings (ephemeral map markers)
  pings,
  // Ruler tool props
  rulerPoints,
  rulerHoverPos,
  tool,
  // Dynamic lighting
  showLighting,
}) {

  // Parse conditions JSON string
  function parseConditions(condStr) {
    try { return JSON.parse(condStr || "[]"); } catch { return []; }
  }

  // Condition color mapping
  const CONDITION_COLORS = {
    "Blinded": "#94a3b8",
    "Charmed": "#f472b6",
    "Deafened": "#64748b",
    "Frightened": "#a78bfa",
    "Grappled": "#fb923c",
    "Incapacitated": "#6b7280",
    "Invisible": "#c084fc",
    "Paralyzed": "#fbbf24",
    "Petrified": "#9ca3af",
    "Poisoned": "#22c55e",
    "Prone": "#eab308",
    "Restrained": "#f97316",
    "Stunned": "#38bdf8",
    "Unconscious": "#64748b",
    "Exhaustion": "#ef4444",
  };
  const DEFAULT_COND_COLOR = "#a855f7";

  // Token aura colors (pre-defined)
  const AURA_COLORS = {
    "fire": "#ef4444",
    "cold": "#3b82f6",
    "lightning": "#eab308",
    "poison": "#22c55e",
    "necrotic": "#a855f7",
    "radiant": "#fbbf24",
    "psychic": "#ec4899",
    "thunder": "#6366f1",
    "acid": "#84cc16",
    "force": "#c084fc",
  };

  // Compute total distance along ruler points
  function computeDistance(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i-1].x;
      const dy = pts[i].y - pts[i-1].y;
      total += Math.hypot(dx, dy);
    }
    return total;
  }

  // Format distance in grid squares
  function formatDistance(px, grid) {
    const squares = px / grid;
    return squares.toFixed(1) + " sq (" + Math.round(px) + " px)";
  }
  // ---------------------------------------------------------------------------
  // Canvas Drawing Loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();

      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoom, zoom);

      const imgW = imageRef.current ? imageRef.current.width : 1000;
      const imgH = imageRef.current ? imageRef.current.height : 800;

      // 1. Draw background image
      if (mapImageLoaded && imageRef.current) {
        ctx.drawImage(imageRef.current, 0, 0);
      } else {
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

        ctx.fillStyle = "rgba(200, 151, 58, 0.5)";
        ctx.font = "bold 10px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let x = 0; x <= imgW; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, imgH);
          ctx.stroke();

          const colIndex = Math.floor(x / gridSize);
          if (x + gridSize / 2 < imgW) {
            const letter = String.fromCharCode(65 + (colIndex % 26)) + (colIndex >= 26 ? Math.floor(colIndex / 26) : "");
            ctx.fillText(letter, x + gridSize / 2, 12);
          }
        }

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
          oCtx.fillStyle = "#08080c";
          oCtx.fillRect(0, 0, imgW, imgH);

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

          ctx.save();
          ctx.globalAlpha = user?.role === "DM" ? 0.58 : 1.0;
          ctx.drawImage(offscreen, 0, 0);
          ctx.restore();
        }
      }

      // 4. Render Dynamic Lighting overlay
      if (showLighting && activeMap && user?.role === "DM") {
        const walls = parseWalls(activeMap.walls);
        if (walls.length > 0) {
          const visionPolygons = computeAllVision(tokens, walls, gridSize);
          if (visionPolygons.length > 0) {
            const offscreen2 = document.createElement("canvas");
            offscreen2.width = imgW;
            offscreen2.height = imgH;
            const o2Ctx = offscreen2.getContext("2d");
            if (o2Ctx) {
              o2Ctx.fillStyle = "#000";
              o2Ctx.fillRect(0, 0, imgW, imgH);
              // Cut out visible areas
              o2Ctx.globalCompositeOperation = "destination-out";
              o2Ctx.fillStyle = "black";
              visionPolygons.forEach(poly => {
                if (poly.length >= 3) {
                  o2Ctx.beginPath();
                  o2Ctx.moveTo(poly[0].x, poly[0].y);
                  for (let i = 1; i < poly.length; i++) {
                    o2Ctx.lineTo(poly[i].x, poly[i].y);
                  }
                  o2Ctx.closePath();
                  o2Ctx.fill();
                }
              });
              ctx.save();
              ctx.globalAlpha = 0.55;
              ctx.drawImage(offscreen2, 0, 0);
              ctx.restore();
            }
          }
        }
      }

      // 5.5 Render Ruler Tool
      if (tool === "ruler" && rulerPoints && rulerPoints.length > 0) {
        const pts = rulerPoints;
        ctx.save();

        // Draw line segments
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        // Draw preview line to mouse position
        if (rulerHoverPos && pts.length > 0) {
          ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          ctx.lineTo(rulerHoverPos.x, rulerHoverPos.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw point markers
        ctx.fillStyle = "#fbbf24";
        pts.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
          ctx.fill();
        });
        if (rulerHoverPos) {
          ctx.fillStyle = "rgba(251, 191, 36, 0.5)";
          ctx.beginPath();
          ctx.arc(rulerHoverPos.x, rulerHoverPos.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw distance labels at midpoint of each segment
        ctx.font = "bold 13px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        let totalPx = 0;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i-1].x;
          const dy = pts[i].y - pts[i-1].y;
          const segLen = Math.hypot(dx, dy);
          totalPx += segLen;
          const mx = (pts[i-1].x + pts[i].x) / 2;
          const my = (pts[i-1].y + pts[i].y) / 2;

          ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
          ctx.fillRect(mx - 45, my - 14, 90, 18);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 1;
          ctx.strokeRect(mx - 45, my - 14, 90, 18);

          ctx.fillStyle = "#fbbf24";
          ctx.fillText(formatDistance(segLen, gridSize), mx, my - 2);
        }

        // Draw total distance at the end
        if (pts.length >= 2) {
          const lastPt = rulerHoverPos || pts[pts.length - 1];
          const finalDx = lastPt.x - pts[0].x;
          const finalDy = lastPt.y - pts[0].y;
          const totalPixels = totalPx + (rulerHoverPos ? Math.hypot(lastPt.x - pts[pts.length - 1].x, lastPt.y - pts[pts.length - 1].y) : 0);
          const directPixels = Math.hypot(finalDx, finalDy);

          ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          ctx.fillRect(lastPt.x - 70, lastPt.y - 32, 140, 28);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 1;
          ctx.strokeRect(lastPt.x - 70, lastPt.y - 32, 140, 28);

          ctx.fillStyle = "#fbbf24";
          ctx.font = "bold 11px Segoe UI";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(`Path: ${formatDistance(totalPixels, gridSize)}`, lastPt.x, lastPt.y - 18);
          ctx.fillText(`Direct: ${formatDistance(directPixels, gridSize)}`, lastPt.x, lastPt.y - 6);
        }

        ctx.restore();
      }

      // 6. Render Active Fog Shape currently being drawn
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

        ctx.fillStyle = "var(--color-accent)";
        currentPolygon.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // 4.5 Render Token Auras (before tokens so they appear underneath)
      tokens.forEach(token => {
        const auraR = Number(token.auraRadius) || 0;
        if (auraR > 0) {
          let px, py;
          if (dragState && dragState.tokenId === token.id) {
            px = dragState.currentWorldPos.x;
            py = dragState.currentWorldPos.y;
          } else {
            px = (token.x + 0.5) * gridSize;
            py = (token.y + 0.5) * gridSize;
          }
          const auraColor = token.auraColor || AURA_COLORS.poison;
          ctx.save();
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = auraColor;
          ctx.beginPath();
          ctx.arc(px, py, auraR, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = auraColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      });

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

        if (selectedTokenId === token.id) {
          ctx.strokeStyle = "var(--color-accent)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // ── Condition Rings ──
        const conditions = parseConditions(token.conditions);
        if (conditions.length > 0) {
          const ringRadius = radius + 2;
          const sliceAngle = (Math.PI * 2) / conditions.length;
          conditions.forEach((cond, idx) => {
            const startAngle = idx * sliceAngle - Math.PI / 2;
            const endAngle = startAngle + sliceAngle - 0.05;
            const condColor = CONDITION_COLORS[cond.name] || cond.color || DEFAULT_COND_COLOR;
            ctx.save();
            ctx.strokeStyle = condColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(px, py, ringRadius, startAngle, endAngle);
            ctx.stroke();
            ctx.restore();
          });
        }

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 4;

        ctx.strokeStyle = token.characterId ? "var(--color-accent)" : "var(--color-danger)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = "var(--color-surface)";
        ctx.beginPath();
        ctx.arc(px, py, radius - 1.5, 0, Math.PI * 2);
        ctx.fill();

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
          ctx.fillStyle = "var(--color-text)";
          ctx.font = "bold 13px Segoe UI";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = token.label || token.character?.name || token.npc?.name || "T";
          ctx.fillText(label.charAt(0).toUpperCase(), px, py);
        }

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

      // 7. Render Pings (ephemeral map markers)
      if (pings && pings.length > 0) {
        const now = Date.now();
        const PING_COLORS = { move: "#3b82f6", attack: "#ef4444", look: "#22c55e", danger: "#eab308" };
        const PING_GLOW_COLORS = { move: "#93c5fd", attack: "#fca5a5", look: "#86efac", danger: "#fde68a" };
        pings.forEach((ping) => {
          const elapsed = now - ping.timestamp;
          if (elapsed > 3500) return;

          const px = ping.x * gridSize + gridSize / 2;
          const py = ping.y * gridSize + gridSize / 2;
          const progress = elapsed / 3500; // 0 to 1
          const radius = 10 + progress * 30; // expands from 10 to 40px
          const alpha = 1 - progress; // fades out
          const type = ping.type || "look";
          const color = PING_COLORS[type] || PING_COLORS.look;
          const glowColor = PING_GLOW_COLORS[type] || PING_GLOW_COLORS.look;

          ctx.save();

          // Outer glow circle
          ctx.beginPath();
          ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = alpha * 0.3;
          ctx.stroke();

          // Expanding ring
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.globalAlpha = alpha * 0.7;
          ctx.stroke();

          // Inner glow dot
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fillStyle = glowColor;
          ctx.globalAlpha = alpha * 0.5;
          ctx.fill();

          // Inner solid dot
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha * 0.9;
          ctx.fill();

          // Sender label above ring
          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.font = "bold 11px Segoe UI";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const labelText = ping.sender || "";
          const labelWidth = ctx.measureText(labelText).width;
          ctx.fillRect(px - labelWidth / 2 - 4, py - radius - 18, labelWidth + 8, 16);
          ctx.fillStyle = color;
          ctx.fillText(labelText, px, py - radius - 6);

          ctx.restore();
        });
      }

      ctx.restore();
    };

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
    activeMap, tokens, zoom, panOffset, showGrid, dragState,
    selectedTokenId, currentPolygon, mousePosWorld, mapImageLoaded, user,
    canvasRef, imageRef, tokenImagesRef, gridSize, drawRafIdRef, triggerRedrawRef,
    rulerPoints, rulerHoverPos, tool, showLighting, pings,
  ]);

  // ---------------------------------------------------------------------------
  // Preload token images
  // ---------------------------------------------------------------------------
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
  }, [tokens, tokenImagesRef, triggerRedrawRef]);

  // ---------------------------------------------------------------------------
  // Canvas resize handler
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      if (triggerRedrawRef.current) triggerRedrawRef.current();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [canvasRef, triggerRedrawRef]);

  // ---------------------------------------------------------------------------
  // Keyboard pan/zoom shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleKeyDown = (e) => {
      const step = 50;
      switch (e.key) {
        case "ArrowUp": setPanOffset(p => ({ ...p, y: p.y + step })); break;
        case "ArrowDown": setPanOffset(p => ({ ...p, y: p.y - step })); break;
        case "ArrowLeft": setPanOffset(p => ({ ...p, x: p.x + step })); break;
        case "ArrowRight": setPanOffset(p => ({ ...p, x: p.x - step })); break;
        case "=": case "+": setZoom(z => Math.min(z + 0.1, 3)); break;
        case "-": setZoom(z => Math.max(z - 0.1, 0.1)); break;
      }
    };

    canvas.addEventListener("keydown", handleKeyDown);
    return () => canvas.removeEventListener("keydown", handleKeyDown);
  }, [canvasRef, setPanOffset, setZoom]);

  return (
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
      onTouchCancel={handleTouchEnd}
    />
  );
}

const styles = {
  canvas: {
    width: "100%",
    height: "100%",
    display: "block",
    cursor: "inherit",
    outline: "none",
  },
};
