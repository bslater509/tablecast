// =============================================================================
// MapPanel Constants, Presets, and Helper Functions
// =============================================================================

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;
export const DRAG_THRESHOLD_PX = 9;

export const MAP_IMPORT_PRESETS = [
  { label: "Blank 5 ft Grid", name: "Blank Encounter Grid", path: "/uploads/placeholder_map.png", gridSize: 50 },
  { label: "AitFR Adventurer Map", name: "AitFR Encounter Map", path: "https://5e.tools/img/adventure/AitFR-AVT/13_1476395018.webp", gridSize: 70 },
  { label: "AitFR Dungeon Map", name: "AitFR Dungeon Map", path: "https://5e.tools/img/adventure/AitFR-DN/16_1476395070.webp", gridSize: 70 },
];

/**
 * Safely parse fog state JSON array.
 */
export function parseFogState(fogStr) {
  try {
    return JSON.parse(fogStr || "[]");
  } catch {
    return [];
  }
}

/**
 * Clean 5etools markup tags from text.
 */
export function cleanText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\{@spell ([^}]+)\}/g, "$1")
    .replace(/\{@dice ([^}]+)\}/g, "($1)")
    .replace(/\{@item ([^}]+)\}/g, "$1")
    .replace(/\{@creature ([^}]+)\}/g, "$1")
    .replace(/\{@condition ([^}]+)\}/g, "$1")
    .replace(/\{@hit (\d+)\}/g, "+$1")
    .replace(/\{@damage ([^}]+)\}/g, "$1")
    .replace(/\{@filter ([^|]+)\|[^}]+\}/g, "$1")
    .replace(/\{@[a-z]+ ([^}]+)\}/g, "$1");
}

/**
 * Format a number as signed modifier (e.g., +5, -2).
 */
export function formatModifier(val) {
  return val >= 0 ? `+${val}` : `${val}`;
}
