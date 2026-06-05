// =============================================================================
// Tablecast — Character CRUD Routes
// Endpoints:  GET /api/characters          (optional ?userId=N filter)
//             GET /api/characters/:id
//             POST /api/characters
//             PUT /api/characters/:id
//             DELETE /api/characters/:id
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");

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

// ---------------------------------------------------------------------------
// GET /api/characters — list all characters, optionally filter by userId
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const where = {};
    if (req.query.userId) {
      where.userId = Number(req.query.userId);
    }

    const characters = await prisma.character.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    res.json(characters);
  } catch (err) {
    console.error("[API] GET /api/characters error:", err.message);
    res.status(500).json({ error: "Failed to fetch characters." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/characters/:id — get a single character with owner info
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: Number(req.params.id) },
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    res.json(character);
  } catch (err) {
    console.error("[API] GET /api/characters/:id error:", err.message);
    res.status(500).json({ error: "Failed to fetch character." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/characters — create a new character
// Body: { userId: number, name: string, ...optional fields }
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { userId, name } = req.body;

    if (!userId || !name || typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ error: "userId (number) and name (string) are required." });
    }

    // Verify the owning user exists
    const userExists = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });
    if (!userExists) {
      return res.status(404).json({ error: "Owning user not found." });
    }

    // Build data object from allowed fields
    const data = { userId: Number(userId), name: name.trim() };

    for (const field of ALLOWED_FIELDS) {
      if (field === "name") continue; // already set
      if (req.body[field] !== undefined) {
        // Validate JSON string fields
        if ((field === "inventory" || field === "modifiers") && !isValidJson(req.body[field])) {
          return res
            .status(400)
            .json({ error: `${field} must be a valid JSON string.` });
        }
        data[field] = req.body[field];
      }
    }

    const character = await prisma.character.create({
      data,
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    res.status(201).json(character);
  } catch (err) {
    console.error("[API] POST /api/characters error:", err.message);
    res.status(500).json({ error: "Failed to create character." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/characters/:id — partial update (only supplied fields change)
// Body: { ...any allowed field }
// ---------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const data = {};

    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        if ((field === "inventory" || field === "modifiers") && !isValidJson(req.body[field])) {
          return res
            .status(400)
            .json({ error: `${field} must be a valid JSON string.` });
        }
        data[field] = req.body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const character = await prisma.character.update({
      where: { id: Number(req.params.id) },
      data,
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    res.json(character);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Character not found." });
    }
    console.error("[API] PUT /api/characters/:id error:", err.message);
    res.status(500).json({ error: "Failed to update character." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/characters/:id — delete a character (tokens set null via schema)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    await prisma.character.delete({
      where: { id: Number(req.params.id) },
    });

    res.json({ message: "Character deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Character not found." });
    }
    console.error("[API] DELETE /api/characters/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete character." });
  }
});

module.exports = router;
