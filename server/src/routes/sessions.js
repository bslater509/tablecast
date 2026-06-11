// =============================================================================
// Tablecast  GameSession CRUD Routes
// Endpoints:  GET /api/sessions           (?status= & ?visible=true)
//             GET /api/sessions/:id
//             POST /api/sessions
//             PATCH /api/sessions/:id
//             DELETE /api/sessions/:id
//             POST /api/sessions/:id/publish-recap
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser, requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();
const VALID_STATUSES = new Set(["PLANNED", "ACTIVE", "COMPLETED"]);

const LOG_TEMPLATE = `### Session Log: [Date]
*Adventure / Chapter / Arc*
***
- **Summary of Events**: What happened in the session.
- **Loot & XP Awarded**: Rewards collected by the party.
- **Active Quests / Hooks**: Current objectives and unresolved plot hooks.
`;

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function parseIdArray(value) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function validateChecklist(value) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) {
    throw new Error("prepChecklist must be a JSON array.");
  }

  return parsed.map((item, index) => ({
    id: String(item?.id || `item-${index + 1}`),
    text: String(item?.text || "").trim(),
    done: item?.done === true,
  })).filter((item) => item.text);
}

async function validateLinkedIds(linkedWikiIds, linkedMapIds, linkedEncounterIds) {
  const wikiIds = parseIdArray(linkedWikiIds);
  const mapIds = parseIdArray(linkedMapIds);
  const encounterIds = parseIdArray(linkedEncounterIds);

  const [wikiRows, mapRows, encounterRows] = await Promise.all([
    wikiIds.length
      ? prisma.wikiArticle.findMany({ where: { id: { in: wikiIds } }, select: { id: true } })
      : Promise.resolve([]),
    mapIds.length
      ? prisma.map.findMany({ where: { id: { in: mapIds } }, select: { id: true } })
      : Promise.resolve([]),
    encounterIds.length
      ? prisma.encounter.findMany({ where: { id: { in: encounterIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  return {
    linkedWikiIds: wikiRows.map((row) => row.id),
    linkedMapIds: mapRows.map((row) => row.id),
    linkedEncounterIds: encounterRows.map((row) => row.id),
  };
}

function canViewSession(session, user) {
  if (!session) return false;
  if (user?.role === "DM") return true;
  return session.isVisibleToPlayers === true;
}

function buildRecapContent(session) {
  const recap = String(session.recap || "").trim();
  if (!recap) return LOG_TEMPLATE;
  if (recap.includes("### Session Log:")) return recap;
  return `${LOG_TEMPLATE}\n${recap}`;
}

// ---------------------------------------------------------------------------
// GET /api/sessions
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const where = {};

    if (req.query.visible === "true" || user?.role !== "DM") {
      where.isVisibleToPlayers = true;
    }

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (!VALID_STATUSES.has(status)) {
        return res.status(400).json({ error: "status must be PLANNED, ACTIVE, or COMPLETED." });
      }
      where.status = status;
    }

    const sessions = await prisma.gameSession.findMany({
      where,
      orderBy: [
        { sessionNumber: "asc" },
        { scheduledFor: "asc" },
        { createdAt: "desc" },
      ],
    });

    res.json(sessions);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/sessions", { error: err.message });
    res.status(500).json({ error: "Failed to fetch sessions." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    const session = await prisma.gameSession.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    const user = await getRequestUser(req);
    if (!canViewSession(session, user)) {
      return res.status(403).json({ error: "This session is not visible to players." });
    }

    res.json(session);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/sessions/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch session." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sessions
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { title, sessionNumber, scheduledFor, agenda, isVisibleToPlayers } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required." });
    }

    const data = {
      title: title.trim(),
      status: "PLANNED",
      prepChecklist: "[]",
      linkedWikiIds: "[]",
      linkedMapIds: "[]",
      linkedEncounterIds: "[]",
    };

    if (sessionNumber !== undefined && sessionNumber !== null && sessionNumber !== "") {
      const parsedNumber = Number(sessionNumber);
      if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
        return res.status(400).json({ error: "sessionNumber must be a positive integer." });
      }
      data.sessionNumber = parsedNumber;
    }

    if (scheduledFor) {
      const parsedDate = new Date(scheduledFor);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "scheduledFor must be a valid date." });
      }
      data.scheduledFor = parsedDate;
    }

    if (agenda !== undefined) {
      data.agenda = String(agenda || "");
    }

    if (isVisibleToPlayers !== undefined) {
      data.isVisibleToPlayers = isVisibleToPlayers === true;
    }

    const session = await prisma.gameSession.create({ data });
    res.status(201).json(session);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/sessions", { error: err.message });
    res.status(500).json({ error: "Failed to create session." });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/sessions/:id
// ---------------------------------------------------------------------------
router.patch("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    const existing = await prisma.gameSession.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Session not found." });
    }

    const {
      title,
      sessionNumber,
      status,
      scheduledFor,
      agenda,
      prepChecklist,
      recap,
      linkedWikiIds,
      linkedMapIds,
      linkedEncounterIds,
      isVisibleToPlayers,
    } = req.body;

    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title must be a non-empty string." });
      }
      data.title = title.trim();
    }

    if (sessionNumber !== undefined) {
      if (sessionNumber === null || sessionNumber === "") {
        data.sessionNumber = null;
      } else {
        const parsedNumber = Number(sessionNumber);
        if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
          return res.status(400).json({ error: "sessionNumber must be a positive integer." });
        }
        data.sessionNumber = parsedNumber;
      }
    }

    if (status !== undefined) {
      const nextStatus = String(status).toUpperCase();
      if (!VALID_STATUSES.has(nextStatus)) {
        return res.status(400).json({ error: "status must be PLANNED, ACTIVE, or COMPLETED." });
      }
      data.status = nextStatus;
    }

    if (scheduledFor !== undefined) {
      if (scheduledFor === null || scheduledFor === "") {
        data.scheduledFor = null;
      } else {
        const parsedDate = new Date(scheduledFor);
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: "scheduledFor must be a valid date." });
        }
        data.scheduledFor = parsedDate;
      }
    }

    if (agenda !== undefined) data.agenda = String(agenda || "");
    if (recap !== undefined) data.recap = String(recap || "");

    if (prepChecklist !== undefined) {
      try {
        const validated = validateChecklist(
          typeof prepChecklist === "string" ? prepChecklist : JSON.stringify(prepChecklist)
        );
        data.prepChecklist = JSON.stringify(validated);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (
      linkedWikiIds !== undefined ||
      linkedMapIds !== undefined ||
      linkedEncounterIds !== undefined
    ) {
      const validatedLinks = await validateLinkedIds(
        linkedWikiIds !== undefined
          ? (typeof linkedWikiIds === "string" ? linkedWikiIds : JSON.stringify(linkedWikiIds))
          : existing.linkedWikiIds,
        linkedMapIds !== undefined
          ? (typeof linkedMapIds === "string" ? linkedMapIds : JSON.stringify(linkedMapIds))
          : existing.linkedMapIds,
        linkedEncounterIds !== undefined
          ? (typeof linkedEncounterIds === "string" ? linkedEncounterIds : JSON.stringify(linkedEncounterIds))
          : existing.linkedEncounterIds
      );
      data.linkedWikiIds = JSON.stringify(validatedLinks.linkedWikiIds);
      data.linkedMapIds = JSON.stringify(validatedLinks.linkedMapIds);
      data.linkedEncounterIds = JSON.stringify(validatedLinks.linkedEncounterIds);
    }

    if (isVisibleToPlayers !== undefined) {
      data.isVisibleToPlayers = isVisibleToPlayers === true;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    let session;
    if (data.status === "ACTIVE") {
      // Transaction ensures other sessions are only marked COMPLETED if this update succeeds
      session = await prisma.$transaction(async (tx) => {
        await tx.gameSession.updateMany({
          where: { status: "ACTIVE", id: { not: id } },
          data: { status: "COMPLETED" },
        });
        return tx.gameSession.update({
          where: { id },
          data,
        });
      });
    } else {
      session = await prisma.gameSession.update({
        where: { id },
        data,
      });
    }

    res.json(session);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Session not found." });
    }
    logger.error("api:route", "Error in PATCH /api/sessions/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update session." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/sessions/:id
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    await prisma.gameSession.delete({ where: { id } });
    res.json({ message: "Session deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Session not found." });
    }
    logger.error("api:route", "Error in DELETE /api/sessions/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete session." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/publish-recap
// ---------------------------------------------------------------------------
router.post("/:id/publish-recap", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    const session = await prisma.gameSession.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    const recapContent = buildRecapContent(session);
    const articleTitle = session.sessionNumber
      ? `Session ${session.sessionNumber} — ${session.title}`
      : session.title;

    let wikiArticle;
    if (session.wikiLogId) {
      try {
        wikiArticle = await prisma.wikiArticle.update({
          where: { id: session.wikiLogId },
          data: {
            title: articleTitle,
            content: recapContent,
            category: "LOG",
            isVisibleToPlayers: session.isVisibleToPlayers,
            tags: JSON.stringify(["Session Notes", "Session Log"]),
          },
        });
      } catch (err) {
        if (err.code !== "P2025") throw err;
        wikiArticle = null;
      }
    }

    if (!wikiArticle) {
      wikiArticle = await prisma.wikiArticle.create({
        data: {
          title: articleTitle,
          content: recapContent,
          category: "LOG",
          isVisibleToPlayers: session.isVisibleToPlayers,
          tags: JSON.stringify(["Session Notes", "Session Log"]),
        },
      });
    }

    const updatedSession = await prisma.gameSession.update({
      where: { id },
      data: {
        wikiLogId: wikiArticle.id,
        recap: recapContent,
      },
    });

    res.json({ session: updatedSession, wikiArticle });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/sessions/:id/publish-recap", { error: err.message });
    res.status(500).json({ error: "Failed to publish session recap." });
  }
});

module.exports = router;
