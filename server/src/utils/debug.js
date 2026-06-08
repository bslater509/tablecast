// =============================================================================
// Tablecast  Lightweight Debug Logger
// Controlled via the DEBUG environment variable (e.g., DEBUG=tablecast:*)
//
// Usage:
//   const debug = require("../utils/debug");
//   const log = debug("tablecast:index");
//   log("Server starting on port %d", PORT);
//
// Environment variable patterns (comma-separated):
//   DEBUG=tablecast:*          All tablecast namespaces
//   DEBUG=tablecast:socket     Only socket events
//   DEBUG=tablecast:routes:*   All route debug messages
//   DEBUG=*                    Absolutely everything
//   (unset)                    No debug output
// =============================================================================
"use strict";

// ---------------------------------------------------------------------------
// Internal: parse the DEBUG env into enabled namespace patterns
// ---------------------------------------------------------------------------
let enabledPatterns = null;

function parseDebugEnv() {
  const raw = process.env.DEBUG || "";
  if (!raw.trim()) {
    enabledPatterns = [];
    return;
  }

  enabledPatterns = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ns) => {
      // Convert glob-style wildcard to regex
      const regexStr =
        "^" +
        ns
          .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials
          .replace(/\*/g, ".*") + // wildcard -> regex
        "$";
      return { raw: ns, regex: new RegExp(regexStr, "i") };
    });
}

// ---------------------------------------------------------------------------
// Check whether a namespace is enabled
// ---------------------------------------------------------------------------
function isEnabled(namespace) {
  if (enabledPatterns === null) parseDebugEnv();
  if (enabledPatterns.length === 0) return false;
  return enabledPatterns.some((p) => p.regex.test(namespace));
}

// ---------------------------------------------------------------------------
// Debug factory — returns a logging function for the given namespace
// ---------------------------------------------------------------------------
function createDebug(namespace) {
  const enabled = isEnabled(namespace);

  function log(...args) {
    if (!enabled) return;

    const prefix = `[${namespace}]`;
    const now = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

    if (typeof args[0] === "string") {
      // Support printf-like formatting (%s, %d, %o, %j)
      let msg = args[0];
      const fmtArgs = args.slice(1);
      let idx = 0;
      msg = msg.replace(/%[sdjo]/g, (match) => {
        if (idx >= fmtArgs.length) return match;
        const val = fmtArgs[idx++];
        switch (match) {
          case "%o":
          case "%j":
            try {
              return JSON.stringify(val);
            } catch {
              return String(val);
            }
          case "%d":
            return Number(val).toString();
          case "%s":
          default:
            return String(val);
        }
      });
      console.log(`${now} ${prefix} ${msg}`);
    } else if (args.length === 1) {
      console.log(`${now} ${prefix}`, args[0]);
    } else {
      console.log(`${now} ${prefix}`, ...args);
    }
  }

  // Expose the enabled flag so callers can skip expensive work if debug is off
  log.enabled = enabled;

  return log;
}

module.exports = createDebug;
