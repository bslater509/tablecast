// =============================================================================
// Tablecast — Dice Roll History Routes
// Endpoints:  GET /api/rolls
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser } = require("../auth");
const debug = require("../utils/debug");
const logger = require("../utils/logger");
const log = debug("tablecast:routes:rolls");

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/rolls  list latest 50 rolls
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    log("GET /api/rolls — fetching latest 50 rolls");
    const rolls = await prisma.roll.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    log("GET /api/rolls — returning %d rolls", rolls.length);
    res.json(rolls);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/rolls", { error: err.message });
    res.status(500).json({ error: "Failed to fetch roll history." });
  }
});

module.exports = router;
