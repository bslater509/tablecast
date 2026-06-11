// =============================================================================
// Tablecast — Ability Scores Panel (Extracted from CharacterSheet)
// Renders the 6 ability scores with click-to-roll modifiers and save proficiencies
// =============================================================================
import { getMod, formatMod, getProficiencyBonus } from "./characterUtils";
import { styles } from "./characterStyles";

const ABILITY_STATS = [
  "strength", "dexterity", "constitution",
  "intelligence", "wisdom", "charisma",
];

export default function AbilityScoresPanel({
  character,
  onAbilityRoll,
  onStatChange,
  onToggleSave,
  onSaveRoll,
}) {
  return (
    <div style={styles.statsGrid} className="fade-in">
      {ABILITY_STATS.map((stat) => {
        const score = character[stat];
        const mod = getMod(score);
        return (
          <div key={stat} style={styles.statBox} className="glass-panel">
            <span style={styles.statNameLabel}>
              {stat.slice(0, 3).toUpperCase()}
            </span>
            <button
              id={`roll-stat-${stat}`}
              onClick={() => onAbilityRoll(stat, score)}
              style={styles.statModBtn}
              className="touch-target btn-hover-scale"
              title="Click to Roll Check"
            >
              {formatMod(mod)}
            </button>
            <input
              id={`input-stat-${stat}`}
              type="number"
              value={score}
              min={1}
              max={30}
              onChange={(e) => onStatChange(stat, e.target.value)}
              onBlur={(e) => onStatChange(stat, e.target.value)}
              style={styles.statInput}
            />
            {/* Save Prof Checkbox */}
            <div style={styles.saveProfRow}>
              <input
                id={`chk-saveprof-${stat}`}
                type="checkbox"
                checked={character.modifiers.saveProficiencies.includes(stat)}
                onChange={() => onToggleSave(stat)}
                style={styles.checkbox}
              />
              <button
                id={`roll-save-${stat}`}
                onClick={() => onSaveRoll(stat, score)}
                style={styles.saveRollText}
              >
                Save: {formatMod(mod + (character.modifiers.saveProficiencies.includes(stat)
                  ? getProficiencyBonus(character.level)
                  : 0))}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
