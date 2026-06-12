// =============================================================================
// MapModals — Add map, add token, and AI builder modals
// =============================================================================
import { AlertCircle } from "lucide-react";
import Autocomplete from "../Autocomplete";
import TokenPresetIcon from "../TokenPresetIcon";
import { MAP_IMPORT_PRESETS } from "../map/MapConstants";
import { NPC_TOKEN_PRESETS, generateTokenSvgUrl } from "../../data/npcTokenPresets";
import { canAccessCharacter } from "../../utils/authHeaders";

export default function MapModals({
  showAddMapModal,
  showAddTokenModal,
  showEncounterBuilder,
  setShowEncounterBuilder,
  newMapName,
  setNewMapName,
  newMapGridSize,
  setNewMapGridSize,
  newMapFile,
  setNewMapFile,
  newMapImagePath,
  setNewMapImagePath,
  newTokenLabel,
  setNewTokenLabel,
  newTokenCharacterId,
  setNewTokenCharacterId,
  newTokenNpcId,
  setNewTokenNpcId,
  newTokenMonsterId,
  setNewTokenMonsterId,
  newTokenImageUrl,
  setNewTokenImageUrl,
  newTokenIsMonster,
  setNewTokenIsMonster,
  newTokenStats,
  setNewTokenStats,
  tokenType,
  setTokenType,
  availableCharacters,
  availableNpcs,
  availableMonsters,
  isCreatingMap,
  loadError,
  isDM,
  user,
  encounterBuilderLevels,
  setEncounterBuilderLevels,
  encounterBuilderDifficulty,
  setEncounterBuilderDifficulty,
  encounterBuilderContext,
  setEncounterBuilderContext,
  encounterBuilderLoading,
  encounterBuilderProgress,
  encounterBuilderError,
  encounterBuilderResult,
  setEncounterBuilderResult,
  handleCreateMap,
  handleCreateToken,
  handleCancelAddMap,
  handleMapPresetSelect,
  handleTokenPresetSelect,
  handleQuickCharacterToken,
  resolveMonsterTokenImage,
  handleBuildEncounter,
  handleApplyEncounterResult,
  setShowAddMapModal,
  setShowAddTokenModal,
  showGridSizePrompt,
  setShowGridSizePrompt,
  newDropGridSize,
  setNewDropGridSize,
  pendingMapId,
  handleConfirmGridSize,
  handleCancelGridSize,
  styles,
}) {
  return (
    <>
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
                  min={20} max={200}
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
                    <option key={preset.label} value={preset.label}>{preset.label}</option>
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
                <button type="button" onClick={handleCancelAddMap} style={styles.btnCancel} className="touch-target">
                  Cancel
                </button>
                <button type="submit" style={styles.btnSubmit} className="touch-target btn-hover-scale" disabled={!newMapName.trim() || isCreatingMap}>
                  {isCreatingMap ? "Creating..." : "Create Map"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GRID SIZE PROMPT (after drag & drop upload) */}
      {showGridSizePrompt && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard} className="glass-panel gold-border-glow">
            <h3 style={styles.modalTitle}> Set Map Grid Size</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", margin: 0 }}>
              Map uploaded successfully! Choose the grid cell size for this map.
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); handleConfirmGridSize(); }}
              style={styles.form}
            >
              <div style={styles.formGroup}>
                <label style={styles.label}>Grid cell size (pixels)</label>
                <input
                  type="number"
                  value={newDropGridSize}
                  onChange={(e) => setNewDropGridSize(Number(e.target.value))}
                  style={styles.input}
                  className="form-input"
                  min={20}
                  max={200}
                  required
                  autoFocus
                />
                <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "0.15rem" }}>
                  Common values: 50 (standard), 70 (large), 100 (cinematic)
                </span>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={handleCancelGridSize} style={styles.btnCancel} className="touch-target">
                  Use Default (50px)
                </button>
                <button type="submit" style={styles.btnSubmit} className="touch-target btn-hover-scale">
                  Set Grid Size
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
              {isDM && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Token Source Type</label>
                  <div style={styles.tokenTypeSelector}>
                    <button
                      type="button"
                      onClick={() => { setTokenType("character"); setNewTokenIsMonster(false); }}
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
                      onClick={() => { setTokenType("npc"); setNewTokenIsMonster(false); }}
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
                      onClick={() => { setTokenType("monster"); setNewTokenIsMonster(true); }}
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

              {isDM && tokenType === "monster" && (
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
                      .filter(c => canAccessCharacter(c, user))
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
                      .filter(c => canAccessCharacter(c, user))
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
                <button type="button" onClick={() => setShowAddTokenModal(false)} style={styles.btnCancel} className="touch-target">
                  Cancel
                </button>
                <button type="submit" style={styles.btnSubmit} className="touch-target btn-hover-scale">
                  Add Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </>
  );
}
