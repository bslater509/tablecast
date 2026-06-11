// =============================================================================
// Tablecast  Level-Up Route
// Endpoint:  POST /api/characters/:id/level-up
// Handles character level advancement per D&D 5e rules.
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

// Levels where Ability Score Improvements / Feats are gained
const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

// Maximum ability score per D&D 5e PHB
const MAX_ABILITY_SCORE = 20;

// Allowed ability score fields
const ABILITY_FIELDS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

// ---------------------------------------------------------------------------
// POST /api/characters/:id/level-up
// Body: {
//   newHp: number (how much maxHp increased, e.g. from hit die roll + con mod),
//   abilityIncreases?: { strength?: number, dexterity?: number, ... },
//   featName?: string,
//   spells?: array (updated full spells array),
//   spellSlots?: object (updated full spellSlots object),
//   features?: array (new features to add to modifiers),
// }
// ---------------------------------------------------------------------------
router.post("/:id/level-up", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { newHp, abilityIncreases, featName, spells, spellSlots, features } = req.body;

    // Authorization
    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    // Fetch current character
    const character = await prisma.character.findUnique({
      where: { id },
    });
    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    // Check ownership or DM
    const isDM = reqUser.role === "DM";
    const isOwner = character.userId === reqUser.id;
    const isSelf = reqUser.type === "character" && character.id === reqUser.id;
    if (!isDM && !isOwner && !isSelf) {
      return res.status(403).json({ error: "You are not authorized to level up this character." });
    }

    const currentLevel = character.level;
    const newLevel = currentLevel + 1;

    if (newLevel > 20) {
      return res.status(400).json({ error: "Characters cannot advance beyond level 20." });
    }

    // Validate newHp
    if (!newHp || typeof newHp !== "number" || newHp < 1 || !Number.isFinite(newHp)) {
      return res.status(400).json({ error: "newHp must be a positive number (the HP gained this level)." });
    }

    // Build update data
    const updateData = {
      level: newLevel,
      maxHp: character.maxHp + newHp,
      // Hit dice total increases with level
      hitDiceTotal: newLevel,
    };

    // Apply Ability Score Improvements (ASI) if this is an ASI level
    if (ASI_LEVELS.has(newLevel) && abilityIncreases) {
      for (const abil of ABILITY_FIELDS) {
        if (abilityIncreases[abil] !== undefined) {
          const increase = Number(abilityIncreases[abil]);
          if (!Number.isFinite(increase) || increase < 0 || increase > 2) {
            return res.status(400).json({
              error: `Invalid increase for ${abil}. Must be 0, 1, or 2.`,
            });
          }
          const currentVal = character[abil] || 10;
          const newVal = currentVal + increase;
          if (newVal > MAX_ABILITY_SCORE) {
            return res.status(400).json({
              error: `${abil} cannot exceed ${MAX_ABILITY_SCORE} (currently ${currentVal}, trying to add ${increase}).`,
            });
          }
          updateData[abil] = newVal;
        }
      }
    }

    // Validate feat name
    if (featName && typeof featName !== "string") {
      return res.status(400).json({ error: "featName must be a string." });
    }

    // Update spells if provided
    if (spells !== undefined) {
      if (typeof spells !== "string") {
        return res.status(400).json({ error: "spells must be a JSON string." });
      }
      try { JSON.parse(spells); } catch {
        return res.status(400).json({ error: "spells must be valid JSON." });
      }
      updateData.spells = spells;
    }

    // Update spell slots if provided
    if (spellSlots !== undefined) {
      if (typeof spellSlots !== "string") {
        return res.status(400).json({ error: "spellSlots must be a JSON string." });
      }
      try { JSON.parse(spellSlots); } catch {
        return res.status(400).json({ error: "spellSlots must be valid JSON." });
      }
      updateData.spellSlots = spellSlots;
    }

    // Update features / class choices in modifiers
    if (features && Array.isArray(features) && features.length > 0) {
      const currentModifiers = parseJson(character.modifiers || "{}", {});
      currentModifiers.features = [...(currentModifiers.features || []), ...features];
      if (featName) {
        currentModifiers.feat = featName;
      }
      updateData.modifiers = JSON.stringify(currentModifiers);
    } else if (featName) {
      const currentModifiers = parseJson(character.modifiers || "{}", {});
      currentModifiers.feat = featName;
      updateData.modifiers = JSON.stringify(currentModifiers);
    }

    const updatedCharacter = await prisma.character.update({
      where: { id },
      data: updateData,
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    logger.info("api:levelup", `Character ${id} leveled up to ${newLevel}`, {
      characterId: id,
      previousLevel: currentLevel,
      newLevel,
      hpGained: newHp,
      reqId: req.id,
    });

    res.json({
      character: updatedCharacter,
      previousLevel: currentLevel,
      newLevel,
      hpGained: newHp,
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Character not found." });
    }
    logger.error("api:route", "Error in POST /api/characters/:id/level-up", { error: err.message });
    res.status(500).json({ error: "Failed to level up character." });
  }
});

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

module.exports = router;
