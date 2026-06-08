// =============================================================================
// Tablecast  NPC CRUD Routes
// Endpoints:  GET /api/npcs
//             GET /api/npcs/:id
//             POST /api/npcs           (DM only)
//             PUT /api/npcs/:id        (DM only)
//             DELETE /api/npcs/:id     (DM only)
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm, getRequestUser } = require("../auth");
const generateTokenSvg = require("../utils/generateTokenSvg");
const logger = require("../utils/logger");

const router = Router();

// Fields that are allowed to be set/updated on an NPC
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
// GET /api/npcs  List all NPCs
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const where = {};

    // Players only see public NPCs
    if (!user || user.role !== "DM") {
      where.isVisibleToPlayers = true;
    }

    const npcs = await prisma.npc.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json(npcs);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/npcs", { error: err.message });
    res.status(500).json({ error: "Failed to fetch NPCs." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/npcs/:id  Get a single NPC by ID
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const user = await getRequestUser(req);
    const npc = await prisma.npc.findUnique({
      where: { id },
    });

    if (!npc) {
      return res.status(404).json({ error: "NPC not found." });
    }

    // If player, check visibility
    if ((!user || user.role !== "DM") && !npc.isVisibleToPlayers) {
      return res.status(403).json({ error: "You do not have permission to view this NPC." });
    }

    res.json(npc);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/npcs/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch NPC." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/npcs  Create a new NPC (DM only)
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

    // Auto-assign SVG token if none provided
    if (!data.imageUrl) {
      data.imageUrl = generateTokenSvg(data.name, data.race);
    }

    const npc = await prisma.npc.create({ data });
    res.status(201).json(npc);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/npcs", { error: err.message });
    res.status(500).json({ error: "Failed to create NPC." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/npcs/:id  Update an NPC (DM only)
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
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

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    // Auto-assign SVG token if image not provided and name/race is being updated
    if (!data.imageUrl && (data.name || data.race)) {
      data.imageUrl = generateTokenSvg(data.name || "", data.race || "");
    }

    const npc = await prisma.npc.update({
      where: { id },
      data,
    });

    res.json(npc);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "NPC not found." });
    }
    logger.error("api:route", "Error in PUT /api/npcs/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update NPC." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/npcs/:id  Delete an NPC
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    await prisma.npc.delete({
      where: { id },
    });

    res.json({ message: "NPC deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "NPC not found." });
    }
    logger.error("api:route", "Error in DELETE /api/npcs/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete NPC." });
  }
});

module.exports = router;
