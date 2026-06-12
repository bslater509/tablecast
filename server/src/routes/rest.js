// =============================================================================
// Tablecast  Rest Route
// Endpoint:  POST /api/characters/:id/rest
// Handles short and long rest recovery per D&D 5e rules.
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

/**
 * Calculate a character's Constitution modifier from their CON score.
 * Formula: floor((score - 10) / 2)
 */
function calcConMod(constitution) {
  return Math.floor((constitution - 10) / 2);
}

/**
 * Parse a hit die type string like "d6", "d8", "d10", "d12" to the die size.
 * Returns the numeric maximum value of the die, or 8 as a safe fallback.
 */
function parseHitDieSize(hitDiceType) {
  const num = parseInt(hitDiceType?.replace(/^d/i, "") || "8", 10);
  return Number.isFinite(num) && num >= 4 ? num : 8;
}

/**
 * Calculate average HP recovered from spending one hit die.
 * D&D 5e average: (dieSize / 2) + 1, plus Constitution modifier.
 */
function averageHitDieHealing(hitDiceType, conMod) {
  const dieSize = parseHitDieSize(hitDiceType);
  const averageRoll = Math.floor(dieSize / 2) + 1;
  return Math.max(1, averageRoll + conMod);
}

// ---------------------------------------------------------------------------
// POST /api/characters/:id/rest
// Body: { type: "short" | "long", hitDiceToSpend?: number, hpRecovered?: number }
// ---------------------------------------------------------------------------
router.post("/:id/rest", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { type, hitDiceToSpend, hpRecovered } = req.body;

    // Validate rest type
    if (!type || !["short", "long"].includes(type)) {
      return res.status(400).json({ error: 'type must be "short" or "long".' });
    }

    // Authorization
    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    // Fetch character
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
      return res.status(403).json({ error: "You are not authorized to rest this character." });
    }

    const {maxHp} = character;
    const currentHp = character.hp;
    const conMod = calcConMod(character.constitution);

    // -- Parse current hit dice state --
    const hitDiceTotal = character.hitDiceTotal || character.level || 1;
    const hitDiceUsed = character.hitDiceUsed || 0;
    const hitDiceType = character.hitDiceType || "d10";

    // -- Refuse rest if character is dead (hp <= 0) --
    if (currentHp <= 0) {
      return res.status(400).json({ error: "Cannot rest while unconscious or dead." });
    }

    const updateData = {};
    let resultHpRecovered = 0;
    let resultHitDiceRecovered = 0;

    if (type === "short") {
      // ---- Short Rest ----

      // Validate hitDiceToSpend
      const diceToSpend = hitDiceToSpend !== undefined ? Math.max(0, Math.floor(Number(hitDiceToSpend))) : 0;
      const remainingDice = hitDiceTotal - hitDiceUsed;

      if (diceToSpend > remainingDice) {
        return res.status(400).json({
          error: `Cannot spend ${diceToSpend} hit dice. Only ${remainingDice} remaining (${hitDiceTotal} total, ${hitDiceUsed} used).`,
        });
      }

      // Calculate HP recovered
      if (hpRecovered !== undefined && hpRecovered > 0) {
        // Frontend rolled and provided explicit HP recovery
        resultHpRecovered = Math.max(0, Math.floor(Number(hpRecovered)));
      } else if (diceToSpend > 0) {
        // Server-calculated average recovery
        resultHpRecovered = 0;
        for (let i = 0; i < diceToSpend; i++) {
          resultHpRecovered += averageHitDieHealing(hitDiceType, conMod);
        }
      }

      // Apply HP recovery (cap at maxHp)
      const newHp = Math.min(maxHp, currentHp + resultHpRecovered);
      updateData.hp = newHp;
      resultHpRecovered = newHp - currentHp; // actual recovered amount

      // Update hit dice used
      if (diceToSpend > 0) {
        updateData.hitDiceUsed = hitDiceUsed + diceToSpend;
      }
    } else {
      // ---- Long Rest ----

      // Full HP recovery
      resultHpRecovered = maxHp - currentHp;
      updateData.hp = maxHp;

      // Recover half total hit dice (rounded down)
      resultHitDiceRecovered = Math.floor(hitDiceTotal / 2);
      updateData.hitDiceUsed = Math.max(0, hitDiceUsed - resultHitDiceRecovered);
    }

    // Save changes
    const updatedCharacter = await prisma.character.update({
      where: { id },
      data: updateData,
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    const response = {
      character: updatedCharacter,
      restType: type,
      hpRecovered: resultHpRecovered,
    };

    if (type === "long") {
      response.hitDiceRecovered = resultHitDiceRecovered;
    }

    logger.info("api:rest", `Character ${id} took a ${type} rest`, {
      characterId: id,
      restType: type,
      hpRecovered: resultHpRecovered,
      hitDiceRecovered: resultHitDiceRecovered,
      reqId: req.id,
    });

    res.json(response);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Character not found." });
    }
    logger.error("api:route", "Error in POST /api/characters/:id/rest", { error: err.message });
    res.status(500).json({ error: "Failed to process rest." });
  }
});

module.exports = router;
