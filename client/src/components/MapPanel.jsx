// =============================================================================
// Tablecast Virtual Tabletop (VTT) Engine — Orchestrator
// Decomposed into: MapConstants, useMapData, useMapInteraction,
// MapCanvas, MapToolbar, MapEncounterControls, MapModals, MapTokenDetails
// =============================================================================
import { useState } from "react";
import {
  AlertCircle, Plus, Trash2, X, UserPlus, Undo2, Grid3x3, Eye,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";

import useMapData from "./map/useMapData";
import useMapInteraction from "./map/useMapInteraction";
import MapCanvas from "./map/MapCanvas";
import MapToolbar from "./map/MapToolbar";
import MapEncounterControls from "./map/MapEncounterControls";
import MapModals from "./map/MapModals";
import MapTokenDetails from "./map/MapTokenDetails";

export default function MapPanel({ user, isPopout = false }) {
  const { socket, isConnected } = useSocket();
  const { addToast } = useToast();
  const { showConfirm } = useConfirm();

  // ---- All state, data, and action handlers ----
  const D = useMapData({ user, isPopout, socket, isConnected, addToast, showConfirm });

  // ---- Interaction handlers (zoom, pan, drag, touch) ----
  const interaction = useMapInteraction({
    tool: D.tool,
    zoom: D.zoom,
    panOffset: D.panOffset,
    isDrawing: D.isDrawing,
    isPanning: D.isPanning,
    panStart: D.panStart,
    dragState: D.dragState,
    currentPolygon: D.currentPolygon,
    tokens: D.tokens,
    gridSize: D.gridSize,
    user,
    isDM: D.isDM,
    activeMap: D.activeMap,
    setZoom: D.setZoom,
    setPanOffset: D.setPanOffset,
    setSelectedTokenId: D.setSelectedTokenId,
    setDragState: D.setDragState,
    setIsPanning: D.setIsPanning,
    setPanStart: D.setPanStart,
    setIsDrawing: D.setIsDrawing,
    setCurrentPolygon: D.setCurrentPolygon,
    setMousePosWorld: D.setMousePosWorld,
    canvasRef: D.canvasRef,
    imageRef: D.imageRef,
    gestureRef: D.gestureRef,
    pendingMovesRef: D.pendingMovesRef,
    socket,
    isConnected,
    setTokens: D.setTokens,
  });

  // Wrap handleStart to inject ruler click handler
  const handleStartWithRuler = (clientX, clientY) => {
    interaction.handleStart(clientX, clientY, { onRulerClick: D.handleRulerClick });
  };
  const handleTouchStartWithRuler = (e) => {
    // For ruler, we intercept touch start
    if (D.tool === "ruler" && e.touches.length === 1) {
      const t = e.touches[0];
      D.handleRulerClick(
        (t.clientX - D.panOffset.x) / D.zoom,
        (t.clientY - D.panOffset.y) / D.zoom
      );
      e.preventDefault();
      return;
    }
    interaction.handleTouchStart(e);
  };

  // ---- Derived ----
  const { gridSize, authHeaders, jsonAuthHeaders, withUser, isDM } = D;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={styles.container} className="fade-in">
      {/* VTT Header */}
      <header style={styles.header}>
        <div style={styles.headerTitleBox}>
          <h2 style={styles.title}>Tacticians Grid</h2>
          {D.activeMap && (
            <span style={styles.mapNameBadge}>
              Active: {D.activeMap.name} ({D.activeMap.gridSize}px Grid)
            </span>
          )}
        </div>

        <div style={styles.headerControls}>
          <div style={styles.dmMapSelector}>
            <select
              value={D.activeMap?.id || ""}
              onChange={(e) => D.handleSelectMap(Number(e.target.value))}
              style={styles.select}
              className="form-input touch-target"
              aria-label="Select map"
            >
              {D.mapsList.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {isDM && (
              <>
                <button onClick={() => D.setShowAddMapModal(true)} style={styles.btnSmall} className="btn-hover-scale glass-panel touch-target">
                  <Plus size={16} />
                  <span>New Map</span>
                </button>
                <button onClick={D.handleDeleteMap} style={styles.btnDangerSmall} className="btn-hover-scale glass-panel touch-target" disabled={!D.activeMap}>
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

      {/* Error banner */}
      {D.loadError && !D.showAddMapModal && (
        <div style={styles.errorBanner}>
          <AlertCircle size={16} />
          <span>{D.loadError}</span>
          <button onClick={() => D.setLoadError(null)} style={styles.errorDismiss} className="touch-target">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Grid/Map Arena Workspace */}
      <div ref={D.containerRef} style={styles.vttWorkspace} className="glass-panel gold-border-glow">
        <MapCanvas
          canvasRef={D.canvasRef}
          containerRef={D.containerRef}
          activeMap={D.activeMap}
          tokens={D.tokens}
          zoom={D.zoom}
          panOffset={D.panOffset}
          showGrid={D.showGrid}
          dragState={D.dragState}
          selectedTokenId={D.selectedTokenId}
          currentPolygon={D.currentPolygon}
          mousePosWorld={D.mousePosWorld}
          mapImageLoaded={D.mapImageLoaded}
          imageRef={D.imageRef}
          tokenImagesRef={D.tokenImagesRef}
          gridSize={gridSize}
          user={user}
          isDrawing={D.isDrawing}
          setIsDrawing={D.setIsDrawing}
          setCurrentPolygon={D.setCurrentPolygon}
          setMousePosWorld={D.setMousePosWorld}
          setIsPanning={D.setIsPanning}
          setPanStart={D.setPanStart}
          setPanOffset={D.setPanOffset}
          setZoom={D.setZoom}
          setSelectedTokenId={D.setSelectedTokenId}
          setDragState={D.setDragState}
          socket={socket}
          isConnected={isConnected}
          setTokens={D.setTokens}
          pendingMovesRef={D.pendingMovesRef}
          drawRafIdRef={D.drawRafIdRef}
          triggerRedrawRef={D.triggerRedrawRef}
          handleStart={handleStartWithRuler}
          handleMove={interaction.handleMove}
          handleEnd={interaction.handleEnd}
          handleTouchStart={handleTouchStartWithRuler}
          handleTouchMove={interaction.handleTouchMove}
          handleTouchEnd={interaction.handleTouchEnd}

          // Ruler tool props
          rulerPoints={D.rulerPoints}
          rulerHoverPos={D.mousePosWorld}
          tool={D.tool}
          // Dynamic lighting
          showLighting={D.showLighting}
        />

        {/* Encounter combat strip + drawer */}
        <MapEncounterControls
          activeEncounter={D.activeEncounter}
          showEncounterDrawer={D.showEncounterDrawer}
          setShowEncounterDrawer={D.setShowEncounterDrawer}
          encounterName={D.encounterName}
          setEncounterName={D.setEncounterName}
          encounterMonsterQuery={D.encounterMonsterQuery}
          setEncounterMonsterQuery={D.setEncounterMonsterQuery}
          encounterMonster={D.encounterMonster}
          setEncounterMonster={D.setEncounterMonster}
          encounterQuantity={D.encounterQuantity}
          setEncounterQuantity={D.setEncounterQuantity}
          encounterHidden={D.encounterHidden}
          setEncounterHidden={D.setEncounterHidden}
          encounterNpcId={D.encounterNpcId}
          setEncounterNpcId={D.setEncounterNpcId}
          encounterCharacterId={D.encounterCharacterId}
          setEncounterCharacterId={D.setEncounterCharacterId}
          encounterDeployX={D.encounterDeployX}
          setEncounterDeployX={D.setEncounterDeployX}
          encounterDeployY={D.encounterDeployY}
          setEncounterDeployY={D.setEncounterDeployY}
          encounterBusy={D.encounterBusy}
          activeMap={D.activeMap}
          isDM={isDM}
          availableNpcs={D.availableNpcs}
          availableCharacters={D.availableCharacters}
          handleCreateEncounter={D.handleCreateEncounter}
          handleAddMonsterToEncounter={D.handleAddMonsterToEncounter}
          handleAddNpcToEncounter={D.handleAddNpcToEncounter}
          handleAddCharacterToEncounter={D.handleAddCharacterToEncounter}
          handleDeployEncounter={D.handleDeployEncounter}
          handleStartEncounter={D.handleStartEncounter}
          handleAdvanceEncounterTurn={D.handleAdvanceEncounterTurn}
          handleCompleteEncounter={D.handleCompleteEncounter}
          handleParticipantHp={D.handleParticipantHp}
          handleGenerateEncounterName={D.handleGenerateEncounterName}
          encounterBuilderLoading={D.encounterBuilderLoading}
          setShowEncounterBuilder={D.setShowEncounterBuilder}
          styles={styles}
        />

        {/* Floating Toolbar */}
        <MapToolbar
          tool={D.tool}
          setTool={D.setTool}
          showGrid={D.showGrid}
          setShowGrid={D.setShowGrid}
          zoom={D.zoom}
          handleZoom={interaction.handleZoom}
          fitView={interaction.fitView}
          activeMap={D.activeMap}
          isDM={isDM}
          setCurrentPolygon={D.setCurrentPolygon}
          showLighting={D.showLighting}
          setShowLighting={D.setShowLighting}
          styles={styles}
        />

        {/* Floating Token Control */}
        <div style={styles.floatingTokensControl} className="glass-panel">
          <h4 style={styles.smallPanelHeader}>Token Control</h4>
          {D.selectedTokenId && (
            <div style={styles.selectedTokenText}>
              Selected: {D.tokens.find((t) => t.id === D.selectedTokenId)?.label || "Token"}
            </div>
          )}
          <div style={styles.tokenActionRow}>
            {isDM && (
              <button onClick={() => D.setShowEncounterDrawer(true)} style={styles.btnAction} className="btn-hover-scale touch-target">
                <UserPlus size={15} />
                Encounter
              </button>
            )}
            <button onClick={() => D.setShowAddTokenModal(true)} style={styles.btnAction} className="btn-hover-scale touch-target">
              <Plus size={15} />
              Add Token
            </button>
            {D.selectedTokenId && (
              <button onClick={() => D.handleDeleteToken(D.selectedTokenId)} style={{ ...styles.btnAction, background: "var(--color-danger)" }} className="btn-hover-scale touch-target">
                <Trash2 size={15} />
                Delete
              </button>
            )}
            {D.selectedTokenId && (
              <button onClick={() => D.setSelectedTokenId(null)} style={styles.btnAction} className="btn-hover-scale touch-target">
                <X size={15} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Ruler Info */}
        {D.tool === "ruler" && D.rulerPoints.length > 0 && (
          <div style={{ ...styles.floatingFogActions, ...styles.floatingRulerInfo }} className="glass-panel">
            <h4 style={styles.smallPanelHeader}>Ruler</h4>
            <div style={{ fontSize: "0.72rem", color: "var(--color-text)", marginTop: 4 }}>
              Points: {D.rulerPoints.length}
            </div>
            <div style={styles.tokenActionRow}>
              <button onClick={D.handleRulerUndo} style={styles.btnAction} className="touch-target">
                Undo Point
              </button>
              <button onClick={D.handleRulerClear} style={styles.btnAction} className="touch-target">
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Fog Actions */}
        {isDM && (D.tool === "draw-fog" || D.tool === "reveal-fog") && (
          <div style={styles.floatingFogActions} className="glass-panel">
            <h4 style={styles.smallPanelHeader}>Fog Control</h4>
            <div style={styles.tokenActionRow}>
              <button onClick={D.handleUndoFog} style={styles.btnAction} className="btn-hover-scale touch-target">
                <Undo2 size={15} />
                Undo Last
              </button>
              <button onClick={() => D.handleClearFog(false)} style={styles.btnAction} className="btn-hover-scale touch-target">
                <Grid3x3 size={15} />
                Mask All
              </button>
              <button onClick={() => D.handleClearFog(true)} style={styles.btnAction} className="btn-hover-scale touch-target">
                <Eye size={15} />
                Reveal All
              </button>
            </div>
            {D.isDrawing && D.currentPolygon.length > 2 && (
              <button onClick={D.handleFinishFogPolygon} style={styles.finishShapeBtn} className="btn-hover-scale pulse-accent-animation touch-target">
                Finish Shape ({D.currentPolygon.length} pts)
              </button>
            )}
          </div>
        )}

        {/* Selected Token Details */}
        <MapTokenDetails
          selectedTokenId={D.selectedTokenId}
          setSelectedTokenId={D.setSelectedTokenId}
          tokens={D.tokens}
          handleNpcRoll={D.handleNpcRoll}
          handleMonsterRoll={D.handleMonsterRoll}
          jsonAuthHeaders={jsonAuthHeaders}
          setTokens={D.setTokens}
          socket={socket}
          isConnected={isConnected}
          withUser={withUser}
          styles={styles}
        />
      </div>

      {/* Modals */}
      <MapModals
        showAddMapModal={D.showAddMapModal}
        showAddTokenModal={D.showAddTokenModal}
        showEncounterBuilder={D.showEncounterBuilder}
        setShowEncounterBuilder={D.setShowEncounterBuilder}
        newMapName={D.newMapName}
        setNewMapName={D.setNewMapName}
        newMapGridSize={D.newMapGridSize}
        setNewMapGridSize={D.setNewMapGridSize}
        newMapFile={D.newMapFile}
        setNewMapFile={D.setNewMapFile}
        newMapImagePath={D.newMapImagePath}
        setNewMapImagePath={D.setNewMapImagePath}
        newTokenLabel={D.newTokenLabel}
        setNewTokenLabel={D.setNewTokenLabel}
        newTokenCharacterId={D.newTokenCharacterId}
        setNewTokenCharacterId={D.setNewTokenCharacterId}
        newTokenNpcId={D.newTokenNpcId}
        setNewTokenNpcId={D.setNewTokenNpcId}
        newTokenMonsterId={D.newTokenMonsterId}
        setNewTokenMonsterId={D.setNewTokenMonsterId}
        newTokenImageUrl={D.newTokenImageUrl}
        setNewTokenImageUrl={D.setNewTokenImageUrl}
        newTokenIsMonster={D.newTokenIsMonster}
        setNewTokenIsMonster={D.setNewTokenIsMonster}
        newTokenStats={D.newTokenStats}
        setNewTokenStats={D.setNewTokenStats}
        tokenType={D.tokenType}
        setTokenType={D.setTokenType}
        availableCharacters={D.availableCharacters}
        availableNpcs={D.availableNpcs}
        availableMonsters={D.availableMonsters}
        isCreatingMap={D.isCreatingMap}
        loadError={D.loadError}
        isDM={isDM}
        user={user}
        encounterBuilderLevels={D.encounterBuilderLevels}
        setEncounterBuilderLevels={D.setEncounterBuilderLevels}
        encounterBuilderDifficulty={D.encounterBuilderDifficulty}
        setEncounterBuilderDifficulty={D.setEncounterBuilderDifficulty}
        encounterBuilderContext={D.encounterBuilderContext}
        setEncounterBuilderContext={D.setEncounterBuilderContext}
        encounterBuilderLoading={D.encounterBuilderLoading}
        encounterBuilderProgress={D.encounterBuilderProgress}
        encounterBuilderError={D.encounterBuilderError}
        encounterBuilderResult={D.encounterBuilderResult}
        setEncounterBuilderResult={D.setEncounterBuilderResult}
        handleCreateMap={D.handleCreateMap}
        handleCreateToken={D.handleCreateToken}
        handleCancelAddMap={D.handleCancelAddMap}
        handleMapPresetSelect={D.handleMapPresetSelect}
        handleTokenPresetSelect={D.handleTokenPresetSelect}
        handleQuickCharacterToken={D.handleQuickCharacterToken}
        resolveMonsterTokenImage={D.resolveMonsterTokenImage}
        handleBuildEncounter={D.handleBuildEncounter}
        handleApplyEncounterResult={D.handleApplyEncounterResult}
        setShowAddMapModal={D.setShowAddMapModal}
        setShowAddTokenModal={D.setShowAddTokenModal}
        styles={styles}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles config (preserved from original MapPanel)
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
  floatingRulerInfo: {
    bottom: "12px",
    right: "200px",
    minWidth: "140px",
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
  detailsRow: {
    display: "flex",
    gap: "0.3rem",
    alignItems: "center",
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
