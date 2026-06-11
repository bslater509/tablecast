// =============================================================================
// Tablecast — Spells Panel (Extracted from CharacterSheet)
// Spellcasting ability config, spell slot tracker, and spell library manager
// =============================================================================
import { formatMod } from "./characterUtils";
import { styles } from "./characterStyles";
import Autocomplete from "../Autocomplete";

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function SpellsPanel({
  character,
  spellSlots,
  spells,
  spellcastingAbility,
  spellSaveDc,
  spellAttackBonus,
  showAddSpell,
  expandedSpell,
  onCastingAbilityChange,
  onSlotToggle,
  onRecoverSlot,
  onResetSlots,
  onToggleAddSpell,
  onSpellSelect,
  onTogglePrepared,
  onRemoveSpell,
  onToggleExpand,
}) {
  return (
    <div style={styles.spellsContainer} className="fade-in">
      {/* Spellcasting Header */}
      <div style={styles.spellHeaderRow}>
        <div style={styles.spellAbilityGroup}>
          <label style={styles.spellLabel}>Casting Ability</label>
          <select
            id="spell-ability-select"
            value={spellcastingAbility}
            onChange={(e) => onCastingAbilityChange(e.target.value)}
            style={styles.spellSelect}
          >
            <option value="">— None —</option>
            <option value="intelligence">Intelligence</option>
            <option value="wisdom">Wisdom</option>
            <option value="charisma">Charisma</option>
          </select>
        </div>
        <div style={styles.spellStatBox}>
          <span style={styles.spellStatLabel}>Save DC</span>
          <span style={styles.spellStatValue}>{spellSaveDc}</span>
        </div>
        <div style={styles.spellStatBox}>
          <span style={styles.spellStatLabel}>Attack</span>
          <span style={styles.spellStatValue}>{formatMod(spellAttackBonus)}</span>
        </div>
      </div>

      {/* Spell Slots Tracker */}
      {Object.keys(spellSlots).length > 0 && (
        <div style={styles.spellSlotsSection} className="glass-panel">
          <div style={styles.spellSlotsHeader}>
            <span style={styles.spellSectionTitle}>Spell Slots</span>
            <button
              id="reset-slots-btn"
              onClick={onResetSlots}
              style={styles.spellSmallBtn}
              className="touch-target"
            >
              Reset (Long Rest)
            </button>
          </div>
          <div style={styles.spellSlotsGrid}>
            {Object.entries(spellSlots)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([level, slot]) => {
                const used = slot.used || 0;
                const total = slot.total || 0;
                const remaining = total - used;
                return (
                  <div key={level} style={styles.slotRow}>
                    <span style={styles.slotLevelLabel}>Lv {level}</span>
                    <div style={styles.slotDots}>
                      {Array.from({ length: total }, (_, i) => (
                        <button
                          key={i}
                          id={`slot-${level}-${i}`}
                          onClick={() => (i < remaining ? onSlotToggle(level) : onRecoverSlot(level))}
                          style={{
                            ...styles.slotDot,
                            background: i < remaining
                              ? "var(--color-accent)"
                              : "rgba(255,255,255,0.08)",
                          }}
                          className="touch-target"
                          title={i < remaining
                            ? `Use level ${level} slot`
                            : `Recover level ${level} slot`}
                        />
                      ))}
                    </div>
                    <span style={styles.slotCount}>
                      {used}/{total}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Add Spell Button */}
      <div style={styles.spellAddRow}>
        <h3 style={styles.spellSectionTitle}>Spells</h3>
        {!showAddSpell && (
          <button
            id="add-spell-btn"
            onClick={() => onToggleAddSpell(true)}
            style={styles.addBtn}
            className="touch-target btn-hover-scale"
          >
            + Add Spell
          </button>
        )}
      </div>

      {/* Add Spell Form */}
      {showAddSpell && (
        <div
          style={styles.subForm}
          className="glass-panel gold-border-glow"
        >
          <h4 style={styles.subFormTitle}>Add Spell</h4>
          <div style={styles.inputGroup}>
            <label style={styles.subLabel}>Search Spell</label>
            <Autocomplete
              id="spell-search-input"
              category="spells"
              placeholder="e.g. Fireball, Cure Wounds..."
              onSelect={onSpellSelect}
              className="form-input"
              inputStyle={styles.subInput}
            />
          </div>
          <div style={styles.subBtnRow}>
            <button
              type="button"
              onClick={() => onToggleAddSpell(false)}
              style={styles.subCancelBtn}
              className="touch-target btn-hover-scale"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spell List Grouped by Level */}
      {spells.length === 0 ? (
        <div style={styles.spellEmpty}>
          No spells yet. Add spells from the 5e reference library above.
        </div>
      ) : (
        <div style={styles.spellList}>
          {SPELL_LEVELS.map((level) => {
            const levelSpells = spells.filter((s) => s.level === level);
            if (levelSpells.length === 0) return null;
            return (
              <div key={level} style={styles.spellGroup}>
                <div style={styles.spellGroupHeader}>
                  <span style={styles.spellGroupTitle}>
                    {level === 0 ? "Cantrips" : `Level ${level}`}
                  </span>
                  <span style={styles.spellGroupCount}>{levelSpells.length}</span>
                </div>
                {levelSpells.map((spell, idx) => {
                  const spellIndex = spells.indexOf(spell);
                  const isExpanded = expandedSpell === spellIndex;
                  return (
                    <div key={spell.name + idx} style={styles.spellCard} className="glass-panel">
                      <div
                        style={styles.spellCardHeader}
                        onClick={() => onToggleExpand(isExpanded ? null : spellIndex)}
                      >
                        <div style={styles.spellCardLeft}>
                          {spell.level > 0 && (
                            <input
                              id={`prepared-${spell.name.toLowerCase().replace(/\s/g, "")}`}
                              type="checkbox"
                              checked={spell.prepared}
                              onChange={() => onTogglePrepared(spellIndex)}
                              onClick={(e) => e.stopPropagation()}
                              style={styles.checkbox}
                              title="Toggle prepared"
                            />
                          )}
                          <div style={styles.spellCardInfo}>
                            <span style={styles.spellCardName}>{spell.name}</span>
                            <span style={styles.spellCardMeta}>
                              {spell.school}
                              {spell.concentration && " • Concentration"}
                              {spell.ritual && " • Ritual"}
                            </span>
                          </div>
                        </div>
                        <div style={styles.spellCardActions}>
                          <span style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</span>
                          <button
                            id={`remove-spell-${spell.name.toLowerCase().replace(/\s/g, "")}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveSpell(spellIndex);
                            }}
                            style={styles.deleteBtn}
                            className="touch-target"
                            title="Remove spell"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Expanded Spell Detail */}
                      {isExpanded && (
                        <div style={styles.spellDetail}>
                          <div style={styles.spellMetaGrid}>
                            {spell.castingTime && (
                              <div style={styles.spellMetaItem}>
                                <span style={styles.spellMetaLabel}>Casting Time</span>
                                <span style={styles.spellMetaVal}>{spell.castingTime}</span>
                              </div>
                            )}
                            {spell.range && (
                              <div style={styles.spellMetaItem}>
                                <span style={styles.spellMetaLabel}>Range</span>
                                <span style={styles.spellMetaVal}>{spell.range}</span>
                              </div>
                            )}
                            {spell.components && (
                              <div style={styles.spellMetaItem}>
                                <span style={styles.spellMetaLabel}>Components</span>
                                <span style={styles.spellMetaVal}>{spell.components}</span>
                              </div>
                            )}
                            {spell.duration && (
                              <div style={styles.spellMetaItem}>
                                <span style={styles.spellMetaLabel}>Duration</span>
                                <span style={styles.spellMetaVal}>{spell.duration}</span>
                              </div>
                            )}
                          </div>
                          {spell.description && spell.description.length > 0 && (
                            <div style={styles.spellDescSection}>
                              <span style={styles.spellDescLabel}>Description</span>
                              <div style={styles.spellDescText}>
                                {Array.isArray(spell.description)
                                  ? spell.description.map((entry, ei) => (
                                      <p key={ei} style={{ margin: "0.25rem 0" }}>
                                        {typeof entry === "string" ? entry : entry.name || ""}
                                      </p>
                                    ))
                                  : typeof spell.description === "string"
                                    ? <p style={{ margin: "0.25rem 0" }}>{spell.description}</p>
                                    : null}
                              </div>
                            </div>
                          )}
                          {spell.higherLevels && spell.higherLevels.length > 0 && (
                            <div style={styles.spellDescSection}>
                              <span style={styles.spellDescLabel}>At Higher Levels</span>
                              <div style={styles.spellDescText}>
                                {Array.isArray(spell.higherLevels)
                                  ? spell.higherLevels.map((entry, hi) => (
                                      <p key={hi} style={{ margin: "0.25rem 0" }}>
                                        {typeof entry === "string" ? entry : entry.name || ""}
                                      </p>
                                    ))
                                  : typeof spell.higherLevels === "string"
                                    ? <p style={{ margin: "0.25rem 0" }}>{spell.higherLevels}</p>
                                    : null}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
