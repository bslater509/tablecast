// =============================================================================
// Tablecast — Session Panel Utilities
// Pure helper functions for the Session Planning & Management Panel.
// =============================================================================
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

export function compileMarkdown(text) {
  if (!text) return "";
  return DOMPurify.sanitize(marked.parse(text));
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function parseIdArray(value) {
  return parseJson(value, []).filter((id) => Number.isInteger(Number(id)));
}

export function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function checklistProgress(checklistJson) {
  const items = parseJson(checklistJson, []);
  if (!items.length) return { done: 0, total: 0 };
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length };
}

export function statusStyle(status) {
  if (status === "ACTIVE") {
    return { background: "rgba(34, 197, 94, 0.15)", color: "#86efac" };
  }
  if (status === "COMPLETED") {
    return { background: "rgba(148, 163, 184, 0.15)", color: "#cbd5e1" };
  }
  return { background: "rgba(200, 151, 58, 0.15)", color: "var(--color-accent)" };
}
