// =============================================================================
// Tablecast — Character Sheet Utility Functions (Extracted from CharacterSheet)
// Pure utility functions for D&D 5e ability scores, skills, and proficiencies
// =============================================================================

/**
 * The 18 standard D&D 5e skills mapped to their associated abilities.
 * @type {Array<{name: string, ability: string}>}
 */
export const SKILL_DEFINITIONS = [
  { name: "Athletics", ability: "strength" },
  { name: "Acrobatics", ability: "dexterity" },
  { name: "Sleight of Hand", ability: "dexterity" },
  { name: "Stealth", ability: "dexterity" },
  { name: "Arcana", ability: "intelligence" },
  { name: "History", ability: "intelligence" },
  { name: "Investigation", ability: "intelligence" },
  { name: "Nature", ability: "intelligence" },
  { name: "Religion", ability: "intelligence" },
  { name: "Animal Handling", ability: "wisdom" },
  { name: "Insight", ability: "wisdom" },
  { name: "Medicine", ability: "wisdom" },
  { name: "Perception", ability: "wisdom" },
  { name: "Survival", ability: "wisdom" },
  { name: "Deception", ability: "charisma" },
  { name: "Intimidation", ability: "charisma" },
  { name: "Performance", ability: "charisma" },
  { name: "Persuasion", ability: "charisma" },
];

/**
 * Calculate ability modifier from a D&D 5e ability score.
 * Formula: floor((score - 10) / 2)
 * @param {number} score - Ability score (e.g., 18 → +4)
 * @returns {number} Raw modifier number
 */
export function getMod(score) {
  return Math.floor((score - 10) / 2);
}

/**
 * Format a modifier value as a display string with + prefix for positives.
 * @param {number} val - The raw modifier value
 * @returns {string} Formatted modifier like "+3" or "-1"
 */
export function formatMod(val) {
  return val >= 0 ? `+${val}` : `${val}`;
}

/**
 * Calculate proficiency bonus based on character level.
 * D&D 5e: Lvl 1-4 is +2, 5-8 is +3, 9-12 is +4, 13-16 is +5, 17-20 is +6.
 * @param {number} lvl - Character level (defaults to 1)
 * @returns {number} Proficiency bonus
 */
export function getProficiencyBonus(lvl) {
  return Math.ceil((lvl || 1) / 4) + 1;
}
