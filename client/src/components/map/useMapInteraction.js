// =============================================================================
// useMapInteraction — Zoom, pan, drag, touch/gesture handlers
// =============================================================================
import { useRef, useCallback } from "react";
import { MIN_ZOOM, MAX_ZOOM, DRAG_THRESHOLD_PX } from "./MapConstants";
import { canMoveToken } from "../../utils/authHeaders";

export default function useMapInteraction({
  // State values
  tool, zoom, panOffset, isDrawing, isPanning, panStart, dragState, currentPolygon,
  tokens, gridSize, user, isDM, activeMap,
  // Setters
  setZoom, setPanOffset, setSelectedTokenId, setDragState,
  setIsPanning, setPanStart, setIsDrawing, setCurrentPolygon, setMousePosWorld,
  // Refs
  canvasRef, imageRef, gestureRef, pendingMovesRef,
  // Socket
  socket, isConnected, setTokens,
}) {
  const getWorldCoordinates = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom,
      screenX,
      screenY,
    };
  }, [canvasRef, panOffset, zoom]);

  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const getTouchMidpoint = (touches) => ({
    clientX: (touches[0].clientX + touches[1].clientX) / 2,
    clientY: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const applyZoomAt = useCallback((nextZoom, clientX, clientY) => {
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
  }, [canvasRef, panOffset, zoom, setZoom, setPanOffset]);

  const handleStart = useCallback((clientX, clientY, options = {}) => {
    const { x, y, screenX, screenY } = getWorldCoordinates(clientX, clientY);
    setMousePosWorld({ x, y });

    if (tool === "select") {
      const hitToken = tokens.find(token => {
        const tx = (token.x + 0.5) * gridSize;
        const ty = (token.y + 0.5) * gridSize;
        const radius = gridSize * 0.42;
        const dx = x - tx;
        const dy = y - ty;
        return dx * dx + dy * dy < radius * radius;
      });

      if (hitToken) {
        const isOwner = canMoveToken(hitToken, user, false);
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
              y: y - (hitToken.y + 0.5) * gridSize,
            },
          });
        }
      } else {
        setIsPanning(true);
        setSelectedTokenId(null);
        setPanStart({
          x: screenX - panOffset.x,
          y: screenY - panOffset.y,
        });
      }
    } else if (tool === "draw-fog" || tool === "reveal-fog") {
      if (user?.role === "DM" && activeMap) {
        setIsDrawing(true);
        setCurrentPolygon(prev => [...prev, { x, y }]);
      }
    }
  }, [getWorldCoordinates, tool, tokens, gridSize, user, isDM, activeMap,
      setMousePosWorld, setSelectedTokenId, setDragState, setIsPanning,
      setPanStart, setIsDrawing, setCurrentPolygon, panOffset]);

  const handleMove = useCallback((clientX, clientY) => {
    const { x, y, screenX, screenY } = getWorldCoordinates(clientX, clientY);

    if (isDrawing) {
      setMousePosWorld({ x, y });
    }

    if (dragState) {
      setDragState(prev => {
        if (prev.pending) {
          const dx = screenX - prev.startScreenPos.x;
          const dy = screenY - prev.startScreenPos.y;
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return prev;
        }

        return {
          ...prev,
          pending: false,
          currentWorldPos: {
            x: x - prev.offset.x,
            y: y - prev.offset.y,
          },
        };
      });
    } else if (isPanning) {
      setPanOffset({
        x: screenX - panStart.x,
        y: screenY - panStart.y,
      });
    }
  }, [getWorldCoordinates, isDrawing, dragState, isPanning, panStart,
      setMousePosWorld, setDragState, setPanOffset]);

  const handleEnd = useCallback(() => {
    if (dragState) {
      if (dragState.pending) {
        setDragState(null);
        return;
      }

      const px = dragState.currentWorldPos.x;
      const py = dragState.currentWorldPos.y;

      const col = Math.round(px / gridSize - 0.5);
      const row = Math.round(py / gridSize - 0.5);

      const imgW = imageRef.current ? imageRef.current.width : 1000;
      const imgH = imageRef.current ? imageRef.current.height : 800;
      const maxCol = Math.max(0, Math.floor(imgW / gridSize) - 1);
      const maxRow = Math.max(0, Math.floor(imgH / gridSize) - 1);

      const clampedCol = Math.max(0, Math.min(col, maxCol));
      const clampedRow = Math.max(0, Math.min(row, maxRow));

      if (socket && isConnected) {
        socket.emit("token:move", {
          userId: user?.id,
          id: dragState.tokenId,
          x: clampedCol,
          y: clampedRow,
        });
      } else {
        setTokens(prev => prev.map(t =>
          t.id === dragState.tokenId ? { ...t, x: clampedCol, y: clampedRow } : t
        ));
        if (pendingMovesRef) {
          pendingMovesRef.current.push({
            tokenId: dragState.tokenId,
            x: clampedCol,
            y: clampedRow,
          });
        }
      }

      setDragState(null);
    }

    if (isPanning) {
      setIsPanning(false);
    }
  }, [dragState, isPanning, gridSize, imageRef, socket, isConnected, user,
      setDragState, setIsPanning, setTokens, pendingMovesRef]);

  const handleTouchStart = useCallback((e) => {
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
  }, [zoom, gestureRef, setDragState, setIsPanning, handleStart]);

  const handleTouchMove = useCallback((e) => {
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
  }, [gestureRef, applyZoomAt, handleMove]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();

    if (e.touches.length === 0) {
      gestureRef.current = null;
      handleEnd();
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      gestureRef.current = null;
      handleStart(t.clientX, t.clientY, { isTouch: true });
    }
  }, [gestureRef, handleEnd, handleStart]);

  const handleZoom = useCallback((amount) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setZoom(prev => Math.max(MIN_ZOOM, Math.min(prev + amount, MAX_ZOOM)));
      return;
    }
    const rect = canvas.getBoundingClientRect();
    applyZoomAt(zoom + amount, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [canvasRef, zoom, setZoom, applyZoomAt]);

  const fitView = useCallback(() => {
    if (imageRef.current) {
      const imgW = imageRef.current.width;
      const imgH = imageRef.current.height;
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
  }, [imageRef, canvasRef, setZoom, setPanOffset]);

  return {
    handleStart,
    handleMove,
    handleEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleZoom,
    fitView,
    applyZoomAt,
    getWorldCoordinates,
  };
}
