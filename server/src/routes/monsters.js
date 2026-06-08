// =============================================================================
// Tablecast  Monster CRUD Routes
// Endpoints:  GET /api/monsters
//             GET /api/monsters/:id
//             POST /api/monsters           (DM only)
//             PUT /api/monsters/:id        (DM only)
//             DELETE /api/monsters/:id     (DM only)
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm, getRequestUser } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

// Fields that are allowed to be set/updated on a Monster
const ALLOWED_FIELDS = [
  "name",
  "race",
  "class",
  "level",
  "hp",
  "maxHp",
  "ac",
  "cr",
  "imageUrl",
  "largeImageUrl",
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "inventory",
  "modifiers",
  "actions",
  "description",
  "alignment",
  "appearance",
  "personality",
  "history",
  "partyRelationship",
  "isVisibleToPlayers",
];

function isValidJson(value) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET /api/monsters  List all Monsters
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const where = {};

    // Players only see public Monsters
    if (!user || user.role !== "DM") {
      where.isVisibleToPlayers = true;
    }

    const monsters = await prisma.monster.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json(monsters);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/monsters", { error: err.message });
    res.status(500).json({ error: "Failed to fetch Monsters." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/monsters/:id  Get a single Monster by ID
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const user = await getRequestUser(req);
    const monster = await prisma.monster.findUnique({
      where: { id },
    });

    if (!monster) {
      return res.status(404).json({ error: "Monster not found." });
    }

    // If player, check visibility
    if ((!user || user.role !== "DM") && !monster.isVisibleToPlayers) {
      return res.status(403).json({ error: "You do not have permission to view this Monster." });
    }

    res.json(monster);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/monsters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch Monster." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/monsters  Create a new Monster (DM only)
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name (string) is required." });
    }

    const data = { name: name.trim() };

    for (const field of ALLOWED_FIELDS) {
      if (field === "name") continue;
      if (req.body[field] !== undefined) {
        if (
          (field === "inventory" || field === "modifiers" || field === "actions") &&
          !isValidJson(req.body[field])
        ) {
          return res
            .status(400)
            .json({ error: `${field} must be a valid JSON string.` });
        }
        if (field === "isVisibleToPlayers") {
          data[field] = req.body[field] === true || req.body[field] === "true";
        } else {
          data[field] = req.body[field];
        }
      }
    }

    const monster = await prisma.monster.create({ data });
    res.status(201).json(monster);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/monsters", { error: err.message });
    res.status(500).json({ error: "Failed to create Monster." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/monsters/:id  Update a Monster (DM only)
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const check = await prisma.monster.findUnique({ where: { id } });
    if (!check) {
      return res.status(404).json({ error: "Monster not found." });
    }

    const data = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        if (
          (field === "inventory" || field === "modifiers" || field === "actions") &&
          !isValidJson(req.body[field])
        ) {
          return res
            .status(400)
            .json({ error: `${field} must be a valid JSON string.` });
        }
        if (field === "isVisibleToPlayers") {
          data[field] = req.body[field] === true || req.body[field] === "true";
        } else {
          data[field] = req.body[field];
        }
      }
    }

    const monster = await prisma.monster.update({
      where: { id },
      data,
    });
    res.json(monster);
  } catch (err) {
    logger.error("api:route", "Error in PUT /api/monsters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update Monster." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/monsters/:id  Delete a Monster (DM only)
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const check = await prisma.monster.findUnique({ where: { id } });
    if (!check) {
      return res.status(404).json({ error: "Monster not found." });
    }

    await prisma.monster.delete({ where: { id } });
    res.json({ success: true, message: "Monster deleted successfully." });
  } catch (err) {
    logger.error("api:route", "Error in DELETE /api/monsters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete Monster." });
  }
});

module.exports = router;
