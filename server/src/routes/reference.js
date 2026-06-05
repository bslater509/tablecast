// =============================================================================
// Tablecast  5etools Reference API Routes
// Endpoints:  GET  /api/reference/status
//             POST /api/reference/sync
//             GET  /api/reference/search
// =============================================================================
"use strict";

const { Router } = require("express");
const referenceSync = require("../utils/referenceSync");
const referenceSearch = require("../utils/referenceSearch");
const tokenImageLookup = require("../utils/tokenImageLookup");
const { requireDm } = require("../auth");
const prisma = require("../prisma");

const router = Router();
const SETTINGS_KEY = "reference.allowedSources";
const IMAGE_SECTIONS = {
  monsters: "bestiary",
  spells: "spells",
  items: "items",
  races: "races",
  classes: "classes",
  rules: "variantrules",
};

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return Array.from(new Set(
    sources
      .map((source) => String(source || "").trim().toUpperCase())
      .filter((source) => /^[A-Z0-9-]{2,24}$/.test(source))
  )).slice(0, 100);
}

async function getAllowedSources() {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!setting?.value) return [];

  try {
    return normalizeSources(JSON.parse(setting.value));
  } catch (err) {
    console.warn("[API] Invalid reference source settings ignored:", err.message);
    return [];
  }
}

async function setAllowedSources(sources) {
  const allowedSources = normalizeSources(sources);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(allowedSources) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(allowedSources) },
  });
  return allowedSources;
}

function withReferenceImage(item, category) {
  if (!item || typeof item !== "object") return item;

  const section = IMAGE_SECTIONS[String(category || "").toLowerCase()];
  if (!section || !item.name) return item;

  const match = tokenImageLookup.findReferenceImage({
    name: item.name,
    source: item.source,
    section,
    excludeTokens: true,
  });
  const tokenMatch = section === "bestiary"
    ? tokenImageLookup.findReferenceImage({
        name: item.name,
        source: item.source,
        section,
        preferToken: true,
        tokenOnly: true,
      })
    : null;

  if (!match && !tokenMatch) return item;
  return {
    ...item,
    imageUrl: match?.url,
    imageMatchCount: match?.matchCount,
    tokenUrl: tokenMatch?.url,
    tokenMatchCount: tokenMatch?.matchCount,
  };
}

function imageHrefToUrl(image) {
  const imagePath = image?.href?.type === "internal" ? image.href.path : "";
  if (!imagePath || typeof imagePath !== "string") return "";
  return `/5etoolsimg/${imagePath.split("/").map(encodeURIComponent).join("/")}`;
}

function withReferenceInfo(item, category, allowedSources) {
  if (String(category || "").toLowerCase() !== "monsters") return item;

  const fluff = referenceSearch.getMonsterFluffByName(item.name, item.source, {
    sources: allowedSources,
  });

  if (!fluff) return item;
  const infoImageUrls = Array.isArray(fluff.images)
    ? fluff.images.map(imageHrefToUrl).filter(Boolean)
    : [];

  return {
    ...item,
    imageUrl: item.imageUrl || infoImageUrls[0],
    infoName: fluff.name,
    infoSource: fluff.source,
    infoEntries: fluff.entries,
    infoImages: fluff.images,
    infoImageUrls,
  };
}

// ---------------------------------------------------------------------------
// GET /api/reference/status  Retrieve repository and sync status
// ---------------------------------------------------------------------------
router.get("/status", async (req, res) => {
  try {
    const status = referenceSync.getStatus();
    const allowedSources = await getAllowedSources();
    res.json({ ...status, allowedSources });
  } catch (err) {
    console.error("[API] GET /api/reference/status error:", err.message);
    res.status(500).json({ error: "Failed to retrieve sync status." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/settings  Retrieve DM-controlled source filters
// ---------------------------------------------------------------------------
router.get("/settings", async (req, res) => {
  try {
    const allowedSources = await getAllowedSources();
    const availableSources = referenceSearch.listAvailableSources();
    res.json({ allowedSources, availableSources });
  } catch (err) {
    console.error("[API] GET /api/reference/settings error:", err.message);
    res.status(500).json({ error: "Failed to retrieve reference settings." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/reference/settings  Update allowed 5etools source books
// ---------------------------------------------------------------------------
router.put("/settings", requireDm, async (req, res) => {
  try {
    const allowedSources = await setAllowedSources(req.body?.allowedSources);
    referenceSearch.clearCache();
    res.json({ success: true, allowedSources });
  } catch (err) {
    console.error("[API] PUT /api/reference/settings error:", err.message);
    res.status(500).json({ error: "Failed to save reference settings." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reference/sync  Trigger background git clone/pull operation
// ---------------------------------------------------------------------------
router.post("/sync", requireDm, (req, res) => {
  try {
    const status = referenceSync.getStatus();
    if (status.isSyncing) {
      return res.status(400).json({ error: "Sync is already in progress." });
    }

    // Trigger sync in background
    referenceSync.sync()
      .then(() => {
        // Clear cached JSON data so it reloads the fresh pulled data next search
        referenceSearch.clearCache();
        tokenImageLookup.clearCache();
      })
      .catch((err) => {
        console.error("[API] Background reference sync failed:", err.message);
      });

    res.json({ success: true, message: "Reference sync started in the background." });
  } catch (err) {
    console.error("[API] POST /api/reference/sync error:", err.message);
    res.status(500).json({ error: "Failed to start sync process." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/search  Search D&D reference files
// Query params: ?category=spells|monsters|items|races|classes|rules&q=fireball&limit=50
// ---------------------------------------------------------------------------
router.get("/search", async (req, res) => {
  try {
    const { category, q, limit } = req.query;

    if (!category) {
      return res.status(400).json({ error: "Category query parameter is required." });
    }

    const maxResults = limit ? Math.min(200, Math.max(1, Number(limit))) : 50;
    const allowedSources = await getAllowedSources();
    const results = referenceSearch
      .search(category, q || "", maxResults, { sources: allowedSources })
      .map((item) => withReferenceImage(item, category));
    
    res.json(results);
  } catch (err) {
    console.error("[API] GET /api/reference/search error:", err.message);
    res.status(500).json({ error: "Failed to perform reference search." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/detail  Retrieve one full reference record
// Query params: ?category=monsters&name=Goblin&source=MM
// ---------------------------------------------------------------------------
router.get("/detail", async (req, res) => {
  try {
    const { category, name, source } = req.query;
    if (!category || !name || typeof category !== "string" || typeof name !== "string") {
      return res.status(400).json({ error: "Category and name query parameters are required." });
    }

    const allowedSources = await getAllowedSources();
    const item = referenceSearch.getByName(category, name, typeof source === "string" ? source : "", {
      sources: allowedSources,
    });

    if (!item) {
      return res.status(404).json({ error: "Reference entry not found." });
    }

    res.json(withReferenceInfo(withReferenceImage(item, category), category, allowedSources));
  } catch (err) {
    console.error("[API] GET /api/reference/detail error:", err.message);
    res.status(500).json({ error: "Failed to retrieve reference detail." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/token-image  Resolve a monster portrait from 5etools images
// Query params: ?name=Goblin&source=MM
// ---------------------------------------------------------------------------
router.get("/token-image", (req, res) => {
  try {
    const { name, source } = req.query;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Monster name query parameter is required." });
    }

    const match = tokenImageLookup.findMonsterTokenImage({
      name: name.trim(),
      source: typeof source === "string" ? source.trim() : "",
    });

    if (!match) {
      return res.status(404).json({ error: "No token image found for this monster." });
    }

    res.json(match);
  } catch (err) {
    console.error("[API] GET /api/reference/token-image error:", err.message);
    res.status(500).json({ error: "Failed to resolve token image." });
  }
});

module.exports = router;
