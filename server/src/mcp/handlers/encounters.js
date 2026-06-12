// =============================================================================
// Tablecast MCP — Encounter Tool Handlers
// =============================================================================
"use strict";

async function handleListEncounters(args, { prisma, parseJsonObject, VALID_ENCOUNTER_STATUSES }) {
  const filter = {};
  if (args.mapId !== undefined) {
    const parsedMapId = Number(args.mapId);
    if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
      throw new Error("mapId must be a valid positive number.");
    }
    filter.mapId = parsedMapId;
  }
  if (args.status !== undefined) {
    const status = String(args.status).toUpperCase();
    if (!VALID_ENCOUNTER_STATUSES.has(status)) {
      throw new Error("Encounter status must be DRAFT, ACTIVE, or COMPLETE.");
    }
    filter.status = status;
  }

  const encounters = await prisma.encounter.findMany({
    where: filter,
    include: {
      participants: {
        orderBy: [{ initiative: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: { id: "asc" },
  });

  const parsed = encounters.map((encounter) => ({
    ...encounter,
    participants: encounter.participants.map((participant) => ({
      ...participant,
      stats: parseJsonObject(participant.stats),
    })),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

async function handleCreateEncounter(args, { prisma, VALID_ENCOUNTER_STATUSES }) {
  const { name, mapId, status } = args;

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Encounter name is required.");
  }

  const parsedMapId = Number(mapId);
  if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
    throw new Error("mapId must be a valid positive number.");
  }

  const map = await prisma.map.findUnique({ where: { id: parsedMapId } });
  if (!map) {
    throw new Error(`Map with ID ${parsedMapId} does not exist.`);
  }

  const nextStatus = status ? String(status).toUpperCase() : "DRAFT";
  if (!VALID_ENCOUNTER_STATUSES.has(nextStatus)) {
    throw new Error("Encounter status must be DRAFT, ACTIVE, or COMPLETE.");
  }

  const encounter = await prisma.encounter.create({
    data: {
      name: name.trim(),
      mapId: parsedMapId,
      status: nextStatus,
      round: 1,
      turnIndex: 0,
    },
    include: {
      participants: true,
    },
  });

  const parsed = {
    ...encounter,
    participants: [],
  };

  return {
    content: [{ type: "text", text: `Encounter created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleUpdateEncounter(args, { prisma, parseJsonObject, VALID_ENCOUNTER_STATUSES }) {
  const { id, name, status, round, turnIndex } = args;

  const encounterId = Number(id);
  if (!Number.isInteger(encounterId) || encounterId <= 0) {
    throw new Error("Encounter id must be a valid positive number.");
  }

  const existing = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (!existing) {
    throw new Error(`Encounter with ID ${encounterId} not found.`);
  }

  const dataUpdate = {};
  if (name !== undefined) {
    if (!String(name || "").trim()) {
      throw new Error("Encounter name must be a non-empty string.");
    }
    dataUpdate.name = String(name).trim();
  }
  if (status !== undefined) {
    const nextStatus = String(status).toUpperCase();
    if (!VALID_ENCOUNTER_STATUSES.has(nextStatus)) {
      throw new Error("Encounter status must be DRAFT, ACTIVE, or COMPLETE.");
    }
    dataUpdate.status = nextStatus;
  }
  if (round !== undefined) {
    const parsedRound = Number(round);
    if (!Number.isInteger(parsedRound) || parsedRound < 1) {
      throw new Error("round must be a positive integer.");
    }
    dataUpdate.round = parsedRound;
  }
  if (turnIndex !== undefined) {
    const parsedTurnIndex = Number(turnIndex);
    if (!Number.isInteger(parsedTurnIndex) || parsedTurnIndex < 0) {
      throw new Error("turnIndex must be a non-negative integer.");
    }
    dataUpdate.turnIndex = parsedTurnIndex;
  }

  if (Object.keys(dataUpdate).length === 0) {
    throw new Error("No valid encounter fields provided to update.");
  }

  const updated = await prisma.encounter.update({
    where: { id: encounterId },
    data: dataUpdate,
    include: {
      participants: {
        orderBy: [{ initiative: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });

  const parsed = {
    ...updated,
    participants: updated.participants.map((participant) => ({
      ...participant,
      stats: parseJsonObject(participant.stats),
    })),
  };

  return {
    content: [{ type: "text", text: `Encounter updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
async function handleAddEncounterParticipant(args, { prisma, parseJsonObject, logError }) {
  const {
    encounterId,
    name,
    npcId,
    characterId,
    monsterId,
    currentHp,
    maxHp,
    ac,
    isHidden,
    initiative,
  } = args;

  const parsedEncounterId = Number(encounterId);
  if (!Number.isInteger(parsedEncounterId) || parsedEncounterId <= 0) {
    throw new Error("encounterId must be a valid positive number.");
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Participant name is required.");
  }

  const encounter = await prisma.encounter.findUnique({ where: { id: parsedEncounterId } });
  if (!encounter) {
    throw new Error(`Encounter with ID ${parsedEncounterId} not found.`);
  }

  const linkedIds = [npcId, characterId, monsterId].filter((value) => value !== undefined && value !== null && value !== "");
  if (linkedIds.length > 1) {
    throw new Error("Only one of npcId, characterId, or monsterId may be provided.");
  }

  let source = "";
  let imageUrl = "";
  if (npcId !== undefined && npcId !== null && npcId !== "") {
    const parsedNpcId = Number(npcId);
    if (!Number.isInteger(parsedNpcId) || parsedNpcId <= 0) throw new Error("npcId must be a valid positive number.");
    const npc = await prisma.npc.findUnique({ where: { id: parsedNpcId } });
    if (!npc) throw new Error(`NPC with ID ${parsedNpcId} not found.`);
    source = "NPC";
    imageUrl = npc.imageUrl || "";
  } else if (characterId !== undefined && characterId !== null && characterId !== "") {
    const parsedCharacterId = Number(characterId);
    if (!Number.isInteger(parsedCharacterId) || parsedCharacterId <= 0) throw new Error("characterId must be a valid positive number.");
    const character = await prisma.character.findUnique({ where: { id: parsedCharacterId } });
    if (!character) throw new Error(`Character with ID ${parsedCharacterId} not found.`);
    source = "CHARACTER";
  } else if (monsterId !== undefined && monsterId !== null && monsterId !== "") {
    const parsedMonsterId = Number(monsterId);
    if (!Number.isInteger(parsedMonsterId) || parsedMonsterId <= 0) throw new Error("monsterId must be a valid positive number.");
    const monster = await prisma.monster.findUnique({ where: { id: parsedMonsterId } });
    if (!monster) throw new Error(`Monster with ID ${parsedMonsterId} not found.`);
    source = "MONSTER";
    imageUrl = monster.imageUrl || "";
  }

  const sortOrder = await prisma.encounterParticipant.count({ where: { encounterId: parsedEncounterId } });

  const participant = await prisma.encounterParticipant.create({
    data: {
      encounterId: parsedEncounterId,
      name: name.trim(),
      npcId: npcId !== undefined && npcId !== null && npcId !== "" ? Number(npcId) : null,
      characterId: characterId !== undefined && characterId !== null && characterId !== "" ? Number(characterId) : null,
      monsterId: monsterId !== undefined && monsterId !== null && monsterId !== "" ? Number(monsterId) : null,
      currentHp: currentHp ?? 1,
      maxHp: maxHp ?? 1,
      ac: ac ?? 10,
      isHidden: isHidden ?? false,
      initiative: initiative ?? 0,
      sortOrder,
      source,
      imageUrl,
      stats: JSON.stringify({
        currentHp: currentHp ?? 1,
        maxHp: maxHp ?? 1,
        ac: ac ?? 10,
        initiative: initiative ?? 0,
        isHidden: isHidden ?? false,
        source,
        npcId: npcId !== undefined && npcId !== null && npcId !== "" ? Number(npcId) : null,
        characterId: characterId !== undefined && characterId !== null && characterId !== "" ? Number(characterId) : null,
        monsterId: monsterId !== undefined && monsterId !== null && monsterId !== "" ? Number(monsterId) : null,
      }),
    },
  });

  const parsed = {
    ...participant,
    stats: parseJsonObject(participant.stats),
  };

  return {
    content: [{ type: "text", text: `Encounter participant created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
async function handleUpdateEncounterParticipant(args, { prisma, parseJsonObject, logError }) {
  const { id, name, currentHp, maxHp, ac, isHidden, initiative } = args;

  const participantId = Number(id);
  if (!Number.isInteger(participantId) || participantId <= 0) {
    throw new Error("Participant id must be a valid positive number.");
  }

  const existing = await prisma.encounterParticipant.findUnique({
    where: { id: participantId },
    include: { token: true, npc: true, character: true, monster: true },
  });
  if (!existing) {
    throw new Error(`Encounter participant with ID ${participantId} not found.`);
  }

  const dataUpdate = {};
  if (name !== undefined) {
    if (!String(name || "").trim()) {
      throw new Error("Participant name must be a non-empty string.");
    }
    dataUpdate.name = String(name).trim();
  }
  if (currentHp !== undefined) dataUpdate.currentHp = currentHp;
  if (maxHp !== undefined) dataUpdate.maxHp = maxHp;
  if (ac !== undefined) dataUpdate.ac = ac;
  if (isHidden !== undefined) dataUpdate.isHidden = isHidden;
  if (initiative !== undefined) dataUpdate.initiative = initiative;

  if (Object.keys(dataUpdate).length === 0) {
    throw new Error("No valid participant fields provided to update.");
  }

  const stats = parseJsonObject(existing.stats);
  if (currentHp !== undefined) stats.currentHp = currentHp;
  if (maxHp !== undefined) stats.maxHp = maxHp;
  if (ac !== undefined) stats.ac = ac;
  if (isHidden !== undefined) stats.isHidden = isHidden;
  if (initiative !== undefined) stats.initiative = initiative;
  dataUpdate.stats = JSON.stringify(stats);

  const updated = await prisma.encounterParticipant.update({
    where: { id: participantId },
    data: dataUpdate,
  });

  if (currentHp !== undefined) {
    if (existing.npcId) {
      await prisma.npc.update({ where: { id: existing.npcId }, data: { hp: currentHp } }).catch(() => null);
    }
    if (existing.characterId) {
      await prisma.character.update({ where: { id: existing.characterId }, data: { hp: currentHp } }).catch(() => null);
    }
    if (existing.monsterId) {
      await prisma.monster.update({ where: { id: existing.monsterId }, data: { hp: currentHp } }).catch(() => null);
    }
    if (existing.tokenId) {
      const tokenStats = parseJsonObject(existing.token?.stats);
      await prisma.token.update({
        where: { id: existing.tokenId },
        data: {
          stats: JSON.stringify({
            ...tokenStats,
            currentHp,
            maxHp: maxHp ?? updated.maxHp,
            ac: ac ?? updated.ac,
          }),
        },
      }).catch(() => null);
    }
  }

  const parsed = {
    ...updated,
    stats: parseJsonObject(updated.stats),
  };

  return {
    content: [{ type: "text", text: `Encounter participant updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

module.exports = {
  handleListEncounters,
  handleCreateEncounter,
  handleUpdateEncounter,
  handleAddEncounterParticipant,
  handleUpdateEncounterParticipant,
};
