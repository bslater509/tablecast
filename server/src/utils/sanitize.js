// =============================================================================
// Tablecast — Input Sanitization Utilities
// Provides text sanitization for chat messages and other user-provided text
// to prevent XSS and ensure consistent formatting.
// =============================================================================
"use strict";

/**
 * Strips HTML tags from a string to prevent XSS.
 * Also normalizes whitespace and enforces a maximum length.
 *
 * @param {string} text - The input text to sanitize
 * @param {object} [options]
 * @param {number} [options.maxLength=2000] - Maximum allowed length
 * @returns {string} Sanitized text
 */
function sanitizeText(text, options = {}) {
  const { maxLength = 2000 } = options;

  if (typeof text !== "string") return "";

  // Strip HTML tags — prevents XSS in chat/wiki content
  let clean = text.replace(/<[^>]*>/g, "");

  // Normalize whitespace
  clean = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Trim leading/trailing whitespace
  clean = clean.trim();

  // Enforce max length
  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
  }

  return clean;
}

/**
 * Sanitize a short text field (e.g., sender name, label).
 * Strips HTML, trims, and returns the fallback if the result is empty.
 *
 * @param {string|null|undefined} text
 * @param {string} [fallback=""] - Value to return if text is not a string or empty
 * @param {number} [maxLength=240]
 * @returns {string}
 */
function sanitizeShortText(text, fallback = "", maxLength = 240) {
  if (typeof text !== "string") return fallback;
  const clean = text.replace(/<[^>]*>/g, "").trim();
  return clean ? clean.slice(0, maxLength) : fallback;
}

module.exports = { sanitizeText, sanitizeShortText };
