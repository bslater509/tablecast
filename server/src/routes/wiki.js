// =============================================================================
// Tablecast  WikiArticle CRUD Routes
// Endpoints:  GET /api/wiki           (?visible=true & ?search=term)
//             GET /api/wiki/:id
//             POST /api/wiki
//             PUT /api/wiki/:id
//             DELETE /api/wiki/:id
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm, getRequestUser } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/wiki  list all articles
// Query params:
//   ?visible=true    only articles visible to players (Player Journal)
//   ?search=term     filter by title or content containing the term
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const where = {};

    // Filter by player-visibility
    if (!user || user.role !== "DM") {
      where.isVisibleToPlayers = true;
    } else if (req.query.visible === "true") {
      where.isVisibleToPlayers = true;
    }

    // Simple text search across title and content
    if (req.query.search) {
      const search = req.query.search.slice(0, 200);
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const articles = await prisma.wikiArticle.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    res.json(articles);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/wiki", { error: err.message });
    res.status(500).json({ error: "Failed to fetch wiki articles." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/wiki/:id  get a single article
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const article = await prisma.wikiArticle.findUnique({
      where: { id },
    });

    if (!article) {
      return res.status(404).json({ error: "Wiki article not found." });
    }

    if ((!user || user.role !== "DM") && article.isVisibleToPlayers !== true) {
      return res.status(404).json({ error: "Wiki article not found." });
    }

    res.json(article);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/wiki/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch wiki article." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/wiki  create a new article
// Body: { title: string, content?: string, isVisibleToPlayers?: boolean, tags?: string }
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { title, content, isVisibleToPlayers, tags, category } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required." });
    }

    // Validate category if provided
    const validCategories = ["LOCATION", "NPC", "LORE", "LOG"];
    let finalCategory = "LORE";
    if (category !== undefined) {
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${validCategories.join(", ")}` });
      }
      finalCategory = category;
    }

    // Validate tags is a parseable JSON array if provided
    if (tags !== undefined) {
      try {
        const parsed = JSON.parse(tags);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ error: "tags must be a JSON array string." });
        }
      } catch {
        return res.status(400).json({ error: "tags must be a valid JSON array string." });
      }
    }

    const article = await prisma.wikiArticle.create({
      data: {
        title: title.trim(),
        content: content || "",
        isVisibleToPlayers: isVisibleToPlayers === true,
        tags: tags || "[]",
        category: finalCategory,
      },
    });

    // Broadcast the new article to all connected clients
    try { req.app.get("io").emit("wiki:article:created", { article }); } catch (_) {}

    res.status(201).json(article);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/wiki", { error: err.message });
    res.status(500).json({ error: "Failed to create wiki article." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/wiki/:id  update an existing article (partial)
// Body: { title?: string, content?: string, isVisibleToPlayers?: boolean, tags?: string }
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { title, content, isVisibleToPlayers, tags, category } = req.body;
    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title must be a non-empty string." });
      }
      data.title = title.trim();
    }

    if (content !== undefined) {
      data.content = content;
    }

    if (category !== undefined) {
      const validCategories = ["LOCATION", "NPC", "LORE", "LOG"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${validCategories.join(", ")}` });
      }
      data.category = category;
    }

    if (isVisibleToPlayers !== undefined) {
      data.isVisibleToPlayers = isVisibleToPlayers === true;
    }

    if (tags !== undefined) {
      try {
        const parsed = JSON.parse(tags);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ error: "tags must be a JSON array string." });
        }
        data.tags = tags;
      } catch {
        return res.status(400).json({ error: "tags must be a valid JSON array string." });
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const article = await prisma.wikiArticle.update({
      where: { id },
      data,
    });

    // Broadcast the updated article to all connected clients
    try { req.app.get("io").emit("wiki:article:updated", { article }); } catch (_) {}

    res.json(article);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Wiki article not found." });
    }
    logger.error("api:route", "Error in PUT /api/wiki/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update wiki article." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/wiki/:id  delete an article
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    await prisma.wikiArticle.delete({
      where: { id },
    });

    // Broadcast the deletion to all connected clients
    try { req.app.get("io").emit("wiki:article:deleted", { id }); } catch (_) {}

    res.json({ message: "Wiki article deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Wiki article not found." });
    }
    logger.error("api:route", "Error in DELETE /api/wiki/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete wiki article." });
  }
});

module.exports = router;
