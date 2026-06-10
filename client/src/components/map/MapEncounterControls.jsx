// =============================================================================
// MapEncounterControls — Combat strip + encounter builder drawer
// =============================================================================
import { X } from "lucide-react";
import Autocomplete from "../Autocomplete";

export default function MapEncounterControls({
  activeEncounter,
  showEncounterDrawer,
  setShowEncounterDrawer,
  encounterName,
  setEncounterName,
  encounterMonsterQuery,
  setEncounterMonsterQuery,
  encounterMonster,
  setEncounterMonster,
  encounterQuantity,
  setEncounterQuantity,
  encounterHidden,
  setEncounterHidden,
  encounterNpcId,
  setEncounterNpcId,
  encounterCharacterId,
  setEncounterCharacterId,
  encounterDeployX,
  setEncounterDeployX,
  encounterDeployY,
  setEncounterDeployY,
  encounterBusy,
  activeMap,
  isDM,
  availableNpcs,
  availableCharacters,
  handleCreateEncounter,
  handleAddMonsterToEncounter,
  handleAddNpcToEncounter,
  handleAddCharacterToEncounter,
  handleDeployEncounter,
  handleStartEncounter,
  handleAdvanceEncounterTurn,
  handleCompleteEncounter,
  handleParticipantHp,
  handleGenerateEncounterName,
  encounterBuilderLoading,
  setShowEncounterBuilder,
  styles,
}) {
  // Combat strip (shown when encounter is active, above canvas)
  const showCombatStrip = activeEncounter && activeEncounter.status !== "COMPLETE";

  return (
    <>
      {showCombatStrip && (
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

      {/* Encounter Builder Drawer */}
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
    </>
  );
}
