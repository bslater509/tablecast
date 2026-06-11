// =============================================================================
// Tablecast — AI Shared Helpers: Formatting
// Text formatting, cleaning, prompt formatting, and JSON helpers
// =============================================================================
"use strict";

// ---------------------------------------------------------------------------
// Prompt Formatting Helpers
// ---------------------------------------------------------------------------
function formatCreaturePromptList(items, kind) {
  return items.map((item) => {
    if (kind === "monster") {
      return `- ${item.name} | type: ${item.race || "unknown"} | class: ${item.class || "monster"} | CR: ${item.cr || "0"} | ${item.description || ""}`;
    }
    return `- ${item.name} | race: ${item.race || "unknown"} | class: ${item.class || "unknown"} | level: ${item.level || 1} | ${item.description || ""}`;
  }).join("\n");
}

function formatEntityList(items, formatter) {
  return items.map(formatter).filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Text Cleaning Helpers
// ---------------------------------------------------------------------------
function cleanText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\{@spell ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@dice ([^}|]+)[^}]*\}/g, "($1)")
    .replace(/\{@item ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@creature ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@condition ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@filter ([^|]+)\|[^}]+\}/g, "$1")
    .replace(/\{@table ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@style ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@[a-z]+ ([^}|]+)[^}]*\}/g, "$1");
}

function stringifyEntries(entries) {
  if (!entries) return "";
  if (typeof entries === "string") return cleanText(entries);
  if (Array.isArray(entries)) {
    return entries.map(e => {
      if (typeof e === "string") return cleanText(e);
      if (e && typeof e === "object") {
        if (e.name && e.entries) return `${e.name}: ${stringifyEntries(e.entries)}`;
        if (e.entry) return cleanText(e.entry);
        if (e.items) return e.items.map(it => typeof it === "string" ? cleanText(it) : stringifyEntries(it.entries || it)).join(", ");
      }
      return "";
    }).join("\n");
  }
  return "";
}

function cleanAiFieldOutput(text, field) {
  if (typeof text !== "string") return "";
  let out = text.trim();
  out = out.replace(/^```(?:markdown|md|json)?\n?([\s\S]*?)```$/m, "$1").trim();
  out = out.replace(/^(here('s| is) (an |the )?(expanded|rewritten|generated|updated)[^:]*:\s*)/i, "");
  out = out.replace(/^["']([\s\S]*)["']$/, "$1").trim();
  if (field === "alignment") {
    const firstLine = out.split("\n").map((l) => l.trim()).find(Boolean);
    out = (firstLine || out).slice(0, 120);
  }
  return out.trim();
}

function stripAiJsonCodeFences(text) {
  let out = typeof text === "string" ? text.trim() : "";
  if (out.startsWith("```")) {
    const match = out.match(/```(?:json)?([\s\S]+?)```/);
    if (match) {
      out = match[1].trim();
    }
  }
  return out;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  formatCreaturePromptList,
  formatEntityList,
  cleanText,
  stringifyEntries,
  cleanAiFieldOutput,
  stripAiJsonCodeFences,
  parseJsonArray,
};
