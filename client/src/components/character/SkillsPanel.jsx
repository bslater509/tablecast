// =============================================================================
// Tablecast — Skills Panel (Extracted from CharacterSheet)
// Renders the 18 standard 5e skills with proficiency checkboxes and roll buttons
// =============================================================================
import { SKILL_DEFINITIONS, getMod, formatMod, getProficiencyBonus } from "./characterUtils";
import { styles } from "./characterStyles";

export default function SkillsPanel({
  character,
  onSkillRoll,
  onToggleProficiency,
}) {
  return (
    <div style={styles.skillsList} className="fade-in">
      {SKILL_DEFINITIONS.map((skill) => {
        const baseStat = character[skill.ability];
        const abilityMod = getMod(baseStat);
        const isProf = character.modifiers.proficiencies.includes(skill.name);
        const profBonus = getProficiencyBonus(character.level);
        const finalMod = abilityMod + (isProf ? profBonus : 0);

        return (
          <div key={skill.name} style={styles.skillRow} className="glass-panel">
            <div style={styles.skillLeft}>
              <input
                id={`chk-skillprof-${skill.name.toLowerCase().replace(/\s/g, "")}`}
                type="checkbox"
                checked={isProf}
                onChange={() => onToggleProficiency(skill.name)}
                style={styles.checkbox}
              />
              <span style={styles.skillNameText}>{skill.name}</span>
              <span style={styles.skillAbilityTag}>
                {skill.ability.slice(0, 3).toUpperCase()}
              </span>
            </div>
            <button
              id={`roll-skill-${skill.name.toLowerCase().replace(/\s/g, "")}`}
              onClick={() => onSkillRoll(skill)}
              style={styles.skillRollBtn}
              className="touch-target btn-hover-scale"
            >
              {formatMod(finalMod)} 
            </button>
          </div>
        );
      })}
    </div>
  );
}
