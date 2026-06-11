// =============================================================================
// Tablecast MCP — NPC Tool Handlers
// =============================================================================
"use strict";

async function handleListNpcs(args, { prisma }) {
  const filter = {};
  if (args.name) {
    filter.name = { contains: args.name };
  }
  const npcs = await prisma.npc.findMany({
    where: filter,
    orderBy: { id: "asc" },
  });

  const parsed = npcs.map((n) => ({
    ...n,
    inventory: JSON.parse(n.inventory || "[]"),
    modifiers: JSON.parse(n.modifiers || "{}"),
    actions: JSON.parse(n.actions || "[]"),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

async function handleCreateNpc(args, { prisma, generateModifiers }) {
  const {
    name: npcName,
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

  const inventoryStr = JSON.stringify(args.inventory || []);
  const actionsStr = JSON.stringify(args.actions || []);
  const modifiersStr = JSON.stringify(computedMods);

  const npc = await prisma.npc.create({
    data: {
      name: npcName,
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
      inventory: inventoryStr,
      actions: actionsStr,
      modifiers: modifiersStr,
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
    ...npc,
    inventory: JSON.parse(npc.inventory),
    actions: JSON.parse(npc.actions),
    modifiers: JSON.parse(npc.modifiers),
  };

  return {
    content: [{ type: "text", text: `NPC created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleUpdateNpc(args, { prisma, generateModifiers }) {
  const {
    id,
    name: npcName,
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
    actions,
    modifiers,
    description,
    alignment,
    appearance,
    personality,
    history,
    partyRelationship,
    isVisibleToPlayers,
    ...statsUpdate
  } = args;

  const existing = await prisma.npc.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`NPC with ID ${id} not found.`);
  }

  const dataUpdate = {};
  if (npcName !== undefined) dataUpdate.name = npcName;
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
    dataUpdate.inventory = JSON.stringify(inventory);
  }
  if (actions !== undefined) {
    dataUpdate.actions = JSON.stringify(actions);
  }

  if (modifiers !== undefined) {
    dataUpdate.modifiers = JSON.stringify(modifiers);
  } else if (statsChanged) {
    const strength = statsUpdate.strength ?? existing.strength;
    const dexterity = statsUpdate.dexterity ?? existing.dexterity;
    const constitution = statsUpdate.constitution ?? existing.constitution;
    const intelligence = statsUpdate.intelligence ?? existing.intelligence;
    const wisdom = statsUpdate.wisdom ?? existing.wisdom;
    const charisma = statsUpdate.charisma ?? existing.charisma;

    const recomputed = generateModifiers({
      strength,
      dexterity,
      constitution,
      intelligence,
      wisdom,
      charisma,
    });
    dataUpdate.modifiers = JSON.stringify(recomputed);
  }

  const updated = await prisma.npc.update({
    where: { id },
    data: dataUpdate,
  });

  const parsed = {
    ...updated,
    inventory: JSON.parse(updated.inventory),
    actions: JSON.parse(updated.actions),
    modifiers: JSON.parse(updated.modifiers),
  };

  return {
    content: [{ type: "text", text: `NPC updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleDeleteNpc(args, { prisma }) {
  const { id } = args;
  await prisma.npc.delete({ where: { id } });
  return {
    content: [{ type: "text", text: `NPC template with ID ${id} deleted successfully.` }],
  };
}

async function handleAddItemToNpc(args, { prisma }) {
  const { npcId, name: itemName, quantity, weight } = args;

  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  if (!npc) {
    throw new Error(`NPC template with ID ${npcId} not found.`);
  }

  let inv = [];
  try {
    inv = JSON.parse(npc.inventory || "[]");
  } catch (e) {
    inv = [];
  }

  const existingItem = inv.find((i) => i && i.name && i.name.toLowerCase() === itemName.toLowerCase());
  const qtyToAdd = quantity ?? 1;

  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 1) + qtyToAdd;
  } else {
    inv.push({
      name: itemName,
      quantity: qtyToAdd,
      weight: weight ?? 0,
    });
  }

  await prisma.npc.update({
    where: { id: npcId },
    data: { inventory: JSON.stringify(inv) },
  });

  return {
    content: [{ type: "text", text: `Item '${itemName}' successfully added to NPC template '${npc.name}'. New inventory:\n${JSON.stringify(inv, null, 2)}` }],
  };
}

module.exports = {
  handleListNpcs,
  handleCreateNpc,
  handleUpdateNpc,
  handleDeleteNpc,
  handleAddItemToNpc,
};
