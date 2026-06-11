// =============================================================================
// Tablecast — Attacks Panel (Extracted from CharacterSheet)
// Weapons & spells attack list with add/delete and roll-to-hit functionality
// =============================================================================
import { Trash2, Swords } from "lucide-react";
import { getMod, formatMod, getProficiencyBonus } from "./characterUtils";
import { styles } from "./characterStyles";
import Autocomplete from "../Autocomplete";

export default function AttacksPanel({
  character,
  showAddAttack,
  atkName,
  atkAbility,
  atkDice,
  atkProficient,
  onToggleForm,
  onSetAtkName,
  onSetAtkAbility,
  onSetAtkDice,
  onSetAtkProficient,
  onAddAttack,
  onAttackRoll,
  onDeleteAttack,
}) {
  const attacks = character.modifiers.attacks || [];

  return (
    <div style={styles.attacksContainer} className="fade-in">
      <div style={styles.attackSubHeader}>
        <h3 style={styles.subTitle}>Weapons & Spells</h3>
        {!showAddAttack && (
          <button
            id="add-atk-form-btn"
            onClick={() => onToggleForm(true)}
            style={styles.addBtn}
            className="touch-target btn-hover-scale"
          >
            + Add Attack
          </button>
        )}
      </div>

      {/* Custom Attack Add Form */}
      {showAddAttack && (
        <form onSubmit={onAddAttack} style={styles.subForm} className="glass-panel gold-border-glow">
          <h4 style={styles.subFormTitle}>Add Weapon/Spell</h4>

          <div style={styles.subFormRow}>
            <div style={styles.inputGroup}>
              <label style={styles.subLabel}>Name</label>
              <Autocomplete
                id="atk-name-input"
                category="spells"
                placeholder="e.g. Fireball, Broadsword..."
                value={atkName}
                onChange={(val) => onSetAtkName(val)}
                onSelect={(spell) => {
                  onSetAtkName(spell.name);
                  const entriesStr = JSON.stringify(spell.entries || []);
                  const diceMatch = entriesStr.match(/\b(\d+d\d+)\b/);
                  if (diceMatch) {
                    onSetAtkDice(diceMatch[1]);
                  } else {
                    onSetAtkDice("1d8");
                  }
                  if (spell.level !== undefined) {
                    const stats = {
                      intelligence: character.intelligence,
                      wisdom: character.wisdom,
                      charisma: character.charisma,
                    };
                    let bestStat = "intelligence";
                    if (stats.wisdom > stats[bestStat]) bestStat = "wisdom";
                    if (stats.charisma > stats[bestStat]) bestStat = "charisma";
                    onSetAtkAbility(bestStat);
                  }
                }}
                className="form-input"
                inputStyle={styles.subInput}
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.subLabel}>Damage Dice</label>
              <input
                id="atk-dice-input"
                type="text"
                placeholder="e.g. 1d8, 2d6"
                value={atkDice}
                onChange={(e) => onSetAtkDice(e.target.value)}
                required
                style={styles.subInput}
                className="form-input"
              />
            </div>
          </div>

          <div style={styles.subFormRow}>
            <div style={styles.inputGroup}>
              <label style={styles.subLabel}>Attribute</label>
              <select
                id="atk-ability-select"
                value={atkAbility}
                onChange={(e) => onSetAtkAbility(e.target.value)}
                style={styles.select}
              >
                <option value="strength">Strength</option>
                <option value="dexterity">Dexterity</option>
                <option value="constitution">Constitution</option>
                <option value="intelligence">Intelligence</option>
                <option value="wisdom">Wisdom</option>
                <option value="charisma">Charisma</option>
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flexDirection: "row", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
              <input
                id="atk-prof-checkbox"
                type="checkbox"
                checked={atkProficient}
                onChange={(e) => onSetAtkProficient(e.target.checked)}
                style={styles.checkbox}
              />
              <label style={styles.subLabel}>Proficient</label>
            </div>
          </div>

          <div style={styles.subBtnRow}>
            <button
              type="button"
              onClick={() => onToggleForm(false)}
              style={styles.subCancelBtn}
              className="touch-target btn-hover-scale"
            >
              Cancel
            </button>
            <button
              id="save-atk-btn"
              type="submit"
              style={styles.subSubmitBtn}
              className="touch-target btn-hover-scale"
            >
              Save Attack
            </button>
          </div>
        </form>
      )}

      {/* List of Weapon Attacks */}
      {attacks.length === 0 && !showAddAttack ? (
        <div style={styles.emptyState}>
          <Swords size={28} style={styles.emptyStateIcon} />
          <span>No attacks configured</span>
          <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>
            Add a weapon or spell attack above to roll from your sheet.
          </span>
        </div>
      ) : (
        <div style={styles.attacksList}>
          {attacks.map((atk, idx) => {
            const modifier = getMod(character[atk.ability]);
            const profBonus = getProficiencyBonus(character.level);
            const toHit = modifier + (atk.proficient ? profBonus : 0);

            return (
              <div key={atk.name || idx} style={styles.attackCard} className="glass-panel">
                <div style={styles.atkInfo}>
                  <span style={styles.atkName}>{atk.name}</span>
                  <span style={styles.atkFormula}>
                    Hit: {formatMod(toHit)} | Damage: {atk.dice} + {formatMod(modifier)}
                  </span>
                </div>
                <div style={styles.atkActions}>
                  <button
                    id={`roll-atk-${atk.name.toLowerCase().replace(/\s/g, "")}`}
                    onClick={() => onAttackRoll(atk)}
                    style={styles.atkRollBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Roll Attack
                  </button>
                  <button
                    id={`delete-atk-${atk.name.toLowerCase().replace(/\s/g, "")}`}
                    onClick={() => onDeleteAttack(idx)}
                    style={styles.deleteBtn}
                    className="touch-target btn-hover-scale"
                    title="Delete attack"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
