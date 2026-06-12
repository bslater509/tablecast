// =============================================================================
// Tablecast  Party Routes
// Endpoints:  GET    /api/parties              — List parties
//             POST   /api/parties              — Create party
//             GET    /api/parties/:id          — Get party with members
//             PUT    /api/parties/:id          — Update party name/gold
//             DELETE /api/parties/:id          — Delete party
//             POST   /api/parties/:id/members  — Add character to party
//             DELETE /api/parties/:id/members/:characterId — Remove member
//             POST   /api/parties/:id/transfer — Transfer items/gold
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

/**
 * Parse a JSON string safely, returning a default value on failure.
 */
function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

/**
 * Format copper pieces into a display-friendly string.
 * e.g. 12537 → "125 GP, 3 SP, 7 CP"
 */
// eslint-disable-next-line unused-imports/no-unused-vars
function formatCopper(cp) {
  if (!cp || cp < 0) cp = 0;
  const gold = Math.floor(cp / 100);
  const silver = Math.floor((cp % 100) / 10);
  const copper = cp % 10;
  const parts = [];
  if (gold > 0) parts.push(`${gold} GP`);
  if (silver > 0) parts.push(`${silver} SP`);
  if (copper > 0 || parts.length === 0) parts.push(`${copper} CP`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// GET /api/parties  — list parties
// DM sees all parties; authenticated users see parties they belong to
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const isDM = reqUser.role === "DM";

    const where = {};
    if (!isDM) {
      // Non-DM users see only their own parties
      if (reqUser.type === "character") {
        where.members = { some: { characterId: reqUser.id } };
      } else {
        // User identity — find characters owned by this user, then their parties
        where.members = {
          some: { character: { userId: reqUser.id } },
        };
      }
    }

    const parties = await prisma.party.findMany({
      where,
      include: {
        members: {
          include: {
            character: {
              select: { id: true, name: true, race: true, class: true, level: true, gold: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(parties);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/parties", { error: err.message });
    res.status(500).json({ error: "Failed to fetch parties." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/parties/:id — get a single party with members
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const party = await prisma.party.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            character: {
              select: { id: true, name: true, race: true, class: true, level: true, gold: true, inventory: true },
            },
          },
        },
      },
    });

    if (!party) {
      return res.status(404).json({ error: "Party not found." });
    }

    // Enrich with parsed inventory and gold totals
    const enrichedMembers = party.members.map((m) => ({
      ...m,
      character: {
        ...m.character,
        parsedInventory: parseJson(m.character.inventory, []),
      },
    }));

    // Aggregate party inventory from all members
    const aggregatedInventory = [];
    const itemMap = {};
    for (const m of enrichedMembers) {
      if (m.character.parsedInventory) {
        for (const item of m.character.parsedInventory) {
          const key = item.name;
          if (itemMap[key]) {
            itemMap[key].quantity += item.quantity || 1;
          } else {
            itemMap[key] = { ...item, quantity: item.quantity || 1, owner: m.character.name };
          }
        }
      }
    }
    for (const item of Object.values(itemMap)) {
      aggregatedInventory.push(item);
    }

    const result = {
      ...party,
      members: enrichedMembers,
      aggregatedInventory,
      parsedCurrency: parseJson(party.currency, { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }),
      totalGold: enrichedMembers.reduce((sum, m) => sum + (m.character.gold || 0), 0),
    };

    res.json(result);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/parties/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch party." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/parties — create a new party
// Body: { name: string }
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name (string) is required." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    const party = await prisma.party.create({
      data: { name: name.trim() },
    });

    logger.info("api:parties", `Party created: ${party.name} (id=${party.id})`, {
      partyId: party.id,
      reqId: req.id,
    });

    res.status(201).json(party);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/parties", { error: err.message });
    res.status(500).json({ error: "Failed to create party." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/parties/:id — update party name/currency
// Body: { name?: string, currency?: string (JSON) }
// ---------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    const existing = await prisma.party.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Party not found." });
    }

    const data = {};
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string." });
      }
      data.name = req.body.name.trim();
    }
    if (req.body.currency !== undefined) {
      if (typeof req.body.currency !== "string") {
        return res.status(400).json({ error: "currency must be a JSON string." });
      }
      try { JSON.parse(req.body.currency); } catch {
        return res.status(400).json({ error: "currency must be valid JSON." });
      }
      data.currency = req.body.currency;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const updated = await prisma.party.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Party not found." });
    }
    logger.error("api:route", "Error in PUT /api/parties/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update party." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/parties/:id — delete a party (cascades to members)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    const existing = await prisma.party.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Party not found." });
    }

    await prisma.party.delete({ where: { id } });

    res.json({ message: "Party deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Party not found." });
    }
    logger.error("api:route", "Error in DELETE /api/parties/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete party." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/parties/:id/members — add a character to the party
// Body: { characterId: number, role?: string }
// ---------------------------------------------------------------------------
router.post("/:id/members", async (req, res) => {
  try {
    const partyId = Number(req.params.id);
    if (isNaN(partyId)) {
      return res.status(400).json({ error: "party id must be a valid number." });
    }

    const { characterId, role } = req.body;

    if (!characterId) {
      return res.status(400).json({ error: "characterId (number) is required." });
    }

    const parsedCharId = Number(characterId);
    if (isNaN(parsedCharId)) {
      return res.status(400).json({ error: "characterId must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    // Verify party exists
    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party) {
      return res.status(404).json({ error: "Party not found." });
    }

    // Verify character exists
    const character = await prisma.character.findUnique({ where: { id: parsedCharId } });
    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    // Check if character already in this party
    const existingMember = await prisma.partyMember.findUnique({
      where: { partyId_characterId: { partyId, characterId: parsedCharId } },
    });
    if (existingMember) {
      return res.status(400).json({ error: "Character is already a member of this party." });
    }

    const member = await prisma.partyMember.create({
      data: {
        partyId,
        characterId: parsedCharId,
        role: role || "MEMBER",
      },
      include: {
        character: {
          select: { id: true, name: true, race: true, class: true, level: true },
        },
      },
    });

    logger.info("api:parties", `Character ${parsedCharId} added to party ${partyId}`, {
      partyId,
      characterId: parsedCharId,
      role: role || "MEMBER",
      reqId: req.id,
    });

    res.status(201).json(member);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Character is already a member of this party." });
    }
    logger.error("api:route", "Error in POST /api/parties/:id/members", { error: err.message });
    res.status(500).json({ error: "Failed to add member to party." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/parties/:id/members/:characterId — remove a character from party
// ---------------------------------------------------------------------------
router.delete("/:id/members/:characterId", async (req, res) => {
  try {
    const partyId = Number(req.params.id);
    const characterId = Number(req.params.characterId);

    if (isNaN(partyId) || isNaN(characterId)) {
      return res.status(400).json({ error: "party id and character id must be valid numbers." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    const existing = await prisma.partyMember.findUnique({
      where: { partyId_characterId: { partyId, characterId } },
    });
    if (!existing) {
      return res.status(404).json({ error: "Member not found in this party." });
    }

    await prisma.partyMember.delete({
      where: { partyId_characterId: { partyId, characterId } },
    });

    res.json({ message: "Member removed from party." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Member not found." });
    }
    logger.error("api:route", "Error in DELETE /api/parties/:id/members/:characterId", { error: err.message });
    res.status(500).json({ error: "Failed to remove member." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/parties/:id/transfer — transfer gold or items between party and character
// Body: {
//   type: "gold" | "item",
//   from: "party" | "character",
//   characterId: number,
//   amount?: number (for gold, in copper pieces),
//   itemName?: string (for items),
//   itemQuantity?: number (for items),
// }
// ---------------------------------------------------------------------------
router.post("/:id/transfer", async (req, res) => {
  try {
    const partyId = Number(req.params.id);
    if (isNaN(partyId)) {
      return res.status(400).json({ error: "party id must be a valid number." });
    }

    const { type, from, characterId, amount, itemName, itemQuantity } = req.body;

    if (!type || !["gold", "item"].includes(type)) {
      return res.status(400).json({ error: 'type must be "gold" or "item".' });
    }
    if (!from || !["party", "character"].includes(from)) {
      return res.status(400).json({ error: 'from must be "party" or "character".' });
    }
    if (!characterId) {
      return res.status(400).json({ error: "characterId is required." });
    }

    const parsedCharId = Number(characterId);
    if (isNaN(parsedCharId)) {
      return res.status(400).json({ error: "characterId must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    // Fetch both party and character
    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party) {
      return res.status(404).json({ error: "Party not found." });
    }

    const character = await prisma.character.findUnique({ where: { id: parsedCharId } });
    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    // Verify membership
    const membership = await prisma.partyMember.findUnique({
      where: { partyId_characterId: { partyId, characterId: parsedCharId } },
    });
    if (!membership) {
      return res.status(400).json({ error: "Character is not a member of this party." });
    }

    if (type === "gold") {
      // Transfer gold (in copper pieces)
      const transferAmount = Math.max(0, Math.floor(Number(amount) || 0));
      if (transferAmount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number." });
      }

      if (from === "character") {
        // Character → Party
        if ((character.gold || 0) < transferAmount) {
          return res.status(400).json({
            error: `Character only has ${character.gold || 0} CP. Cannot transfer ${transferAmount} CP.`,
          });
        }
        await prisma.character.update({
          where: { id: parsedCharId },
          data: { gold: (character.gold || 0) - transferAmount },
        });
        // Add to party currency (simplified: just add to the pp pool for now)
        const partyCurrency = parseJson(party.currency, { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
        partyCurrency.cp = (partyCurrency.cp || 0) + transferAmount;
        await prisma.party.update({
          where: { id: partyId },
          data: { currency: JSON.stringify(partyCurrency) },
        });
      } else {
        // Party → Character
        const partyCurrency = parseJson(party.currency, { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
        const totalPartyCp = (partyCurrency.pp || 0) * 1000 + (partyCurrency.gp || 0) * 100
          + (partyCurrency.ep || 0) * 50 + (partyCurrency.sp || 0) * 10 + (partyCurrency.cp || 0);
        if (totalPartyCp < transferAmount) {
          return res.status(400).json({
            error: `Party only has ${totalPartyCp} CP equivalent. Cannot transfer ${transferAmount} CP.`,
          });
        }
        // Deduct from party currency (simplified: deduct from CP first, then SP, GP, PP)
        let remaining = transferAmount;
        const deductCp = Math.min(partyCurrency.cp || 0, remaining);
        remaining -= deductCp;
        partyCurrency.cp = (partyCurrency.cp || 0) - deductCp;

        const deductSp = Math.min(partyCurrency.sp || 0, Math.floor(remaining / 10));
        remaining -= deductSp * 10;
        partyCurrency.sp = (partyCurrency.sp || 0) - deductSp;

        const deductEp = Math.min(partyCurrency.ep || 0, Math.floor(remaining / 50));
        remaining -= deductEp * 50;
        partyCurrency.ep = (partyCurrency.ep || 0) - deductEp;

        const deductGp = Math.min(partyCurrency.gp || 0, Math.floor(remaining / 100));
        remaining -= deductGp * 100;
        partyCurrency.gp = (partyCurrency.gp || 0) - deductGp;

        const deductPp = Math.min(partyCurrency.pp || 0, Math.ceil(remaining / 1000));
        remaining -= deductPp * 1000;
        partyCurrency.pp = (partyCurrency.pp || 0) - deductPp;

        if (remaining > 0) {
          return res.status(400).json({ error: "Party does not have enough currency." });
        }

        await prisma.party.update({
          where: { id: partyId },
          data: { currency: JSON.stringify(partyCurrency) },
        });
        await prisma.character.update({
          where: { id: parsedCharId },
          data: { gold: (character.gold || 0) + transferAmount },
        });
      }
    } else {
      // Transfer items
      const transQty = Math.max(1, Math.floor(Number(itemQuantity) || 1));
      if (!itemName || typeof itemName !== "string" || !itemName.trim()) {
        return res.status(400).json({ error: "itemName is required for item transfers." });
      }

      const charInventory = parseJson(character.inventory, []);
      const partyInventory = parseJson(party.inventory, []);

      if (from === "character") {
        // Character → Party: remove from character, add to party
        const itemIdx = charInventory.findIndex(
          (i) => i.name.toLowerCase() === itemName.trim().toLowerCase()
        );
        if (itemIdx === -1) {
          return res.status(400).json({ error: `Character does not have "${itemName}" in their inventory.` });
        }
        const charItem = charInventory[itemIdx];
        const currentQty = charItem.quantity || 1;
        if (currentQty < transQty) {
          return res.status(400).json({
            error: `Character only has ${currentQty}x "${itemName}". Cannot transfer ${transQty}.`,
          });
        }
        if (currentQty === transQty) {
          charInventory.splice(itemIdx, 1);
        } else {
          charInventory[itemIdx] = { ...charItem, quantity: currentQty - transQty };
        }

        // Add to party inventory
        const partyItemIdx = partyInventory.findIndex(
          (i) => i.name.toLowerCase() === itemName.trim().toLowerCase()
        );
        if (partyItemIdx >= 0) {
          partyInventory[partyItemIdx].quantity = (partyInventory[partyItemIdx].quantity || 1) + transQty;
        } else {
          partyInventory.push({
            name: itemName.trim(),
            quantity: transQty,
            weight: charItem.weight || 0,
            description: charItem.description || "",
          });
        }

        await prisma.character.update({
          where: { id: parsedCharId },
          data: { inventory: JSON.stringify(charInventory) },
        });
        await prisma.party.update({
          where: { id: partyId },
          data: { inventory: JSON.stringify(partyInventory) },
        });
      } else {
        // Party → Character: remove from party, add to character
        const partyItemIdx = partyInventory.findIndex(
          (i) => i.name.toLowerCase() === itemName.trim().toLowerCase()
        );
        if (partyItemIdx === -1) {
          return res.status(400).json({ error: `Party does not have "${itemName}" in their inventory.` });
        }
        const partyItem = partyInventory[partyItemIdx];
        const currentQty = partyItem.quantity || 1;
        if (currentQty < transQty) {
          return res.status(400).json({
            error: `Party only has ${currentQty}x "${itemName}". Cannot transfer ${transQty}.`,
          });
        }
        if (currentQty === transQty) {
          partyInventory.splice(partyItemIdx, 1);
        } else {
          partyInventory[partyItemIdx] = { ...partyItem, quantity: currentQty - transQty };
        }

        // Add to character inventory
        const charItemIdx = charInventory.findIndex(
          (i) => i.name.toLowerCase() === itemName.trim().toLowerCase()
        );
        if (charItemIdx >= 0) {
          charInventory[charItemIdx].quantity = (charInventory[charItemIdx].quantity || 1) + transQty;
        } else {
          charInventory.push({
            name: itemName.trim(),
            quantity: transQty,
            weight: partyItem.weight || 0,
            description: partyItem.description || "",
          });
        }

        await prisma.party.update({
          where: { id: partyId },
          data: { inventory: JSON.stringify(partyInventory) },
        });
        await prisma.character.update({
          where: { id: parsedCharId },
          data: { inventory: JSON.stringify(charInventory) },
        });
      }
    }

    logger.info("api:parties", `Transfer completed in party ${partyId}`, {
      partyId,
      type,
      from,
      characterId: parsedCharId,
      amount: amount || null,
      itemName: itemName || null,
      reqId: req.id,
    });

    // Return updated party and character
    const updatedParty = await prisma.party.findUnique({
      where: { id: partyId },
      include: {
        members: {
          include: {
            character: {
              select: { id: true, name: true, race: true, class: true, level: true, gold: true, inventory: true },
            },
          },
        },
      },
    });
    const updatedChar = await prisma.character.findUnique({
      where: { id: parsedCharId },
      include: { user: { select: { id: true, username: true, role: true } } },
    });

    res.json({ party: updatedParty, character: updatedChar });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/parties/:id/transfer", { error: err.message });
    res.status(500).json({ error: "Failed to process transfer." });
  }
});

module.exports = router;
