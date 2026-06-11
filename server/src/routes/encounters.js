"use strict";

const crypto = require("crypto");
const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser, requireDm } = require("../auth");
const referenceSearch = require("../utils/referenceSearch");
const tokenImageLookup = require("../utils/tokenImageLookup");
const generateTokenSvg = require("../utils/generateTokenSvg");
const logger = require("../utils/logger");

const router = Router();
const VALID_STATUSES = new Set(["DRAFT", "ACTIVE", "COMPLETE"]);

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function clampInt(value, fallback, min = 0, max = 100000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.round(parsed), max));
}

function getModifier(score) {
  return Math.floor((Number(score || 10) - 10) / 2);
}

function rollD20(modifier = 0) {
  return crypto.randomInt(1, 21) + Number(modifier || 0);
}

function cleanEntryText(value) {
  return String(value || "")
    .replace(/\{@hit (\d+)\}/g, "+$1")
    .replace(/\{@damage ([^}]+)\}/g, "$1")
    .replace(/\{@dice ([^}]+)\}/g, "$1")
    .replace(/\{@spell ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@item ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@creature ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@condition ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@[a-z]+ ([^}|]+)[^}]*\}/g, "$1");
}

function mapMonsterActions(monster) {
  if (!Array.isArray(monster?.action)) return [];

  return monster.action.map((action) => {
    const entriesStr = Array.isArray(action.entries)
      ? action.entries.map((entry) => typeof entry === "string" ? entry : JSON.stringify(entry)).join(" ")
      : String(action.entries || "");
    const hitMatch = entriesStr.match(/\{@hit (\d+)\}/);
    const damageMatch = entriesStr.match(/\{@damage ([^}]+)\}/);
    return {
      name: action.name || "Action",
      description: cleanEntryText(entriesStr),
      toHit: hitMatch ? Number(hitMatch[1]) : 0,
      damage: damageMatch ? damageMatch[1].trim() : "",
    };
  });
}

function monsterTypeLabel(type) {
  if (!type) return "Monster";
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return type.map(monsterTypeLabel).join(", ");
  return type.type || "Monster";
}

function monsterImageUrl(monster) {
  if (monster.imageUrl || monster.tokenUrl) return monster.imageUrl || monster.tokenUrl;
  const match = tokenImageLookup.findMonsterTokenImage({
    name: monster.name,
    source: monster.source || "",
  });
  return match?.url || "";
}

function monsterToNpcData(monster, nameOverride = "") {
  const hp = clampInt(monster?.hp?.average, 10, 1, 10000);
  const ac = Array.isArray(monster?.ac)
    ? clampInt(monster.ac[0]?.ac ?? monster.ac[0], 10, 0, 1000)
    : 10;

  const modifiers = {
    strength: `${getModifier(monster?.str) >= 0 ? "+" : ""}${getModifier(monster?.str)}`,
    dexterity: `${getModifier(monster?.dex) >= 0 ? "+" : ""}${getModifier(monster?.dex)}`,
    constitution: `${getModifier(monster?.con) >= 0 ? "+" : ""}${getModifier(monster?.con)}`,
    intelligence: `${getModifier(monster?.int) >= 0 ? "+" : ""}${getModifier(monster?.int)}`,
    wisdom: `${getModifier(monster?.wis) >= 0 ? "+" : ""}${getModifier(monster?.wis)}`,
    charisma: `${getModifier(monster?.cha) >= 0 ? "+" : ""}${getModifier(monster?.cha)}`,
  };

  return {
    name: nameOverride || monster.name || "Monster",
    race: monsterTypeLabel(monster.type),
    class: "Monster",
    level: Math.max(1, Math.floor(hp / 6)),
    hp,
    maxHp: hp,
    ac,
    cr: String(monster.cr || "0"),
    imageUrl: monsterImageUrl(monster),
    strength: clampInt(monster.str, 10, 1, 100),
    dexterity: clampInt(monster.dex, 10, 1, 100),
    constitution: clampInt(monster.con, 10, 1, 100),
    intelligence: clampInt(monster.int, 10, 1, 100),
    wisdom: clampInt(monster.wis, 10, 1, 100),
    charisma: clampInt(monster.cha, 10, 1, 100),
    inventory: "[]",
    modifiers: JSON.stringify(modifiers),
    actions: JSON.stringify(mapMonsterActions(monster)),
  };
}

function includeEncounter() {
  return {
    map: true,
    participants: {
      include: { token: true, npc: true, character: true, monster: true },
      orderBy: [{ initiative: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
    },
  };
}

function shapeEncounter(encounter, isDm) {
  if (!encounter) return null;
  const visibleParticipants = isDm
    ? encounter.participants
    : encounter.participants.filter((participant) => !participant.isHidden);
  const current = encounter.participants[encounter.turnIndex] || encounter.participants[0] || null;
  const currentIsVisible = current && (isDm || !current.isHidden);

  return {
    ...encounter,
    map: encounter.map ? { ...encounter.map, fogState: isDm ? encounter.map.fogState : undefined } : undefined,
    participants: visibleParticipants,
    currentParticipantId: currentIsVisible ? current.id : null,
  };
}

async function fetchEncounter(id) {
  return prisma.encounter.findUnique({
    where: { id: Number(id) },
    include: includeEncounter(),
  });
}

async function respondEncounter(req, res, id) {
  const user = await getRequestUser(req);
  const encounter = await fetchEncounter(id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found." });
  // Non-DM users should not see DRAFT or COMPLETE encounters
  if (user?.role !== "DM" && encounter.status !== "ACTIVE") {
    return res.status(404).json({ error: "Encounter not found." });
  }
  res.json(shapeEncounter(encounter, user?.role === "DM"));
}

async function nextSortOrder(encounterId) {
  const count = await prisma.encounterParticipant.count({ where: { encounterId } });
  return count;
}

router.get("/active", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const mapId = Number(req.query.mapId);
    const where = user?.role === "DM"
      ? { status: { in: ["DRAFT", "ACTIVE"] } }
      : { status: "ACTIVE" };
    if (Number.isInteger(mapId) && mapId > 0) where.mapId = mapId;

    const encounter = await prisma.encounter.findFirst({
      where,
      include: includeEncounter(),
      orderBy: { updatedAt: "desc" },
    });
    res.json(shapeEncounter(encounter, user?.role === "DM"));
  } catch (err) {
    logger.error("api:route", "Error in GET /api/encounters/active", { error: err.message });
    res.status(500).json({ error: "Failed to fetch active encounter." });
  }
});

router.get("/", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    const mapId = Number(req.query.mapId);
    const where = {};
    if (Number.isInteger(mapId) && mapId > 0) where.mapId = mapId;
    if (user?.role !== "DM") where.status = "ACTIVE";

    const encounters = await prisma.encounter.findMany({
      where,
      include: includeEncounter(),
      orderBy: { updatedAt: "desc" },
    });
    res.json(encounters.map((encounter) => shapeEncounter(encounter, user?.role === "DM")));
  } catch (err) {
    logger.error("api:route", "Error in GET /api/encounters", { error: err.message });
    res.status(500).json({ error: "Failed to fetch encounters." });
  }
});

router.post("/", requireDm, async (req, res) => {
  try {
    const mapId = Number(req.body?.mapId);
    if (!Number.isInteger(mapId) || mapId <= 0) {
      return res.status(400).json({ error: "A valid mapId is required." });
    }

    const map = await prisma.map.findUnique({ where: { id: mapId } });
    if (!map) return res.status(404).json({ error: "Map not found." });

    const encounter = await prisma.encounter.create({
      data: {
        mapId,
        name: String(req.body?.name || `${map.name} Encounter`).trim().slice(0, 120),
      },
      include: includeEncounter(),
    });
    res.status(201).json(shapeEncounter(encounter, true));
  } catch (err) {
    logger.error("api:route", "Error in POST /api/encounters", { error: err.message });
    res.status(500).json({ error: "Failed to create encounter." });
  }
});

router.patch("/participants/:id", requireDm, async (req, res) => {
  try {
    const participantId = Number(req.params.id);
    if (!Number.isInteger(participantId) || participantId <= 0) {
      return res.status(400).json({ error: "Invalid participant id." });
    }

    const data = {};
    if (req.body.initiative !== undefined) data.initiative = clampInt(req.body.initiative, 0, -1000, 1000);
    if (req.body.currentHp !== undefined) data.currentHp = clampInt(req.body.currentHp, 0, 0, 100000);
    if (req.body.maxHp !== undefined) data.maxHp = clampInt(req.body.maxHp, 1, 1, 100000);
    if (req.body.ac !== undefined) data.ac = clampInt(req.body.ac, 10, 0, 1000);
    if (req.body.isHidden !== undefined) data.isHidden = Boolean(req.body.isHidden);
    if (req.body.name !== undefined) data.name = String(req.body.name || "").trim().slice(0, 120) || "Combatant";
    // VTT feature fields: conditions & death saves
    if (req.body.conditions !== undefined) data.conditions = req.body.conditions;
    if (req.body.deathSaves !== undefined) data.deathSaves = req.body.deathSaves;

    const participant = await prisma.encounterParticipant.update({
      where: { id: participantId },
      data,
      include: { encounter: true, token: true, npc: true, character: true, monster: true },
    });

    if (data.currentHp !== undefined) {
      if (participant.npcId) {
        await prisma.npc.update({ where: { id: participant.npcId }, data: { hp: data.currentHp } }).catch(() => null);
      }
      if (participant.monsterId) {
        await prisma.monster.update({ where: { id: participant.monsterId }, data: { hp: data.currentHp } }).catch(() => null);
      }
      if (participant.tokenId) {
        const stats = parseJson(participant.token?.stats, {});
        await prisma.token.update({
          where: { id: participant.tokenId },
          data: { stats: JSON.stringify({ ...stats, currentHp: data.currentHp, maxHp: participant.maxHp, ac: participant.ac }) },
        }).catch(() => null);
      }
    }

    await respondEncounter(req, res, participant.encounterId);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Participant not found." });
    logger.error("api:route", "Error in PATCH /api/encounters/participants/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update participant." });
  }
});

router.delete("/participants/:id", requireDm, async (req, res) => {
  try {
    const participantId = Number(req.params.id);
    if (!Number.isFinite(participantId) || participantId <= 0 || !Number.isInteger(participantId)) {
      return res.status(400).json({ error: "Participant id must be a valid positive integer." });
    }
    const participant = await prisma.encounterParticipant.delete({
      where: { id: participantId },
    });
    await respondEncounter(req, res, participant.encounterId);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Participant not found." });
    logger.error("api:route", "Error in DELETE /api/encounters/participants/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete participant." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    await respondEncounter(req, res, req.params.id);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/encounters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch encounter." });
  }
});

router.patch("/:id", requireDm, async (req, res) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = String(req.body.name || "").trim().slice(0, 120) || "Encounter";
    if (req.body.status !== undefined) {
      if (!VALID_STATUSES.has(req.body.status)) {
        return res.status(400).json({ error: `Invalid status "${req.body.status}". Must be one of: ${Array.from(VALID_STATUSES).join(", ")}.` });
      }
      // State machine rules: DRAFT→ACTIVE→COMPLETE only
      const current = await prisma.encounter.findUnique({ where: { id: Number(req.params.id) }, select: { status: true } });
      if (current) {
        const VALID_TRANSITIONS = { DRAFT: new Set(["ACTIVE"]), ACTIVE: new Set(["COMPLETE"]), COMPLETE: new Set([]) };
        if (!VALID_TRANSITIONS[current.status]?.has(req.body.status)) {
          return res.status(400).json({ error: `Invalid status transition from "${current.status}" to "${req.body.status}". Valid transitions: DRAFT→ACTIVE, ACTIVE→COMPLETE.` });
        }
      }
      data.status = req.body.status;
    }
    if (req.body.round !== undefined) data.round = clampInt(req.body.round, 1, 1, 10000);
    if (req.body.turnIndex !== undefined) data.turnIndex = clampInt(req.body.turnIndex, 0, 0, 10000);

    await prisma.encounter.update({ where: { id: Number(req.params.id) }, data });
    await respondEncounter(req, res, req.params.id);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Encounter not found." });
    logger.error("api:route", "Error in PATCH /api/encounters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update encounter." });
  }
});

router.delete("/:id", requireDm, async (req, res) => {
  try {
    await prisma.encounter.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Encounter deleted." });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Encounter not found." });
    logger.error("api:route", "Error in DELETE /api/encounters/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete encounter." });
  }
});

router.post("/:id/participants", requireDm, async (req, res) => {
  try {
    const encounterId = Number(req.params.id);
    const encounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter) return res.status(404).json({ error: "Encounter not found." });

    const type = String(req.body?.type || "").toLowerCase();
    const quantity = clampInt(req.body?.quantity, 1, 1, 20);
    const sortStart = await nextSortOrder(encounterId);
    const created = [];

    if (type === "character") {
      const character = await prisma.character.findUnique({ where: { id: Number(req.body.characterId) } });
      if (!character) return res.status(404).json({ error: "Character not found." });
      created.push(await prisma.encounterParticipant.create({
        data: {
          encounterId,
          characterId: character.id,
          name: character.name,
          currentHp: character.hp,
          maxHp: character.maxHp,
          ac: 10 + getModifier(character.dexterity),
          isHidden: Boolean(req.body.isHidden),
          sortOrder: sortStart,
          source: "character",
        },
      }));
    } else if (type === "npc") {
      const npc = await prisma.npc.findUnique({ where: { id: Number(req.body.npcId) } });
      if (!npc) return res.status(404).json({ error: "NPC not found." });
      created.push(await prisma.encounterParticipant.create({
        data: {
          encounterId,
          npcId: npc.id,
          name: npc.name,
          currentHp: npc.hp,
          maxHp: npc.maxHp,
          ac: npc.ac,
          isHidden: Boolean(req.body.isHidden),
          sortOrder: sortStart,
          source: "npc",
          imageUrl: npc.imageUrl,
        },
      }));
    } else if (type === "monster") {
      const monsterId = Number(req.body.monsterId);
      if (!monsterId) return res.status(400).json({ error: "monsterId is required." });

      const monster = await prisma.monster.findUnique({ where: { id: monsterId } });
      if (!monster) return res.status(404).json({ error: "Monster not found in database." });

      for (let i = 0; i < quantity; i += 1) {
        const label = quantity > 1 ? `${monster.name} ${i + 1}` : monster.name;
        created.push(await prisma.encounterParticipant.create({
          data: {
            encounterId,
            monsterId: monster.id,
            name: label,
            currentHp: monster.hp,
            maxHp: monster.maxHp,
            ac: monster.ac,
            isHidden: Boolean(req.body.isHidden),
            sortOrder: sortStart + i,
            source: "local",
            imageUrl: monster.imageUrl,
            stats: JSON.stringify(monster),
          },
        }));
      }
    } else {
      return res.status(400).json({ error: "type must be character, npc, or monster." });
    }

    await respondEncounter(req, res, encounterId);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/encounters/:id/participants", { error: err.message });
    res.status(500).json({ error: "Failed to add encounter participant." });
  }
});

router.post("/:id/deploy", requireDm, async (req, res) => {
  try {
    const encounter = await fetchEncounter(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found." });

    const startX = clampInt(req.body?.startX, 0, 0, 10000);
    const startY = clampInt(req.body?.startY, 0, 0, 10000);
    const participants = encounter.participants.filter((participant) => !participant.tokenId);

    for (let index = 0; index < participants.length; index += 1) {
      const participant = participants[index];
      let deployImageUrl = participant.imageUrl || participant.npc?.imageUrl || participant.monster?.imageUrl || "";
      if (!deployImageUrl) {
        deployImageUrl = generateTokenSvg(participant.name, "");
      }

      const token = await prisma.token.create({
        data: {
          mapId: encounter.mapId,
          characterId: participant.characterId,
          npcId: participant.npcId,
          monsterId: participant.monsterId,
          label: participant.name,
          imageUrl: deployImageUrl,
          x: startX + (index % 5),
          y: startY + Math.floor(index / 5),
          stats: JSON.stringify({
            currentHp: participant.currentHp,
            maxHp: participant.maxHp,
            ac: participant.ac,
            encounterParticipantId: participant.id,
          }),
        },
      });
      await prisma.encounterParticipant.update({
        where: { id: participant.id },
        data: { tokenId: token.id },
      });
    }

    await respondEncounter(req, res, encounter.id);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/encounters/:id/deploy", { error: err.message });
    res.status(500).json({ error: "Failed to deploy encounter." });
  }
});

router.post("/:id/start", requireDm, async (req, res) => {
  try {
    const encounter = await fetchEncounter(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found." });
    if (encounter.participants.length === 0) {
      return res.status(400).json({ error: "Add participants before starting combat." });
    }

    const rollInitiative = req.body?.rollInitiative !== false;
    for (const participant of encounter.participants) {
      if (!rollInitiative) continue;
      const dex = participant.character?.dexterity || participant.npc?.dexterity || parseJson(participant.stats, {})?.dex || 10;
      await prisma.encounterParticipant.update({
        where: { id: participant.id },
        data: { initiative: rollD20(getModifier(dex)) },
      });
    }

    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { status: "ACTIVE", round: 1, turnIndex: 0 },
    });
    await respondEncounter(req, res, encounter.id);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/encounters/:id/start", { error: err.message });
    res.status(500).json({ error: "Failed to start encounter." });
  }
});

router.post("/:id/turn", requireDm, async (req, res) => {
  try {
    const encounter = await fetchEncounter(req.params.id);
    if (!encounter) return res.status(404).json({ error: "Encounter not found." });
    const count = encounter.participants.length;
    if (count === 0) return res.status(400).json({ error: "Encounter has no participants." });

    const direction = req.body?.direction === "previous" ? -1 : 1;
    let round = encounter.round;
    let turnIndex = encounter.turnIndex + direction;
    if (turnIndex >= count) {
      turnIndex = 0;
      round += 1;
    } else if (turnIndex < 0) {
      turnIndex = count - 1;
      round = Math.max(1, round - 1);
    }

    // ── Condition expiry & death saves ──
    // If advancing forward (not previous), process the previous participant's conditions
    if (direction === 1) {
      const previousParticipant = encounter.participants[encounter.turnIndex];
      if (previousParticipant) {
        const conditions = parseJson(previousParticipant.conditions, []);
        let changed = false;

        // Decrement duration on each condition, remove expired ones
        const updated = conditions
          .map((c) => {
            if (c.duration === undefined || c.duration === null) return c; // permanent
            return { ...c, duration: c.duration - 1 };
          })
          .filter((c) => c.duration === undefined || c.duration === null || c.duration > 0);

        if (updated.length !== conditions.length) changed = true;
        // Check if any durations changed
        for (let i = 0; i < conditions.length; i++) {
          if (conditions[i].duration !== undefined && conditions[i].duration !== null &&
              updated[i] && updated[i].duration !== conditions[i].duration - 1) {
            changed = true;
            break;
          }
        }

        if (changed) {
          await prisma.encounterParticipant.update({
            where: { id: previousParticipant.id },
            data: { conditions: JSON.stringify(updated) },
          });
        }
      }
    }

    // ── Auto death save on 0 HP (for the next participant whose turn it becomes) ──
    if (direction === 1) {
      const nextParticipant = encounter.participants[turnIndex];
      if (nextParticipant && nextParticipant.currentHp === 0) {
        const deathSaves = parseJson(nextParticipant.deathSaves, { successes: 0, failures: 0, isStable: false });
        if (!deathSaves.isStable) {
          // Auto-fail: at 0 HP, each turn start = 1 failed death save
          deathSaves.failures = Math.min(deathSaves.failures + 1, 3);
          await prisma.encounterParticipant.update({
            where: { id: nextParticipant.id },
            data: { deathSaves: JSON.stringify(deathSaves) },
          });
        }
      }
    }

    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { round, turnIndex },
    });
    await respondEncounter(req, res, encounter.id);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/encounters/:id/turn", { error: err.message });
    res.status(500).json({ error: "Failed to advance turn." });
  }
});

module.exports = router;
