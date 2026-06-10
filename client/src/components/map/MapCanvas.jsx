// =============================================================================
// MapCanvas — Canvas rendering for grid, fog, and tokens
// =============================================================================
import { useEffect, useRef } from "react";
import { parseFogState } from "./MapConstants";

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
}) {
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

        if (selectedTokenId === token.id) {
          ctx.strokeStyle = "var(--color-accent)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
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
