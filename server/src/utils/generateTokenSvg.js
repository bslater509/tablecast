"use strict";

// ---------------------------------------------------------------------------
// SVG Token Generator
// Produces an SVG data URI: a colored circle with a letter representing the
// NPC/character.  Used as a fallback imageUrl when no real token art exists.
// ---------------------------------------------------------------------------

const COLOR_MAP = [
  { keywords: ["bandit", "thief", "rogue", "assassin", "mercenary"], color: "#8B2252" },
  { keywords: ["goblin", "hobgoblin", "bugbear"], color: "#2E7D32" },
  { keywords: ["goblin boss", "hobgoblin captain"], color: "#1B5E20", borderColor: "#FFD700" },
  { keywords: ["skeleton", "undead", "zombie", "ghoul", "wight", "ghost"], color: "#546E7A" },
  { keywords: ["orc", "half-orc", "ogrillon", "ogre"], color: "#4E342E" },
  { keywords: ["guard", "soldier", "knight", "paladin", "watch"], color: "#1565C0" },
  { keywords: ["cultist", "fanatic", "priest", "acolyte"], color: "#6A1B9A" },
  { keywords: ["wolf", "dire wolf", "worg"], color: "#37474F" },
  { keywords: ["dragon", "wyrm", "drake"], color: "#BF360C" },
  { keywords: ["giant", "troll", "titan"], color: "#3E2723" },
  { keywords: ["elf", "drow", "elven"], color: "#1B5E20" },
  { keywords: ["dwarf", "dwarven"], color: "#4E342E" },
  { keywords: ["halfling", "hobbit"], color: "#795548" },
  { keywords: ["dragonborn"], color: "#B71C1C" },
  { keywords: ["tiefling"], color: "#4A148C" },
  { keywords: ["gnome"], color: "#33691E" },
  { keywords: ["fairy", "fey", "sprite"], color: "#AD1457" },
  { keywords: ["beast", "bear", "lion", "tiger"], color: "#4E342E" },
];

const DEFAULT_COLOR = "#555";

function pickColor(name = "", race = "") {
  const search = `${name} ${race}`.toLowerCase();
  const match = COLOR_MAP.find((entry) =>
    entry.keywords.some((kw) => search.includes(kw))
  );
  return match || { color: DEFAULT_COLOR };
}

/**
 * Generate an SVG data URI token for an NPC/character.
 * @param {string} name - NPC or character name
 * @param {string} [race] - Optional race/type for better color matching
 * @returns {string} data:image/svg+xml;base64,...
 */
function generateTokenSvg(name, race) {
  const letter = (name || "?")[0].toUpperCase();
  const { color, borderColor } = pickColor(name, race);
  const border = borderColor || "rgba(255,255,255,0.2)";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="${color}"/>
  <circle cx="50" cy="50" r="44" fill="none" stroke="${border}" stroke-width="3"/>
  <text x="50" y="56" text-anchor="middle" font-size="38" font-weight="bold" fill="white" font-family="sans-serif">${letter}</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

module.exports = generateTokenSvg;
