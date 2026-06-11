// =============================================================================
// Tablecast MCP — Monster Tool Handlers
// =============================================================================
"use strict";

async function handleListMonsters(args, { prisma, parseJsonArray, parseJsonObject }) {
  const filter = {};
  if (args.name) {
    filter.name = { contains: args.name };
  }

  const monsters = await prisma.monster.findMany({
    where: filter,
    orderBy: { id: "asc" },
  });

  const parsed = monsters.map((monster) => ({
    ...monster,
    inventory: parseJsonArray(monster.inventory),
    modifiers: parseJsonObject(monster.modifiers),
    actions: parseJsonArray(monster.actions),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

async function handleCreateMonster(args, { prisma, generateModifiers, toJsonArrayString, toJsonObjectString, parseJsonArray, parseJsonObject }) {
  const {
    name: monsterName,
    race,
    class: cls,
    level,
    hp,
    maxHp,
    ac,
    cr,
    imageUrl,
    largeImageUrl,
    description,
    alignment,
    appearance,
    personality,
    history,
    partyRelationship,
    isVisibleToPlayers,
    ...rest
  } = args;

  if (!monsterName || typeof monsterName !== "string" || !monsterName.trim()) {
    throw new Error("Monster name is required.");
  }

  const strength = rest.strength ?? 10;
  const dexterity = rest.dexterity ?? 10;
  const constitution = rest.constitution ?? 10;
  const intelligence = rest.intelligence ?? 10;
  const wisdom = rest.wisdom ?? 10;
  const charisma = rest.charisma ?? 10;

  const computedMods = rest.modifiers || generateModifiers({
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
  });

  const monster = await prisma.monster.create({
    data: {
      name: monsterName.trim(),
      race: race || "",
      class: cls || "",
      level: level || 1,
      hp: hp ?? 10,
      maxHp: maxHp ?? 10,
      ac: ac ?? 10,
      cr: cr || "0",
      imageUrl: imageUrl || "",
      largeImageUrl: largeImageUrl || "",
      strength,
      dexterity,
      constitution,
      intelligence,
      wisdom,
      charisma,
      inventory: toJsonArrayString(args.inventory, "inventory", []),
      modifiers: toJsonObjectString(computedMods, "modifiers", {}),
      actions: toJsonArrayString(args.actions, "actions", []),
      description: description || "",
      alignment: alignment || "",
      appearance: appearance || "",
      personality: personality || "",
      history: history || "",
      partyRelationship: partyRelationship || "",
      isVisibleToPlayers: isVisibleToPlayers ?? false,
    },
  });

  const parsed = {
    ...monster,
    inventory: parseJsonArray(monster.inventory),
    modifiers: parseJsonObject(monster.modifiers),
    actions: parseJsonArray(monster.actions),
  };

  return {
    content: [{ type: "text", text: `Monster created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleUpdateMonster(args, { prisma, generateModifiers, toJsonArrayString, toJsonObjectString, parseJsonArray, parseJsonObject }) {
  const {
    id,
    name: monsterName,
    race,
    class: cls,
    level,
    hp,
    maxHp,
    ac,
    cr,
    imageUrl,
    largeImageUrl,
    inventory,
    modifiers,
    actions,
    description,
    alignment,
    appearance,
    personality,
    history,
    partyRelationship,
    isVisibleToPlayers,
    ...statsUpdate
  } = args;

  const monsterId = Number(id);
  if (!Number.isInteger(monsterId) || monsterId <= 0) {
    throw new Error("Monster id must be a valid positive number.");
  }

  const existing = await prisma.monster.findUnique({ where: { id: monsterId } });
  if (!existing) {
    throw new Error(`Monster with ID ${monsterId} not found.`);
  }

  const dataUpdate = {};
  if (monsterName !== undefined) dataUpdate.name = monsterName;
  if (race !== undefined) dataUpdate.race = race;
  if (cls !== undefined) dataUpdate.class = cls;
  if (level !== undefined) dataUpdate.level = level;
  if (hp !== undefined) dataUpdate.hp = hp;
  if (maxHp !== undefined) dataUpdate.maxHp = maxHp;
  if (ac !== undefined) dataUpdate.ac = ac;
  if (cr !== undefined) dataUpdate.cr = cr;
  if (imageUrl !== undefined) dataUpdate.imageUrl = imageUrl;
  if (largeImageUrl !== undefined) dataUpdate.largeImageUrl = largeImageUrl;
  if (description !== undefined) dataUpdate.description = description;
  if (alignment !== undefined) dataUpdate.alignment = alignment;
  if (appearance !== undefined) dataUpdate.appearance = appearance;
  if (personality !== undefined) dataUpdate.personality = personality;
  if (history !== undefined) dataUpdate.history = history;
  if (partyRelationship !== undefined) dataUpdate.partyRelationship = partyRelationship;
  if (isVisibleToPlayers !== undefined) dataUpdate.isVisibleToPlayers = isVisibleToPlayers;

  let statsChanged = false;
  const statKeys = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
  for (const key of statKeys) {
    if (statsUpdate[key] !== undefined) {
      dataUpdate[key] = statsUpdate[key];
      statsChanged = true;
    }
  }

  if (inventory !== undefined) {
    dataUpdate.inventory = toJsonArrayString(inventory, "inventory", []);
  }
  if (actions !== undefined) {
    dataUpdate.actions = toJsonArrayString(actions, "actions", []);
  }

  if (modifiers !== undefined) {
    dataUpdate.modifiers = toJsonObjectString(modifiers, "modifiers", {});
  } else if (statsChanged) {
    const strength = statsUpdate.strength ?? existing.strength;
    const dexterity = statsUpdate.dexterity ?? existing.dexterity;
    const constitution = statsUpdate.constitution ?? existing.constitution;
    const intelligence = statsUpdate.intelligence ?? existing.intelligence;
    const wisdom = statsUpdate.wisdom ?? existing.wisdom;
    const charisma = statsUpdate.charisma ?? existing.charisma;

    dataUpdate.modifiers = JSON.stringify(generateModifiers({
      strength,
      dexterity,
      constitution,
      intelligence,
      wisdom,
      charisma,
    }));
  }

  if (Object.keys(dataUpdate).length === 0) {
    throw new Error("No valid monster fields provided to update.");
  }

  const updated = await prisma.monster.update({
    where: { id: monsterId },
    data: dataUpdate,
  });

  const parsed = {
    ...updated,
    inventory: parseJsonArray(updated.inventory),
    modifiers: parseJsonObject(updated.modifiers),
    actions: parseJsonArray(updated.actions),
  };

  return {
    content: [{ type: "text", text: `Monster updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleDeleteMonster(args, { prisma }) {
  const { id } = args;
  const monsterId = Number(id);
  if (!Number.isInteger(monsterId) || monsterId <= 0) {
    throw new Error("Monster id must be a valid positive number.");
  }
  await prisma.monster.delete({ where: { id: monsterId } });
  return {
    content: [{ type: "text", text: `Monster with ID ${monsterId} deleted successfully.` }],
  };
}

module.exports = {
  handleListMonsters,
  handleCreateMonster,
  handleUpdateMonster,
  handleDeleteMonster,
};
