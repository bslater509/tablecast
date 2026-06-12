"use strict";

const prisma = require("./prisma");
const debug = require("./utils/debug");
const logger = require("./utils/logger");
const log = debug("tablecast:auth");

// In-memory identity cache with TTL — reduces DB load for repeated auth checks
const CACHE_TTL_MS = 60_000; // 1 minute
const identityCache = new Map();
function getCachedIdentity(key) {
  const entry = identityCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    identityCache.delete(key);
    return null;
  }
  return entry.identity;
}
function setCachedIdentity(key, identity) {
  identityCache.set(key, { identity, ts: Date.now() });
}

// ---------------------------------------------------------------------------
// Header Parsers
// ---------------------------------------------------------------------------

function getUserId(req) {
  const raw = req.get("x-tablecast-user-id");
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getCharacterId(req) {
  const raw = req.get("x-tablecast-character-id");
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the caller's identity from either:
 *  - x-tablecast-character-id (player / hero)
 *  - x-tablecast-user-id      (DM user)
 *
 * Returns a unified identity object:
 *   { id, username, role, diceTheme, diceColor, characters, isCharacter, type }
 * or null if neither header is valid.
 */
async function getRequestIdentity(req) {
  // Check cache first
  const rawUserId = getUserId(req);
  const rawCharId = getCharacterId(req);
  const cacheKey = rawCharId ? `char:${rawCharId}` : (rawUserId ? `user:${rawUserId}` : null);
  if (cacheKey) {
    const cached = getCachedIdentity(cacheKey);
    if (cached) return cached;
  }

  // 1) Try character header first
  if (rawCharId) {
    const character = await prisma.character.findUnique({
      where: { id: rawCharId },
    });
    if (character) {
      log("getRequestIdentity — character id=%d name=%s", rawCharId, character.name);
      const identity = {
        id: character.id,
        username: character.name,
        role: "PLAYER",
        diceTheme: character.diceTheme || "default",
        diceColor: character.diceColor || "#7c3aed",
        characters: [character],
        isCharacter: true,
        type: "character",
        characterId: character.id,
      };
      setCachedIdentity(cacheKey, identity);
      return identity;
    }
  }

  // 2) Fall back to user header (DM)
  if (rawUserId) {
    const user = await prisma.user.findUnique({
      where: { id: rawUserId },
    });
    if (user) {
      log("getRequestIdentity — user id=%d username=%s role=%s", rawUserId, user.username, user.role);
      const identity = {
        id: user.id,
        username: user.username,
        role: user.role,
        diceTheme: user.diceTheme || "default",
        diceColor: user.diceColor || "#7c3aed",
        characters: [],
        isCharacter: false,
        type: "user",
        userId: user.id,
      };
      setCachedIdentity(cacheKey, identity);
      return identity;
    }

    // Fallback: if user wasn't found in users table, try characters table.
    // This handles cases where the frontend sends a character ID via
    // x-tablecast-user-id (backward compat with older components).
    const fallbackChar = await prisma.character.findUnique({
      where: { id: rawUserId },
    });
    if (fallbackChar) {
      log("getRequestIdentity — fallback character id=%d name=%s", rawUserId, fallbackChar.name);
      const identity = {
        id: fallbackChar.id,
        username: fallbackChar.name,
        role: "PLAYER",
        diceTheme: fallbackChar.diceTheme || "default",
        diceColor: fallbackChar.diceColor || "#7c3aed",
        characters: [fallbackChar],
        isCharacter: true,
        type: "character",
        characterId: fallbackChar.id,
      };
      setCachedIdentity(cacheKey, identity);
      return identity;
    }
  }

  return null;
}

/**
 * Backward-compatible: returns a User-like object or null.
 * Used by routes that need a basic identity (most player endpoints).
 *
 * For character auth, returns a pseudo-user with character data shaped
 * so that existing frontend code like `user.role`, `user.username`,
 * `user.diceTheme`, `user.id` continues to work.
 */
async function getRequestUser(req) {
  return getRequestIdentity(req);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Require a valid user identity (either character or DM user).
 */
async function requireUser(req, res, next) {
  try {
    const identity = await getRequestIdentity(req);
    if (!identity) {
      log("requireUser — no valid identity (401)");
      return res.status(401).json({ error: "A valid user or character session is required." });
    }
    req.tablecastUser = identity;
    next();
  } catch (err) {
    logger.error("auth", "requireUser error", { error: err.message });
    res.status(500).json({ error: "Failed to verify identity." });
  }
}

/**
 * Require a DM user (via x-tablecast-user-id with role "DM").
 */
async function requireDm(req, res, next) {
  try {
    const identity = await getRequestIdentity(req);
    if (!identity) {
      log("requireDm — no valid identity (401)");
      return res.status(401).json({ error: "A valid user is required." });
    }

    if (identity.type !== "user" || identity.role !== "DM") {
      log("requireDm — identity=%s role=%s (403)", identity.type, identity.role);
      return res.status(403).json({ error: "DM privileges are required." });
    }

    req.tablecastUser = identity;
    log("requireDm — user=%d authorized as DM", identity.id);
    next();
  } catch (err) {
    logger.error("auth", "requireDm error", { error: err.message });
    res.status(500).json({ error: "Failed to verify permissions." });
  }
}

/**
 * Require a player character (via x-tablecast-character-id).
 */
async function requirePlayer(req, res, next) {
  try {
    const identity = await getRequestIdentity(req);
    if (!identity) {
      log("requirePlayer — no valid identity (401)");
      return res.status(401).json({ error: "A valid character session is required." });
    }

    if (identity.type !== "character") {
      log("requirePlayer — type=%s (403)", identity.type);
      return res.status(403).json({ error: "Player character required." });
    }

    req.tablecastUser = identity;
    req.character = identity.characters?.[0] || null;
    next();
  } catch (err) {
    logger.error("auth", "requirePlayer error", { error: err.message });
    res.status(500).json({ error: "Failed to verify character identity." });
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

async function isDmUser(userId) {
  try {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      log("isDmUser — invalid userId=%s -> false", userId);
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    const result = user?.role === "DM";
    log("isDmUser — userId=%d role=%s -> %s", id, user?.role || "N/A", result);
    return result;
  } catch (err) {
    logger.error("auth", "isDmUser error", { error: err.message });
    return false;
  }
}

module.exports = {
  getUserId,
  getCharacterId,
  getRequestIdentity,
  getRequestUser,
  requireUser,
  requireDm,
  requirePlayer,
  isDmUser,
};
