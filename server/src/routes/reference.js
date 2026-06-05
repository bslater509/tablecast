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

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/reference/status  Retrieve repository and sync status
// ---------------------------------------------------------------------------
router.get("/status", (req, res) => {
  try {
    const status = referenceSync.getStatus();
    res.json(status);
  } catch (err) {
    console.error("[API] GET /api/reference/status error:", err.message);
    res.status(500).json({ error: "Failed to retrieve sync status." });
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
router.get("/search", (req, res) => {
  try {
    const { category, q, limit } = req.query;

    if (!category) {
      return res.status(400).json({ error: "Category query parameter is required." });
    }

    const maxResults = limit ? Math.min(200, Math.max(1, Number(limit))) : 50;
    const results = referenceSearch.search(category, q || "", maxResults);
    
    res.json(results);
  } catch (err) {
    console.error("[API] GET /api/reference/search error:", err.message);
    res.status(500).json({ error: "Failed to perform reference search." });
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
