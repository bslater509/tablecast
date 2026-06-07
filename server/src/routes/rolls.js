// =============================================================================
// Tablecast — Dice Roll History Routes
// Endpoints:  GET /api/rolls
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/rolls  list latest 50 rolls
// ---------------------------------------------------------------------------
router.get("/", async (_req, res) => {
  try {
    const rolls = await prisma.roll.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(rolls);
  } catch (err) {
    console.error("[API] GET /api/rolls error:", err.message);
    res.status(500).json({ error: "Failed to fetch roll history." });
  }
});

module.exports = router;
