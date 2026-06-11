// =============================================================================
// MapToolbar — Floating toolbar for zoom, tool selection, fog controls
// =============================================================================
import {
  Hand, Grid3x3, Eye, ZoomIn, ZoomOut, Maximize2, Ruler, Sun,
} from "lucide-react";

export default function MapToolbar({
  tool,
  setTool,
  showGrid,
  setShowGrid,
  zoom,
  handleZoom,
  fitView,
  activeMap,
  isDM,
  setCurrentPolygon,
  showLighting,
  setShowLighting,
  styles,
}) {
  return (
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

      {isDM && (
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

          <button
            onClick={() => setShowLighting(!showLighting)}
            disabled={!activeMap}
            style={{
              ...styles.toolBtn,
              background: showLighting ? "var(--color-accent-dim)" : "transparent",
              borderColor: showLighting ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
              opacity: activeMap ? 1 : 0.5,
              cursor: activeMap ? "pointer" : "not-allowed"
            }}
            title={activeMap ? (showLighting ? "Hide Dynamic Lighting" : "Show Dynamic Lighting") : "Select a map first"}
            className="touch-target btn-hover-scale"
          >
            <Sun size={17} />
            <span>Light</span>
          </button>
        </>
      )}

      <button
        onClick={() => setTool(tool === "ruler" ? "select" : "ruler")}
        style={{
          ...styles.toolBtn,
          background: tool === "ruler" ? "var(--color-accent-dim)" : "transparent",
          borderColor: tool === "ruler" ? "var(--color-accent)" : "rgba(255,255,255,0.05)"
        }}
        title="Measure distance (click to start, click to finish)"
        className="touch-target btn-hover-scale"
      >
        <Ruler size={17} />
        <span>Ruler</span>
      </button>

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
        onClick={fitView}
        style={styles.toolBtn}
        title="Reset View"
        className="touch-target btn-hover-scale"
      >
        <Maximize2 size={17} />
        <span>Fit</span>
      </button>
    </div>
  );
}
