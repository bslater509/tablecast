// =============================================================================
// Tablecast  Quest CRUD Routes
// Endpoints:  GET    /api/quests             (?status= & ?visible=)
//             GET    /api/quests/:id
//             POST   /api/quests
//             PUT    /api/quests/:id
//             DELETE /api/quests/:id
//             PATCH  /api/quests/:id/toggle-objective
//             PATCH  /api/quests/:id/assign
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser, requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();
const VALID_STATUSES = new Set(["ACTIVE", "COMPLETED", "FAILED"]);

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// GET /api/quests  list all quests
// Query params:
//   ?status=ACTIVE   filter by status
//   ?visible=true    return only player-visible quests (for non-DM users)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const where = {};

    // Players see only visible quests
    if (!user || user.role !== "DM") {
      where.isVisibleToPlayers = true;
    } else if (req.query.visible === "true") {
      where.isVisibleToPlayers = true;
    }

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (!VALID_STATUSES.has(status)) {
        return res.status(400).json({ error: "status must be ACTIVE, COMPLETED, or FAILED." });
      }
      where.status = status;
    }

    const quests = await prisma.quest.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    // Parse JSON fields for clean response
    const parsed = quests.map((q) => ({
      ...q,
      objectives: parseJsonArray(q.objectives),
      rewards: parseJsonObject(q.rewards),
      assignedToCharacterIds: parseJsonArray(q.assignedToCharacterIds),
    }));

    res.json(parsed);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/quests", { error: err.message });
    res.status(500).json({ error: "Failed to fetch quests." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/quests/:id  get a single quest
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const quest = await prisma.quest.findUnique({ where: { id } });
    if (!quest) {
      return res.status(404).json({ error: "Quest not found." });
    }

    const user = await getRequestUser(req);
    if ((!user || user.role !== "DM") && quest.isVisibleToPlayers !== true) {
      return res.status(404).json({ error: "Quest not found." });
    }

    res.json({
      ...quest,
      objectives: parseJsonArray(quest.objectives),
      rewards: parseJsonObject(quest.rewards),
      assignedToCharacterIds: parseJsonArray(quest.assignedToCharacterIds),
    });
  } catch (err) {
    logger.error("api:route", "Error in GET /api/quests/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch quest." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/quests  create a new quest  (DM only)
// Body: { title, description?, status?, objectives?, rewards?,
//         questGiverNpcId?, parentQuestId?, isVisibleToPlayers? }
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      objectives,
      rewards,
      questGiverNpcId,
      parentQuestId,
      isVisibleToPlayers,
    } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required." });
    }

    const nextStatus = status ? String(status).toUpperCase() : "ACTIVE";
    if (!VALID_STATUSES.has(nextStatus)) {
      return res.status(400).json({ error: "status must be ACTIVE, COMPLETED, or FAILED." });
    }

    const data = {
      title: title.trim(),
      description: description || "",
      status: nextStatus,
      objectives: objectives !== undefined ? JSON.stringify(objectives) : "[]",
      rewards: rewards !== undefined ? JSON.stringify(rewards) : "{}",
      isVisibleToPlayers: isVisibleToPlayers === true,
    };

    if (questGiverNpcId !== undefined) {
      if (typeof questGiverNpcId !== "number" || !Number.isInteger(questGiverNpcId) || questGiverNpcId <= 0) {
        return res.status(400).json({ error: "questGiverNpcId must be a valid positive integer." });
      }
      data.questGiverNpcId = questGiverNpcId;
    }

    if (parentQuestId !== undefined) {
      if (typeof parentQuestId !== "number" || !Number.isInteger(parentQuestId) || parentQuestId <= 0) {
        return res.status(400).json({ error: "parentQuestId must be a valid positive integer." });
      }
      data.parentQuestId = parentQuestId;
    }

    const quest = await prisma.quest.create({ data });

    res.status(201).json({
      ...quest,
      objectives: parseJsonArray(quest.objectives),
      rewards: parseJsonObject(quest.rewards),
      assignedToCharacterIds: parseJsonArray(quest.assignedToCharacterIds),
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/quests", { error: err.message });
    res.status(500).json({ error: "Failed to create quest." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/quests/:id  update a quest (DM only)
// Body: any subset of quest fields
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const {
      title,
      description,
      status,
      objectives,
      rewards,
      questGiverNpcId,
      parentQuestId,
      isVisibleToPlayers,
      assignedToCharacterIds,
    } = req.body;

    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title must be a non-empty string." });
      }
      data.title = title.trim();
    }

    if (description !== undefined) {
      if (typeof description !== "string") {
        return res.status(400).json({ error: "description must be a string." });
      }
      data.description = description;
    }

    if (status !== undefined) {
      const nextStatus = String(status).toUpperCase();
      if (!VALID_STATUSES.has(nextStatus)) {
        return res.status(400).json({ error: "status must be ACTIVE, COMPLETED, or FAILED." });
      }
      data.status = nextStatus;
    }

    if (objectives !== undefined) {
      data.objectives = JSON.stringify(objectives);
    }

    if (rewards !== undefined) {
      data.rewards = JSON.stringify(rewards);
    }

    if (questGiverNpcId !== undefined) {
      if (questGiverNpcId === null) {
        data.questGiverNpcId = null;
      } else if (typeof questGiverNpcId !== "number" || !Number.isInteger(questGiverNpcId) || questGiverNpcId <= 0) {
        return res.status(400).json({ error: "questGiverNpcId must be a valid positive integer or null." });
      } else {
        data.questGiverNpcId = questGiverNpcId;
      }
    }

    if (parentQuestId !== undefined) {
      if (parentQuestId === null) {
        data.parentQuestId = null;
      } else if (typeof parentQuestId !== "number" || !Number.isInteger(parentQuestId) || parentQuestId <= 0) {
        return res.status(400).json({ error: "parentQuestId must be a valid positive integer or null." });
      } else {
        data.parentQuestId = parentQuestId;
      }
    }

    if (isVisibleToPlayers !== undefined) {
      data.isVisibleToPlayers = isVisibleToPlayers === true;
    }

    if (assignedToCharacterIds !== undefined) {
      data.assignedToCharacterIds = JSON.stringify(assignedToCharacterIds);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const quest = await prisma.quest.update({
      where: { id },
      data,
    });

    res.json({
      ...quest,
      objectives: parseJsonArray(quest.objectives),
      rewards: parseJsonObject(quest.rewards),
      assignedToCharacterIds: parseJsonArray(quest.assignedToCharacterIds),
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Quest not found." });
    }
    logger.error("api:route", "Error in PUT /api/quests/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update quest." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/quests/:id  delete a quest (DM only)
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    await prisma.quest.delete({ where: { id } });
    res.json({ message: "Quest deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Quest not found." });
    }
    logger.error("api:route", "Error in DELETE /api/quests/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete quest." });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/quests/:id/toggle-objective  toggle objective isComplete (DM only)
// Body: { objectiveIndex: number }
// ---------------------------------------------------------------------------
router.patch("/:id/toggle-objective", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { objectiveIndex } = req.body;
    if (typeof objectiveIndex !== "number" || !Number.isInteger(objectiveIndex) || objectiveIndex < 0) {
      return res.status(400).json({ error: "objectiveIndex must be a non-negative integer." });
    }

    const quest = await prisma.quest.findUnique({ where: { id } });
    if (!quest) {
      return res.status(404).json({ error: "Quest not found." });
    }

    const objectives = parseJsonArray(quest.objectives);
    if (objectiveIndex >= objectives.length) {
      return res.status(400).json({ error: `objectiveIndex ${objectiveIndex} out of bounds (max ${objectives.length - 1}).` });
    }

    objectives[objectiveIndex].isComplete = !objectives[objectiveIndex].isComplete;

    const updated = await prisma.quest.update({
      where: { id },
      data: { objectives: JSON.stringify(objectives) },
    });

    res.json({
      ...updated,
      objectives: parseJsonArray(updated.objectives),
      rewards: parseJsonObject(updated.rewards),
      assignedToCharacterIds: parseJsonArray(updated.assignedToCharacterIds),
    });
  } catch (err) {
    logger.error("api:route", "Error in PATCH /api/quests/:id/toggle-objective", { error: err.message });
    res.status(500).json({ error: "Failed to toggle objective." });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/quests/:id/assign  assign quest to characters (DM only)
// Body: { characterIds: number[] }
// ---------------------------------------------------------------------------
router.patch("/:id/assign", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    let characterIds = req.body.characterIds;
    if (!Array.isArray(characterIds)) {
      return res.status(400).json({ error: "characterIds must be an array of character IDs." });
    }

    // Validate each ID is a positive integer
    characterIds = [...new Set(characterIds.map((c) => Number(c)).filter((c) => Number.isInteger(c) && c > 0))];

    const updated = await prisma.quest.update({
      where: { id },
      data: { assignedToCharacterIds: JSON.stringify(characterIds) },
    });

    res.json({
      ...updated,
      objectives: parseJsonArray(updated.objectives),
      rewards: parseJsonObject(updated.rewards),
      assignedToCharacterIds: parseJsonArray(updated.assignedToCharacterIds),
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Quest not found." });
    }
    logger.error("api:route", "Error in PATCH /api/quests/:id/assign", { error: err.message });
    res.status(500).json({ error: "Failed to assign quest." });
  }
});

module.exports = router;
