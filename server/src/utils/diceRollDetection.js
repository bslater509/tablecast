// =============================================================================
// Tablecast  Dice Roll Detection Utility
// Scans AI-generated text for D&D 5e check patterns and returns clickable
// roll chip metadata. Used for AI-Triggered Dice Roll Integration (§6.1).
// =============================================================================
"use strict";

/**
 * Pattern definitions for D&D 5e checks, saves, and attack rolls.
 * Each pattern produces a roll chip with type, label, and optional DC.
 */
const PATTERNS = [
  // "Perception check", "Investigation check", etc.
  { regex: /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(check|save|saving throw)\b/gi, mapType: "save" },
  // "Perception check", "Stealth check", etc. (skills)
  { regex: /\b(Acrobatics|Animal Handling|Arcana|Athletics|Deception|History|Insight|Intimidation|Investigation|Medicine|Nature|Perception|Performance|Persuasion|Religion|Sleight of Hand|Stealth|Survival)\s+(check|save)\b/gi, mapType: "skill" },
  // "saving throw" standalone
  { regex: /\bsaving throw\b/gi, mapType: "save" },
  // "DC N" or "DC N" patterns
  { regex: /\bDC\s*(\d+)\b/gi, mapType: "dc" },
  // "attack roll" 
  { regex: /\battack roll\b/gi, mapType: "attack" },
  // "make a melee/ranged attack"
  { regex: /\b(melee|ranged)\s+attack\b/gi, mapType: "attack" },
  // "make a Dexterity/Strength/etc. check"
  { regex: /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+check\b/gi, mapType: "check" },
];

/**
 * Known D&D 5e skills mapped to their primary ability.
 */
const SKILL_ABILITY = {
  acrobatics: "dexterity",
  "animal handling": "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  "sleight of hand": "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

const SAVE_ABILITY = {
  strength: "strength",
  dexterity: "dexterity",
  constitution: "constitution",
  intelligence: "intelligence",
  wisdom: "wisdom",
  charisma: "charisma",
};

/**
 * Scan text for D&D roll patterns and return an array of chip descriptors.
 * @param {string} text - The AI response text to scan.
 * @returns {Array<{type: string, label: string, skill?: string, ability?: string, dc?: number}>}
 */
function scanTextForRollChips(text) {
  if (!text || typeof text !== "string") return [];

  const chips = [];
  const seen = new Set();

  // Find all DC values in text
  const dcMatches = [];
  const dcRegex = /\bDC\s*(\d+)\b/gi;
  let dcMatch;
  while ((dcMatch = dcRegex.exec(text)) !== null) {
    dcMatches.push(parseInt(dcMatch[1], 10));
  }
  const nearestDc = dcMatches.length > 0 ? dcMatches[0] : null;

  // Scan for skill checks
  const skillCheckRegex = /\b(Acrobatics|Animal Handling|Arcana|Athletics|Deception|History|Insight|Intimidation|Investigation|Medicine|Nature|Perception|Performance|Persuasion|Religion|Sleight of Hand|Stealth|Survival)\s+check\b/gi;
  let skillMatch;
  while ((skillMatch = skillCheckRegex.exec(text)) !== null) {
    const skill = skillMatch[1].toLowerCase();
    const key = `skill:${skill}`;
    if (!seen.has(key)) {
      seen.add(key);
      chips.push({
        type: "skill",
        label: `${skillMatch[1]} Check`,
        skill,
        ability: SKILL_ABILITY[skill] || "wisdom",
        dc: nearestDc || undefined,
      });
    }
  }

  // Scan for ability saves
  const saveRegex = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(save|saving throw)\b/gi;
  let saveMatch;
  while ((saveMatch = saveRegex.exec(text)) !== null) {
    const ability = saveMatch[1].toLowerCase();
    const key = `save:${ability}`;
    if (!seen.has(key)) {
      seen.add(key);
      chips.push({
        type: "save",
        label: `${saveMatch[1]} Save`,
        ability,
        dc: nearestDc || undefined,
      });
    }
  }

  // Scan for "saving throw" standalone
  if (/\bsaving throw\b/i.test(text) && !seen.has("save:generic")) {
    seen.add("save:generic");
    chips.push({
      type: "save",
      label: "Saving Throw",
      dc: nearestDc || undefined,
    });
  }

  // Scan for ability checks
  const abilityCheckRegex = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+check\b/gi;
  let abilityMatch;
  while ((abilityMatch = abilityCheckRegex.exec(text)) !== null) {
    const ability = abilityMatch[1].toLowerCase();
    const key = `check:${ability}`;
    if (!seen.has(key)) {
      seen.add(key);
      chips.push({
        type: "check",
        label: `${abilityMatch[1]} Check`,
        ability,
        dc: nearestDc || undefined,
      });
    }
  }

  // Scan for attack rolls
  if (/\battack roll\b/i.test(text) || /\b(melee|ranged)\s+attack\b/i.test(text)) {
    if (!seen.has("attack")) {
      seen.add("attack");
      chips.push({
        type: "attack",
        label: "Attack Roll",
      });
    }
  }

  return chips;
}

/**
 * Inject dice roll chip markers into markdown text.
 * Adds inline markers like `[🎲 Roll Perception]` with data attributes.
 * @param {string} text - Markdown text to inject chips into.
 * @returns {string} Text with dice roll markers appended (for plain text mode)
 *   or modified text with inline markers (for markdown mode).
 */
function injectRollChips(text) {
  const chips = scanTextForRollChips(text);
  if (chips.length === 0) return text;

  const chipMarkers = chips
    .map((chip) => {
      const attrs = [`data-dice-roll="${chip.type}"`, `data-label="${chip.label}"`];
      if (chip.skill) attrs.push(`data-skill="${chip.skill}"`);
      if (chip.ability) attrs.push(`data-ability="${chip.ability}"`);
      if (chip.dc) attrs.push(`data-dc="${chip.dc}"`);
      return `<span class="dice-roll-chip touch-target" ${attrs.join(" ")}>🎲 ${chip.label}</span>`;
    })
    .join(" ");

  return text + "\n\n" + chipMarkers;
}

module.exports = {
  scanTextForRollChips,
  injectRollChips,
  SKILL_ABILITY,
  SAVE_ABILITY,
};
