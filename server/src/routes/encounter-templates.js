// =============================================================================
// Tablecast  Encounter Template CRUD Routes
// Endpoints:  GET  /api/encounter-templates
//             GET  /api/encounter-templates/:id
//             POST /api/encounter-templates
//             PUT  /api/encounter-templates/:id
//             DELETE /api/encounter-templates/:id
//             POST /api/encounter-templates/:id/apply
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard", "deadly"]);

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatTemplate(t) {
  return {
    ...t,
    tags: parseJsonArray(t.tags),
    participants: parseJsonArray(t.participants),
  };
}

/**
 * Resolve a participant template to link data (HP, AC, etc.) from the
 * referenced source NPC, Monster, or Character.
 */
async function resolveParticipantData(sourceType, sourceId) {
  const data = { currentHp: 1, maxHp: 1, ac: 10, imageUrl: "", stats: null };
  if (!sourceId) return data;

  try {
    if (sourceType === "npc") {
      const npc = await prisma.npc.findUnique({ where: { id: sourceId } });
      if (npc) {
        data.currentHp = npc.hp || 1;
        data.maxHp = npc.hp || 1;
        data.ac = npc.ac || 10;
        data.imageUrl = npc.imageUrl || "";
      }
    } else if (sourceType === "monster") {
      const monster = await prisma.monster.findUnique({ where: { id: sourceId } });
      if (monster) {
        data.currentHp = monster.hp || 1;
        data.maxHp = monster.hp || 1;
        data.ac = monster.ac || 10;
        data.imageUrl = monster.imageUrl || "";
      }
    } else if (sourceType === "character") {
      const character = await prisma.character.findUnique({ where: { id: sourceId } });
      if (character) {
        data.currentHp = character.hp || 1;
        data.maxHp = character.hp || 1;
        data.ac = character.ac || 10;
        data.imageUrl = character.imageUrl || "";
      }
    }
  } catch {
    // Silently fall back to defaults if the source record is gone
  }

  return data;
}

// ---------------------------------------------------------------------------
// GET /api/encounter-templates  list all templates
// Query params: ?difficulty=easy  filter by difficulty
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const where = {};
    if (req.query.difficulty) {
      const d = String(req.query.difficulty).toLowerCase();
      if (!VALID_DIFFICULTIES.has(d)) {
        return res.status(400).json({ error: `difficulty must be one of: ${[...VALID_DIFFICULTIES].join(", ")}` });
      }
      where.difficulty = d;
    }

    const templates = await prisma.encounterTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    res.json(templates.map(formatTemplate));
  } catch (err) {
    logger.error("api:route", "Error in GET /api/encounter-templates", { error: err.message });
    res.status(500).json({ error: "Failed to fetch encounter templates." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/encounter-templates/:id  get a single template
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const template = await prisma.encounterTemplate.findUnique({ where: { id } });
    if (!template) {
      return res.status(404).json({ error: "Encounter template not found." });
    }

    res.json(formatTemplate(template));
  } catch (err) {
    logger.error("api:route", "Error in GET /api/encounter-templates/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch encounter template." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/encounter-templates  create a new template (DM only)
// Body: { name, description?, difficulty?, recommendedLevel?, tags?, participants?, mapId? }
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { name, description, difficulty, recommendedLevel, tags, participants, mapId } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required." });
    }

    if (difficulty !== undefined) {
      const d = String(difficulty).toLowerCase();
      if (!VALID_DIFFICULTIES.has(d)) {
        return res.status(400).json({ error: `difficulty must be one of: ${[...VALID_DIFFICULTIES].join(", ")}` });
      }
    }

    const data = {
      name: name.trim().slice(0, 120),
      description: description !== undefined ? String(description).slice(0, 2000) : "",
      difficulty: difficulty !== undefined ? String(difficulty).toLowerCase() : "medium",
      recommendedLevel: recommendedLevel !== undefined ? Math.max(1, Math.min(20, Number(recommendedLevel) || 1)) : 1,
      tags: tags !== undefined ? JSON.stringify(tags) : "[]",
      participants: participants !== undefined ? JSON.stringify(participants) : "[]",
    };

    if (mapId !== undefined) {
      const mId = Number(mapId);
      if (Number.isInteger(mId) && mId > 0) {
        data.mapId = mId;
      }
    }

    const template = await prisma.encounterTemplate.create({ data });
    res.status(201).json(formatTemplate(template));
  } catch (err) {
    logger.error("api:route", "Error in POST /api/encounter-templates", { error: err.message });
    res.status(500).json({ error: "Failed to create encounter template." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/encounter-templates/:id  update a template (DM only)
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { name, description, difficulty, recommendedLevel, tags, participants, mapId } = req.body;
    const data = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string." });
      }
      data.name = name.trim().slice(0, 120);
    }
    if (description !== undefined) data.description = String(description).slice(0, 2000);
    if (difficulty !== undefined) {
      const d = String(difficulty).toLowerCase();
      if (!VALID_DIFFICULTIES.has(d)) {
        return res.status(400).json({ error: `difficulty must be one of: ${[...VALID_DIFFICULTIES].join(", ")}` });
      }
      data.difficulty = d;
    }
    if (recommendedLevel !== undefined) data.recommendedLevel = Math.max(1, Math.min(20, Number(recommendedLevel) || 1));
    if (tags !== undefined) data.tags = JSON.stringify(tags);
    if (participants !== undefined) data.participants = JSON.stringify(participants);
    if (mapId !== undefined) {
      const mId = Number(mapId);
      data.mapId = (Number.isInteger(mId) && mId > 0) ? mId : null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const template = await prisma.encounterTemplate.update({ where: { id }, data });
    res.json(formatTemplate(template));
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Encounter template not found." });
    }
    logger.error("api:route", "Error in PUT /api/encounter-templates/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update encounter template." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/encounter-templates/:id  delete a template (DM only)
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    await prisma.encounterTemplate.delete({ where: { id } });
    res.json({ message: "Encounter template deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Encounter template not found." });
    }
    logger.error("api:route", "Error in DELETE /api/encounter-templates/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete encounter template." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/encounter-templates/:id/apply  apply a template to create a live
//   encounter (DM only).
// Body: { mapId?, name? }
// ---------------------------------------------------------------------------
router.post("/:id/apply", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const template = await prisma.encounterTemplate.findUnique({ where: { id } });
    if (!template) {
      return res.status(404).json({ error: "Encounter template not found." });
    }

    // Determine which map to use: request body overrides template.mapId
    const mapId = Number(req.body?.mapId) || template.mapId;
    if (!mapId || !Number.isInteger(mapId) || mapId <= 0) {
      return res.status(400).json({ error: "A valid mapId is required. Set one on the template or pass one in the request body." });
    }

    const map = await prisma.map.findUnique({ where: { id: mapId } });
    if (!map) return res.status(404).json({ error: "Map not found." });

    const encounterName = req.body?.name
      ? String(req.body.name).trim().slice(0, 120)
      : `${template.name}`.slice(0, 120);

    // Create the encounter
    const encounter = await prisma.encounter.create({
      data: {
        mapId,
        name: encounterName || `${template.name} Encounter`,
        status: "DRAFT",
      },
    });

    // Resolve participants
    const rawParticipants = parseJsonArray(template.participants);
    const participantDataList = [];

    for (let idx = 0; idx < rawParticipants.length; idx += 1) {
      const p = rawParticipants[idx];
      const name = p.name || "Combatant";
      const sourceType = p.sourceType || "placeholder";
      const count = Math.max(1, Number(p.count) || 1);
      const sourceId = p.sourceId ? Number(p.sourceId) : null;

      // Resolve stats from linked source
      const srcData = await resolveParticipantData(sourceType, sourceId);

      for (let c = 0; c < count; c += 1) {
        const participantName = count > 1 ? `${name} ${c + 1}` : name;

        const participantPayload = {
          encounterId: encounter.id,
          name: participantName,
          currentHp: srcData.currentHp,
          maxHp: srcData.maxHp,
          ac: srcData.ac,
          isHidden: false,
          sortOrder: idx,
          source: sourceType,
          imageUrl: srcData.imageUrl,
          stats: srcData.stats,
        };

        // Link to source entity if sourceId is provided
        if (sourceType === "npc" && sourceId) participantPayload.npcId = sourceId;
        else if (sourceType === "monster" && sourceId) participantPayload.monsterId = sourceId;
        else if (sourceType === "character" && sourceId) participantPayload.characterId = sourceId;
        // "placeholder" type has no link — DM fills in later

        participantDataList.push(participantPayload);
      }
    }

    // Bulk create participants
    if (participantDataList.length > 0) {
      await prisma.encounterParticipant.createMany({ data: participantDataList });
    }

    // Fetch and return the full encounter
    const result = await prisma.encounter.findUnique({
      where: { id: encounter.id },
      include: {
        map: true,
        participants: {
          include: { token: true, npc: true, character: true, monster: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    res.status(201).json(result);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/encounter-templates/:id/apply", { error: err.message });
    res.status(500).json({ error: "Failed to apply encounter template." });
  }
});

module.exports = router;
