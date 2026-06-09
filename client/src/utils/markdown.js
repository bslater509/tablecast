// =============================================================================
// Tablecast — Shared Markdown Compilation
// Single source of truth for rendering markdown as sanitized HTML.
// Used by AiPanel, AiChatView, ChatPanel, and any other markdown-rendering
// component.
// =============================================================================
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Parse markdown text into sanitized HTML.
 * Safe to use with dangerouslySetInnerHTML.
 *
 * @param {string} text - Raw markdown text
 * @returns {string} Sanitized HTML
 */
export function compileMarkdown(text) {
  if (!text) return "";
  try {
    return DOMPurify.sanitize(marked.parse(text));
  } catch (e) {
    console.error("[markdown] Parsing failed:", e);
    return DOMPurify.sanitize(text);
  }
}
