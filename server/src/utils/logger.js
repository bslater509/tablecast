// =============================================================================
// Tablecast — Structured JSON Logger
// Outputs JSON lines to stdout (info/debug/warn) and stderr (error).
//
// Usage:
//   const log = require("../utils/logger");
//   log.info("server", "Server started", { port: 3001 });
//   log.error("ai:chat", "Chat failed", { error: err.message, conversationId: 5 });
//
// Environment variables:
//   LOG_LEVEL=debug   Show all messages (default: info)
//   LOG_LEVEL=error   Show only errors
//   LOG_LEVEL=silent  Suppress all output
// =============================================================================
"use strict";

const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(level, ns, msg, meta = {}) {
  if (LEVELS[level] === undefined) return;
  if (LEVELS[level] > currentLevel) return;

  const entry = {
    level,
    ts: new Date().toISOString(),
    ns,
    msg,
    ...meta,
  };

  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
}

module.exports = {
  error: (ns, msg, meta) => log("error", ns, msg, meta),
  warn: (ns, msg, meta) => log("warn", ns, msg, meta),
  info: (ns, msg, meta) => log("info", ns, msg, meta),
  debug: (ns, msg, meta) => log("debug", ns, msg, meta),
};
