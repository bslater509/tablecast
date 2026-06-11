// =============================================================================
// Tablecast MCP Server — Shared Helper Functions
// =============================================================================
"use strict";

// Ability score modifier calculator
const calculateModifier = (score) => Math.floor((score - 10) / 2);

// Auto-calculate full set of D&D 5e modifiers based on stats object
const generateModifiers = (stats) => {
  return {
    strength: calculateModifier(stats.strength ?? 10),
    dexterity: calculateModifier(stats.dexterity ?? 10),
    constitution: calculateModifier(stats.constitution ?? 10),
    intelligence: calculateModifier(stats.intelligence ?? 10),
    wisdom: calculateModifier(stats.wisdom ?? 10),
    charisma: calculateModifier(stats.charisma ?? 10),
  };
};

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
};

const parseJsonArray = (value) => {
  const parsed = safeJsonParse(value, []);
  return Array.isArray(parsed) ? parsed : [];
};

const parseJsonObject = (value) => {
  const parsed = safeJsonParse(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const toJsonArrayString = (value, fieldName, fallback = []) => {
  if (value === undefined || value === null || value === "") {
    return JSON.stringify(fallback);
  }

  const parsed = typeof value === "string" ? safeJsonParse(value, null) : value;
  if (!Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON array.`);
  }

  return JSON.stringify(parsed);
};

const toJsonObjectString = (value, fieldName, fallback = {}) => {
  if (value === undefined || value === null || value === "") {
    return JSON.stringify(fallback);
  }

  const parsed = typeof value === "string" ? safeJsonParse(value, null) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }

  return JSON.stringify(parsed);
};

const VALID_ENCOUNTER_STATUSES = new Set(["DRAFT", "ACTIVE", "COMPLETE"]);
const VALID_SESSION_STATUSES = new Set(["PLANNED", "ACTIVE", "COMPLETED"]);

module.exports = {
  calculateModifier,
  generateModifiers,
  safeJsonParse,
  parseJsonArray,
  parseJsonObject,
  toJsonArrayString,
  toJsonObjectString,
  VALID_ENCOUNTER_STATUSES,
  VALID_SESSION_STATUSES,
};
