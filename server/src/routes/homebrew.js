// =============================================================================
// Tablecast  Homebrew Entry CRUD Routes
// Endpoints:  GET    /api/homebrew              (?type= & ?active=)
//             GET    /api/homebrew/:id
//             POST   /api/homebrew
//             PUT    /api/homebrew/:id
//             DELETE /api/homebrew/:id
//             POST   /api/homebrew/export
//             POST   /api/homebrew/import
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
// eslint-disable-next-line unused-imports/no-unused-vars
const { getRequestUser, requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

const VALID_TYPES = new Set(["RACE", "CLASS", "FEAT", "SPELL", "MAGIC_ITEM", "MONSTER"]);

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

function formatEntry(e) {
  return {
    ...e,
    content: parseJsonObject(e.content),
    tags: parseJsonArray(e.tags),
  };
}

// ---------------------------------------------------------------------------
// GET /api/homebrew  list all homebrew entries
// Query params: ?type=RACE  filter by type, ?active=true
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const where = {};
    if (req.query.type) {
      const type = String(req.query.type).toUpperCase();
      if (!VALID_TYPES.has(type)) {
        return res.status(400).json({ error: `type must be one of: ${[...VALID_TYPES].join(", ")}` });
      }
      where.type = type;
    }
    if (req.query.active === "true") {
      where.isActive = true;
    }

    const entries = await prisma.homebrewEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    res.json(entries.map(formatEntry));
  } catch (err) {
    logger.error("api:route", "Error in GET /api/homebrew", { error: err.message });
    res.status(500).json({ error: "Failed to fetch homebrew entries." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/homebrew/:id  get a single homebrew entry
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const entry = await prisma.homebrewEntry.findUnique({ where: { id } });
    if (!entry) {
      return res.status(404).json({ error: "Homebrew entry not found." });
    }

    res.json(formatEntry(entry));
  } catch (err) {
    logger.error("api:route", "Error in GET /api/homebrew/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch homebrew entry." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/homebrew  create a new homebrew entry (DM only)
// Body: { type, name, source?, version?, content?, tags?, isActive? }
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { type, name, source, version, content, tags, isActive } = req.body;

    if (!type || !VALID_TYPES.has(String(type).toUpperCase())) {
      return res.status(400).json({ error: `type must be one of: ${[...VALID_TYPES].join(", ")}` });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required." });
    }

    const data = {
      type: String(type).toUpperCase(),
      name: name.trim(),
      source: source || "",
      version: version || "1.0.0",
      content: content !== undefined ? JSON.stringify(content) : "{}",
      tags: tags !== undefined ? JSON.stringify(tags) : "[]",
      isActive: isActive !== false,
    };

    const entry = await prisma.homebrewEntry.create({ data });
    res.status(201).json(formatEntry(entry));
  } catch (err) {
    logger.error("api:route", "Error in POST /api/homebrew", { error: err.message });
    res.status(500).json({ error: "Failed to create homebrew entry." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/homebrew/:id  update a homebrew entry (DM only)
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { type, name, source, version, content, tags, isActive } = req.body;
    const data = {};

    if (type !== undefined) {
      const t = String(type).toUpperCase();
      if (!VALID_TYPES.has(t)) {
        return res.status(400).json({ error: `type must be one of: ${[...VALID_TYPES].join(", ")}` });
      }
      data.type = t;
    }
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string." });
      }
      data.name = name.trim();
    }
    if (source !== undefined) data.source = source;
    if (version !== undefined) data.version = version;
    if (content !== undefined) data.content = JSON.stringify(content);
    if (tags !== undefined) data.tags = JSON.stringify(tags);
    if (isActive !== undefined) data.isActive = isActive === true;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const entry = await prisma.homebrewEntry.update({ where: { id }, data });
    res.json(formatEntry(entry));
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Homebrew entry not found." });
    }
    logger.error("api:route", "Error in PUT /api/homebrew/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update homebrew entry." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/homebrew/:id  delete a homebrew entry (DM only)
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    await prisma.homebrewEntry.delete({ where: { id } });
    res.json({ message: "Homebrew entry deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Homebrew entry not found." });
    }
    logger.error("api:route", "Error in DELETE /api/homebrew/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete homebrew entry." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/homebrew/export  export homebrew entries as JSON (DM only)
// Body: { ids?: number[] }  — omit ids to export all
// ---------------------------------------------------------------------------
router.post("/export", requireDm, async (req, res) => {
  try {
    const { ids } = req.body;
    const where = {};
    if (Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids.map(Number).filter((n) => !isNaN(n) && n > 0) };
    }

    const entries = await prisma.homebrewEntry.findMany({ where });
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: "Tablecast Homebrew Export",
      entries: entries.map((e) => ({
        type: e.type,
        name: e.name,
        source: e.source,
        version: e.version,
        content: parseJsonObject(e.content),
        tags: parseJsonArray(e.tags),
        isActive: e.isActive,
      })),
    };

    res.json(payload);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/homebrew/export", { error: err.message });
    res.status(500).json({ error: "Failed to export homebrew entries." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/homebrew/import  import homebrew entries from JSON (DM only)
// Body: { entries: [...], overwrite?: boolean }
// ---------------------------------------------------------------------------
router.post("/import", requireDm, async (req, res) => {
  try {
    const { entries, overwrite } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array." });
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const entry of entries) {
      try {
        const type = String(entry.type || "").toUpperCase();
        if (!VALID_TYPES.has(type)) {
          results.errors.push(`Invalid type "${entry.type}" for "${entry.name}"`);
          continue;
        }
        if (!entry.name || typeof entry.name !== "string") {
          results.errors.push(`Missing name for entry with type ${type}`);
          continue;
        }

        // Check for duplicate by name + type
        const existing = await prisma.homebrewEntry.findFirst({
          where: { name: entry.name.trim(), type },
        });

        if (existing) {
          if (overwrite === true) {
            await prisma.homebrewEntry.update({
              where: { id: existing.id },
              data: {
                source: entry.source || existing.source,
                version: entry.version || existing.version,
                content: entry.content ? JSON.stringify(entry.content) : existing.content,
                tags: entry.tags ? JSON.stringify(entry.tags) : existing.tags,
                isActive: entry.isActive !== false,
              },
            });
            results.updated++;
          } else {
            results.skipped++;
          }
        } else {
          await prisma.homebrewEntry.create({
            data: {
              type,
              name: entry.name.trim(),
              source: entry.source || "",
              version: entry.version || "1.0.0",
              content: entry.content ? JSON.stringify(entry.content) : "{}",
              tags: entry.tags ? JSON.stringify(entry.tags) : "[]",
              isActive: entry.isActive !== false,
            },
          });
          results.created++;
        }
      } catch (err) {
        results.errors.push(`Error processing "${entry.name}": ${err.message}`);
      }
    }

    res.json(results);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/homebrew/import", { error: err.message });
    res.status(500).json({ error: "Failed to import homebrew entries." });
  }
});

module.exports = router;
