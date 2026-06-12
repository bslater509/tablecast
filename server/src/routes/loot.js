// =============================================================================
// Tablecast  Loot Generator Routes
// Endpoints:  POST   /api/loot/generate              — Generate loot
//             GET    /api/loot/cache                  — List unclaimed loot
//             POST   /api/loot/cache/:id/assign       — Assign to party
//             DELETE /api/loot/cache/:id              — Discard cache
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
// eslint-disable-next-line unused-imports/no-unused-vars
const { requireDm, getRequestUser } = require("../auth");
const logger = require("../utils/logger");
const {
  generateIndividualTreasure,
  generateHoardTreasure,
  calculateTotalValue,
  getCrTier,
} = require("../utils/treasureTables");

const router = Router();

// ---------------------------------------------------------------------------
// Helper: Parse JSON safely
// ---------------------------------------------------------------------------
function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return fallback;
  }
}

function parseJsonArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Format a loot cache record for API response.
 */
function formatCache(c) {
  return {
    ...c,
    data: parseJson(c.data),
  };
}

// ---------------------------------------------------------------------------
// POST /api/loot/generate — Generate loot
// Body: { cr: number|string, type: "individual"|"hoard"|"both", label?: string }
// ---------------------------------------------------------------------------
router.post("/generate", requireDm, async (req, res) => {
  try {
    const { cr, type = "individual", label } = req.body;

    if (cr === undefined || cr === null) {
      return res.status(400).json({ error: "cr (challenge rating) is required." });
    }

    const tier = getCrTier(cr);
    let result;

    if (type === "individual" || type === "both") {
      result = generateIndividualTreasure(cr);
      result.type = "individual";
      result.tier = tier;
    }

    if (type === "hoard" || type === "both") {
      const hoard = generateHoardTreasure(cr);
      hoard.type = "hoard";
      hoard.tier = tier;

      if (type === "both") {
        result = {
          type: "both",
          tier,
          individual: result,
          hoard,
          totalValue: calculateTotalValue(result) + calculateTotalValue(hoard),
        };
      } else {
        result = hoard;
      }
    }

    if (!result) {
      result = generateIndividualTreasure(cr);
      result.type = "individual";
      result.tier = tier;
    }

    // Calculate total value if not already done
    if (result.totalValue === undefined) {
      result.totalValue = calculateTotalValue(result);
    }

    // Add label
    result.label = label || `CR ${cr} ${type === "both" ? "Treasure" : type === "hoard" ? "Hoard" : "Individual Treasure"}`;
    result.cr = cr;

    res.json(result);
  } catch (err) {
    logger.error("api:loot", "Error in POST /api/loot/generate", { error: err.message });
    res.status(500).json({ error: "Failed to generate loot." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/loot/cache — Save generated loot as unclaimed cache
// Body: { data: object } — the loot generation result
// ---------------------------------------------------------------------------
router.post("/cache", requireDm, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: "data (loot generation result) is required." });
    }
    const cache = await prisma.lootCache.create({
      data: {
        data: JSON.stringify(data),
      },
    });
    res.status(201).json(formatCache(cache));
  } catch (err) {
    logger.error("api:loot", "Error in POST /api/loot/cache", { error: err.message });
    res.status(500).json({ error: "Failed to cache loot." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/loot/cache — List unclaimed loot caches
// ---------------------------------------------------------------------------
router.get("/cache", requireDm, async (req, res) => {
  try {
    const caches = await prisma.lootCache.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(caches.map(formatCache));
  } catch (err) {
    logger.error("api:loot", "Error in GET /api/loot/cache", { error: err.message });
    res.status(500).json({ error: "Failed to list loot caches." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/loot/cache/:id/assign — Assign cached loot to a party
// Body: { partyId: number }
// ---------------------------------------------------------------------------
router.post("/cache/:id/assign", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { partyId } = req.body;

    if (!partyId) {
      return res.status(400).json({ error: "partyId is required." });
    }

    // Fetch the loot cache
    const cache = await prisma.lootCache.findUnique({ where: { id } });
    if (!cache) {
      return res.status(404).json({ error: "Loot cache not found." });
    }

    // Fetch the party
    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party) {
      return res.status(404).json({ error: "Party not found." });
    }

    const data = parseJson(cache.data);
    const partyInventory = parseJsonArray(party.inventory);
    const partyCurrency = parseJson(party.currency);

    // Add coins to party currency
    if (data.coins) {
      partyCurrency.pp = (partyCurrency.pp || 0) + (data.coins.pp || 0);
      partyCurrency.gp = (partyCurrency.gp || 0) + (data.coins.gp || 0);
      partyCurrency.ep = (partyCurrency.ep || 0) + (data.coins.ep || 0);
      partyCurrency.sp = (partyCurrency.sp || 0) + (data.coins.sp || 0);
      partyCurrency.cp = (partyCurrency.cp || 0) + (data.coins.cp || 0);
    }

    // Add gems to inventory
    const gems = data.gems || [];
    for (const gem of gems) {
      partyInventory.push({
        name: gem.name,
        quantity: 1,
        weight: 0,
        description: `Gemstone worth ${gem.value} gp`,
        type: "gem",
        value: gem.value,
      });
    }

    // Add art objects to inventory
    const art = data.art || [];
    for (const a of art) {
      partyInventory.push({
        name: a.name,
        quantity: 1,
        weight: 0,
        description: `Art object worth ${a.value} gp`,
        type: "art",
        value: a.value,
      });
    }

    // Add magic items to inventory
    const magicItems = data.magicItems || [];
    for (const item of magicItems) {
      partyInventory.push({
        name: item.name,
        quantity: 1,
        weight: 1,
        description: item.consumable ? "Consumable magic item" : "Magic item",
        type: "magic_item",
        consumable: item.consumable || false,
      });
    }

    // Update party
    await prisma.party.update({
      where: { id: partyId },
      data: {
        inventory: JSON.stringify(partyInventory),
        currency: JSON.stringify(partyCurrency),
      },
    });

    // Delete the loot cache after assigning
    await prisma.lootCache.delete({ where: { id } });

    // Return updated party
    const updatedParty = await prisma.party.findUnique({
      where: { id: partyId },
      include: {
        members: {
          include: {
            character: {
              select: { id: true, name: true, race: true, class: true, level: true, gold: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      message: `Loot assigned to party "${party.name}". ${magicItems.length} magic item(s), ${gems.length} gem(s), ${art.length} art object(s), and coins transferred.`,
      party: updatedParty,
    });
  } catch (err) {
    logger.error("api:loot", "Error in POST /api/loot/cache/:id/assign", { error: err.message });
    res.status(500).json({ error: "Failed to assign loot to party." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/loot/cache/:id — Discard a loot cache
// ---------------------------------------------------------------------------
router.delete("/cache/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.lootCache.delete({ where: { id } });
    res.json({ success: true, message: "Loot cache discarded." });
  } catch (err) {
    logger.error("api:loot", "Error in DELETE /api/loot/cache/:id", { error: err.message });
    res.status(500).json({ error: "Failed to discard loot cache." });
  }
});

module.exports = router;
