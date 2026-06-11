// =============================================================================
// Tablecast  Player Handout Routes
// Endpoints:  GET    /api/handouts           (?characterId=)
//             GET    /api/handouts/:id
//             POST   /api/handouts           (requireDm)
//             PUT    /api/handouts/:id       (requireDm)
//             DELETE /api/handouts/:id       (requireDm)
//             POST   /api/handouts/:id/mark-read
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser, requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function parseIdArray(value) {
  if (!value) return [];
  const parsed = parseJson(typeof value === "string" ? value : JSON.stringify(value), []);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function sanitizeText(value, maxLen) {
  return String(value || "").trim().slice(0, maxLen || 10000);
}

function emitHandoutEvent(req, event, payload) {
  try {
    const io = req.app.get("io");
    if (io) io.emit(event, payload);
  } catch (err) {
    logger.error("api:handouts", "Failed to emit socket event", { event, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// GET /api/handouts  — list handouts
// DM sees all handouts. Players see handouts where their character ID is in
// targetCharacterIds (empty array means visible to all players).
// Query param ?characterId= filters for a specific character.
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const isDM = user.role === "DM";
    const characterId = req.query.characterId ? Number(req.query.characterId) : null;

    let where = {};

    if (!isDM) {
      // Players: only see handouts targeted at them
      const playerCharacterId = characterId || user.characterId;
      if (playerCharacterId) {
        // Show handouts where targetCharacterIds is empty (all players) or contains this character
        where = {
          OR: [
            { targetCharacterIds: "[]" },
            { targetCharacterIds: "" },
          ],
        };
        // Also check if the array contains the character ID
        // We need a broader filter since SQLite can't easily query JSON arrays
        // Fetch all, then filter in-memory
      } else {
        // No character context, show nothing
        return res.json([]);
      }
    }

    // Additional characterId filter
    if (characterId && isDM) {
      // DM can filter by character
      const handouts = await prisma.handout.findMany({
        orderBy: { createdAt: "desc" },
      });
      // In-memory filter by character
      const filtered = handouts.filter((h) => {
        const targets = parseIdArray(h.targetCharacterIds);
        return targets.length === 0 || targets.includes(characterId);
      });
      return res.json(filtered);
    }

    const handouts = await prisma.handout.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // For non-DM players, filter by targetCharacterIds in-memory
    if (!isDM) {
      const playerCharacterId = characterId || user.characterId;
      const filtered = handouts.filter((h) => {
        const targets = parseIdArray(h.targetCharacterIds);
        return targets.length === 0 || targets.includes(playerCharacterId);
      });
      return res.json(filtered);
    }

    res.json(handouts);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/handouts", { error: err.message });
    res.status(500).json({ error: "Failed to fetch handouts." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/handouts/:id  — get single handout
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const handout = await prisma.handout.findUnique({ where: { id } });
    if (!handout) {
      return res.status(404).json({ error: "Handout not found." });
    }

    // Visibility check for non-DM users
    if (user.role !== "DM") {
      const targets = parseIdArray(handout.targetCharacterIds);
      const playerCharacterId = user.characterId;
      if (targets.length > 0 && (!playerCharacterId || !targets.includes(playerCharacterId))) {
        return res.status(403).json({ error: "This handout is not available to you." });
      }
    }

    res.json(handout);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/handouts/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch handout." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/handouts  — create handout (DM only)
// Body: { title, content?, imageUrl?, targetCharacterIds? }
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { title, content, imageUrl, targetCharacterIds, characterIds } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required." });
    }

    const userId = req.tablecastUser.id;

    // Accept either targetCharacterIds or characterIds (simpler alternative)
    const ids = targetCharacterIds !== undefined ? targetCharacterIds : characterIds;
    const parsedIds = parseIdArray(ids);

    const handout = await prisma.handout.create({
      data: {
        title: title.trim(),
        content: sanitizeText(content, 50000),
        imageUrl: String(imageUrl || ""),
        targetCharacterIds: JSON.stringify(parsedIds),
        createdByDmId: userId,
      },
    });

    // Broadcast via socket
    emitHandoutEvent(req, "handout:new", { handout });

    logger.info("api:handouts", "Handout created", { handoutId: handout.id, title: handout.title, reqId: req.id });

    res.status(201).json(handout);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/handouts", { error: err.message });
    res.status(500).json({ error: "Failed to create handout." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/handouts/:id  — update handout (DM only)
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    const existing = await prisma.handout.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Handout not found." });
    }

    const { title, content, imageUrl, targetCharacterIds, characterIds } = req.body;
    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title must be a non-empty string." });
      }
      data.title = title.trim();
    }

    if (content !== undefined) {
      data.content = sanitizeText(content, 50000);
    }

    if (imageUrl !== undefined) {
      data.imageUrl = String(imageUrl);
    }

    if (targetCharacterIds !== undefined || characterIds !== undefined) {
      const ids = targetCharacterIds !== undefined ? targetCharacterIds : characterIds;
      data.targetCharacterIds = JSON.stringify(parseIdArray(ids));
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const handout = await prisma.handout.update({
      where: { id },
      data,
    });

    logger.info("api:handouts", "Handout updated", { handoutId: handout.id, reqId: req.id });
    res.json(handout);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Handout not found." });
    }
    logger.error("api:route", "Error in PUT /api/handouts/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update handout." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/handouts/:id  — delete handout (DM only)
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    await prisma.handout.delete({ where: { id } });
    logger.info("api:handouts", "Handout deleted", { handoutId: id, reqId: req.id });
    res.json({ message: "Handout deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Handout not found." });
    }
    logger.error("api:route", "Error in DELETE /api/handouts/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete handout." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/handouts/:id/mark-read  — mark handout as read
// Any authenticated user can mark. Broadcasts via socket.
// ---------------------------------------------------------------------------
router.post("/:id/mark-read", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a valid positive number." });
    }

    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const handout = await prisma.handout.findUnique({ where: { id } });
    if (!handout) {
      return res.status(404).json({ error: "Handout not found." });
    }

    // Only mark as read if not already read
    if (!handout.isRead) {
      const updated = await prisma.handout.update({
        where: { id },
        data: { isRead: true },
      });

      // Broadcast via socket
      emitHandoutEvent(req, "handout:read", { id: updated.id, isRead: true });

      logger.info("api:handouts", "Handout marked as read", { handoutId: id, reqId: req.id });
      return res.json(updated);
    }

    res.json(handout);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Handout not found." });
    }
    logger.error("api:route", "Error in POST /api/handouts/:id/mark-read", { error: err.message });
    res.status(500).json({ error: "Failed to mark handout as read." });
  }
});

module.exports = router;
