// =============================================================================
// Tablecast — Wiki Panel Utility Functions (Extracted from WikiPanel)
// Pure utility functions for D&D 5e data formatting and markdown rendering
// =============================================================================
import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Calculate ability modifier from a D&D 5e ability score (0-30).
 * @param {number} score - Ability score (defaults to 10)
 * @returns {string} Formatted modifier like "+3" or "-1"
 */
export function calculateModifier(score) {
  const mod = Math.floor((Number(score || 10) - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Build an image generation prompt from NPC data for AI art tools.
 * Combines name, race, class, alignment, appearance, personality,
 * description, and equipment into a detailed prompt string.
 * @param {object} npc - NPC or Monster data object
 * @param {string} styleSuffix - Optional DM-configured style suffix
 * @returns {string} Combined prompt string
 */
export function buildImagePrompt(npc, styleSuffix = "") {
  const parts = [];
  // Core identity
  parts.push(`Fantasy portrait of ${npc.name || "an NPC"}`);
  if (npc.race) parts.push(`a ${npc.race}`);
  if (npc.class) parts.push(`${npc.class}`);
  // Alignment / vibe
  if (npc.alignment) parts.push(`with a ${npc.alignment.toLowerCase()} alignment`);
  // Appearance (strip markdown for cleaner prompt)
  if (npc.appearance) {
    const clean = npc.appearance.replace(/[*#>_~[\]]/g, "").trim();
    if (clean) parts.push(clean);
  }
  // Personality flavour
  if (npc.personality) {
    const clean = npc.personality.replace(/[*#>_~[\]]/g, "").trim().slice(0, 160);
    if (clean) parts.push(`Personality: ${clean}`);
  }
  // Description / location hints
  if (npc.description) {
    const clean = npc.description.replace(/[*#>_~[\]]/g, "").trim().slice(0, 200);
    if (clean) parts.push(clean);
  }
  // Gear / equipment from actions
  if (npc.actions) {
    try {
      const actions = JSON.parse(npc.actions);
      const weaponNames = actions.map(a => a.name).filter(Boolean).slice(0, 3);
      if (weaponNames.length > 0) {
        parts.push(`wielding ${weaponNames.join(", ")}`);
      }
    } catch (e) {
      // Silently ignore unparseable actions
    }
  }
  // Default style qualifier
  parts.push("D&D 5e character art, detailed fantasy illustration, full body portrait, professional lighting");
  // Append DM's custom style suffix from settings (if any)
  if (styleSuffix) {
    parts.push(styleSuffix);
  }
  return parts.join(", ");
}

/**
 * Compile Markdown text into safe HTML.
 * Uses `marked` for parsing and DOMPurify for XSS prevention.
 * @param {string} markdownText - Raw markdown text
 * @returns {string} Sanitized HTML string
 */
export function compileMarkdown(markdownText) {
  if (!markdownText) return "";
  try {
    const rawHtml = marked.parse(markdownText);
    return DOMPurify.sanitize(rawHtml);
  } catch (e) {
    console.error("[WikiPanel] Markdown parsing failed:", e);
    return "<p style='color:var(--color-danger);'>Failed to parse content.</p>";
  }
}

/**
 * Parse 5eTools alignment format into a human-readable string.
 * Handles arrays of alignment objects, single-letter codes (L, C, G, E, N, A, U),
 * and raw alignment strings.
 * @param {string|Array} alignment - Raw alignment from 5eTools data
 * @returns {string} Human-readable alignment like "Lawful Good" or "Unaligned"
 */
export function parse5eToolsAlignment(alignment) {
  if (!alignment) return "Unaligned";
  if (typeof alignment === "string") return alignment;
  if (!Array.isArray(alignment)) return "Unaligned";

  const codes = alignment.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && Array.isArray(item.alignment)) {
      return item.alignment;
    }
    return "";
  }).flat().filter(Boolean);

  if (codes.length === 0) return "Unaligned";
  if (codes.includes("A")) return "Any alignment";
  if (codes.includes("U")) return "Unaligned";

  const mapping = {
    L: "Lawful",
    C: "Chaotic",
    G: "Good",
    E: "Evil",
    N: "Neutral"
  };

  if (codes.length === 1 && codes[0] === "N") return "Neutral";

  const words = codes.map(c => mapping[c] || c);
  return words.join(" ");
}
