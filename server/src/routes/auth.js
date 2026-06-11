// =============================================================================
// Tablecast  DM Auth Routes
// Endpoints:  GET  /api/auth/status            (public)
//             POST /api/auth/setup              (one-time, no auth)
//             POST /api/auth/login              (public)
//             POST /api/auth/change-password    (DM auth required)
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm } = require("../auth");
const logger = require("../utils/logger");
const { scrypt, randomBytes, timingSafeEqual } = require("node:crypto");

const router = Router();

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const N = 16384; // scrypt cost parameters
const r = 8;
const p = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hash a password using scrypt with a random salt.
 * Returns "salt:hash" as base64.
 */
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_LENGTH);
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p }, (err, key) => {
      if (err) return reject(err);
      resolve(`${salt.toString("base64")}:${key.toString("base64")}`);
    });
  });
}

/**
 * Verify a password against a "salt:hash" string.
 */
async function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const parts = stored.split(":");
    if (parts.length !== 2) return resolve(false);
    const salt = Buffer.from(parts[0], "base64");
    const expectedKey = Buffer.from(parts[1], "base64");
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p }, (err, derivedKey) => {
      if (err) return reject(err);
      if (derivedKey.length !== expectedKey.length) return resolve(false);
      resolve(timingSafeEqual(derivedKey, expectedKey));
    });
  });
}

/**
 * Find the single DM user, or null if none exists.
 */
async function findDm() {
  return prisma.user.findFirst({
    where: { role: "DM" },
    orderBy: { id: "asc" },
  });
}

/**
 * Build the DM identity object (same shape as handleSelectDm expects).
 */
function dmIdentity(dm) {
  return {
    id: dm.id,
    username: dm.username,
    role: "DM",
    characters: [],
    diceTheme: dm.diceTheme || "default",
    diceColor: dm.diceColor || "#7c3aed",
    isCharacter: false,
    characterId: null,
    userId: dm.id,
  };
}

// ---------------------------------------------------------------------------
// GET /api/auth/status — public, tells the login screen what to show
// ---------------------------------------------------------------------------
router.get("/status", async (_req, res) => {
  try {
    const dm = await findDm();
    if (!dm) {
      return res.json({ dmExists: false, passwordSet: false });
    }
    return res.json({
      dmExists: true,
      passwordSet: dm.passwordHash !== null && dm.passwordHash !== "",
    });
  } catch (err) {
    logger.error("api:auth", "Error in GET /api/auth/status", { error: err.message });
    res.status(500).json({ error: "Failed to check auth status." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/setup — one-time: set the DM's password (only when null)
// Body: { password }
// ---------------------------------------------------------------------------
router.post("/setup", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== "string" || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: "Password is too long." });
    }

    const dm = await findDm();
    if (!dm) {
      return res.status(404).json({ error: "No DM account found. Run the database seed first." });
    }

    if (dm.passwordHash) {
      return res.status(409).json({ error: "DM password is already set. Use /api/auth/login instead." });
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: dm.id },
      data: { passwordHash },
    });

    logger.info("api:auth", "DM password set up", { userId: dm.id });
    res.json(dmIdentity({ ...dm, passwordHash }));
  } catch (err) {
    logger.error("api:auth", "Error in POST /api/auth/setup", { error: err.message });
    res.status(500).json({ error: "Failed to set up DM password." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — verify password, return DM identity
// Body: { password }
// ---------------------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password is required." });
    }

    const dm = await findDm();
    if (!dm) {
      return res.status(404).json({ error: "No DM account found." });
    }

    if (!dm.passwordHash) {
      return res.status(400).json({ error: "DM password has not been set up yet. Use /api/auth/setup first." });
    }

    const valid = await verifyPassword(password, dm.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    logger.info("api:auth", "DM login successful", { userId: dm.id });
    res.json(dmIdentity(dm));
  } catch (err) {
    logger.error("api:auth", "Error in POST /api/auth/login", { error: err.message });
    res.status(500).json({ error: "Login failed." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password — requires DM auth
// Body: { currentPassword, newPassword }
// ---------------------------------------------------------------------------
router.post("/change-password", requireDm, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ error: "currentPassword and newPassword are required." });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "New password must be at least 4 characters." });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ error: "New password is too long." });
    }

    const dm = await findDm();
    if (!dm) {
      return res.status(404).json({ error: "No DM account found." });
    }

    const valid = await verifyPassword(currentPassword, dm.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: dm.id },
      data: { passwordHash },
    });

    logger.info("api:auth", "DM password changed", { userId: dm.id });
    res.json({ message: "Password changed successfully." });
  } catch (err) {
    logger.error("api:auth", "Error in POST /api/auth/change-password", { error: err.message });
    res.status(500).json({ error: "Failed to change password." });
  }
});

module.exports = router;
