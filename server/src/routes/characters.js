// =============================================================================
// Tablecast  Character CRUD Routes
// Endpoints:  GET /api/characters          (optional ?userId=N filter)
//             GET /api/characters/:id
//             POST /api/characters
//             PUT /api/characters/:id
//             DELETE /api/characters/:id
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

// Fields that are allowed to be set/updated on a Character
const ALLOWED_FIELDS = [
  "name",
  "race",
  "class",
  "level",
  "hp",
  "maxHp",
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "inventory",
  "modifiers",
  "spellSlots",
  "spells",
  "spellcastingAbility",
  "spellSaveDc",
  "spellAttackBonus",
  "diceTheme",
  "diceColor",
];

/**
 * Validates that a value is a parseable JSON string.
 * Used for inventory (should be array) and modifiers (should be object).
 */
function isValidJson(value) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

const ALLOWED_LEVEL_RANGE = { min: 1, max: 20 };
const ALLOWED_ABILITY_RANGE = { min: 3, max: 30 };
const ALLOWED_HP_RANGE = { min: 1, max: 100000 };

function clampInt(value, fallback, min = 0, max = 100000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.round(parsed), max));
}

function validateNumericField(value, label, range) {
  const num = Number(value);
  if (value !== undefined && (!Number.isFinite(num) || num < range.min || num > range.max)) {
    return `${label} must be between ${range.min} and ${range.max}.`;
  }
  return null;
}

// Separate router for public heroes endpoint (mounted at /api/heroes)
const heroesRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/heroes  public listing for login screen (no auth required)
// ---------------------------------------------------------------------------
heroesRouter.get("/", async (_req, res) => {
  try {
    const characters = await prisma.character.findMany({
      where: { userId: null },
      select: {
        id: true,
        name: true,
        race: true,
        class: true,
        level: true,
        diceTheme: true,
        diceColor: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(characters);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/heroes", { error: err.message });
    res.status(500).json({ error: "Failed to fetch heroes." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/characters  list all characters, optionally filter by userId
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const isDM = reqUser.role === "DM";
    const where = {};
    if (req.query.userId) {
      const uId = Number(req.query.userId);
      if (isNaN(uId)) {
        return res.status(400).json({ error: "userId query parameter must be a valid number." });
      }
      // Non-DM can only filter their own characters
      if (!isDM && uId !== reqUser.id) {
        return res.status(403).json({ error: "You are not authorized to view other users' characters." });
      }
      where.userId = uId;
    } else if (!isDM) {
      if (reqUser.type === "character") {
        // Character identity — filter by character ID (heroes have userId: null)
        where.id = reqUser.id;
      } else {
        // User identity — filter by user ID
        where.userId = reqUser.id;
      }
    }

    const characters = await prisma.character.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    // Strip sensitive fields for non-owners
    const result = characters.map((c) => {
      const isOwner = c.userId === reqUser.id || (reqUser.type === "character" && c.id === reqUser.id);
      if (isOwner || isDM) return c;
      const { inventory, modifiers, spells, spellSlots, ...safe } = c;
      return safe;
    });

    res.json(result);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/characters", { error: err.message });
    res.status(500).json({ error: "Failed to fetch characters." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/characters/:id  get a single character with owner info
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const character = await prisma.character.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    const isDM = reqUser.role === "DM";
    const isOwner = character.userId === reqUser.id;
    const isSelf = reqUser.type === "character" && character.id === reqUser.id;
    if (!isDM && !isOwner && !isSelf) {
      return res.status(403).json({ error: "You are not authorized to view this character." });
    }

    // Strip sensitive fields for non-owners
    if (!isOwner && isDM) {
      // DM sees all
    } else if (!isOwner) {
      const { inventory, modifiers, spells, spellSlots, ...safe } = character;
      return res.json(safe);
    }

    res.json(character);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/characters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch character." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/characters  create a new character
// Body: { userId: number, name: string, ...optional fields }
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { userId, name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ error: "name (string) is required." });
    }

    let parsedUserId = userId ? Number(userId) : null;
    if (userId && isNaN(parsedUserId)) {
      return res.status(400).json({ error: "userId must be a valid number." });
    }

    // Authorization check
    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    // Only check ownership if userId is explicitly provided
    if (parsedUserId && reqUser.id !== parsedUserId && reqUser.role !== "DM") {
      return res.status(403).json({ error: "You are not authorized to create a character for this user." });
    }

    // Verify the owning user exists (if userId provided)
    if (parsedUserId) {
      const userExists = await prisma.user.findUnique({
        where: { id: parsedUserId },
      });
      if (!userExists) {
        return res.status(404).json({ error: "Owning user not found." });
      }
    }

    // Build data object from allowed fields
    const data = { name: name.trim() };
    if (parsedUserId) data.userId = parsedUserId;

    // Numeric range validation
    const levelErr = validateNumericField(req.body.level, "level", ALLOWED_LEVEL_RANGE);
    if (levelErr) return res.status(400).json({ error: levelErr });
    const hpErr = validateNumericField(req.body.hp, "hp", ALLOWED_HP_RANGE);
    if (hpErr) return res.status(400).json({ error: hpErr });
    const maxHpErr = req.body.maxHp !== undefined ? validateNumericField(req.body.maxHp, "maxHp", ALLOWED_HP_RANGE) : null;
    if (maxHpErr) return res.status(400).json({ error: maxHpErr });

    for (const abil of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) {
      const abilErr = validateNumericField(req.body[abil], abil, ALLOWED_ABILITY_RANGE);
      if (abilErr) return res.status(400).json({ error: abilErr });
    }

    for (const field of ALLOWED_FIELDS) {
      if (field === "name") continue; // already set
      if (req.body[field] !== undefined) {
        // Validate JSON string fields
        if ((field === "inventory" || field === "modifiers" || field === "spellSlots" || field === "spells") && !isValidJson(req.body[field])) {
          return res
            .status(400)
            .json({ error: `${field} must be a valid JSON string.` });
        }
        data[field] = req.body[field];
      }
    }

    const character = await prisma.character.create({
      data,
    });

    res.status(201).json(character);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/characters", { error: err.message });
    res.status(500).json({ error: "Failed to create character." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/characters/:id  partial update (only supplied fields change)
// Body: { ...any allowed field }
// ---------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    // Retrieve character to check ownership
    const existingChar = await prisma.character.findUnique({
      where: { id },
    });

    if (!existingChar) {
      return res.status(404).json({ error: "Character not found." });
    }

    // Authorization check
    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }
    if (existingChar.userId !== reqUser.id && reqUser.role !== "DM" && !(reqUser.type === "character" && existingChar.id === reqUser.id)) {
      return res.status(403).json({ error: "You are not authorized to update this character." });
    }

    const data = {};

    // Numeric range validation
    const levelErr = validateNumericField(req.body.level, "level", ALLOWED_LEVEL_RANGE);
    if (levelErr) return res.status(400).json({ error: levelErr });
    const hpErr = validateNumericField(req.body.hp, "hp", ALLOWED_HP_RANGE);
    if (hpErr) return res.status(400).json({ error: hpErr });
    const maxHpErr = req.body.maxHp !== undefined ? validateNumericField(req.body.maxHp, "maxHp", ALLOWED_HP_RANGE) : null;
    if (maxHpErr) return res.status(400).json({ error: maxHpErr });

    for (const abil of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) {
      const abilErr = validateNumericField(req.body[abil], abil, ALLOWED_ABILITY_RANGE);
      if (abilErr) return res.status(400).json({ error: abilErr });
    }

    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        if ((field === "inventory" || field === "modifiers" || field === "spellSlots" || field === "spells") && !isValidJson(req.body[field])) {
          return res
            .status(400)
            .json({ error: `${field} must be a valid JSON string.` });
        }
        data[field] = req.body[field];
      }
    }

    // Validate userId if provided (only DM can reassign characters)
    if (req.body.userId !== undefined) {
      if (reqUser.role !== "DM") {
        return res.status(403).json({ error: "Only a DM can change character ownership." });
      }
      const parsedUserId = req.body.userId ? Number(req.body.userId) : null;
      if (req.body.userId && isNaN(parsedUserId)) {
        return res.status(400).json({ error: "userId must be a valid number or null." });
      }
      if (parsedUserId) {
        const userExists = await prisma.user.findUnique({ where: { id: parsedUserId } });
        if (!userExists) {
          return res.status(404).json({ error: "Target user not found." });
        }
      }
      data.userId = parsedUserId;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const character = await prisma.character.update({
      where: { id },
      data,
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    res.json(character);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Character not found." });
    }
    logger.error("api:route", "Error in PUT /api/characters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update character." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/characters/:id  delete a character (tokens set null via schema)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const existingChar = await prisma.character.findUnique({
      where: { id },
    });

    if (!existingChar) {
      return res.status(404).json({ error: "Character not found." });
    }

    // Authorization check
    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }
    if (existingChar.userId !== reqUser.id && reqUser.role !== "DM" && !(reqUser.type === "character" && existingChar.id === reqUser.id)) {
      return res.status(403).json({ error: "You are not authorized to delete this character." });
    }

    await prisma.character.delete({
      where: { id },
    });

    res.json({ message: "Character deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Character not found." });
    }
    logger.error("api:route", "Error in DELETE /api/characters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete character." });
  }
});

module.exports = router;
module.exports.heroesRouter = heroesRouter;
