// =============================================================================
// Tablecast MCP — Character Tool Handlers
// =============================================================================
"use strict";

async function handleListCharacters(args, { prisma }) {
  const filter = {};
  if (typeof args.userId === "number") {
    filter.userId = args.userId;
  }
  const characters = await prisma.character.findMany({
    where: filter,
    orderBy: { id: "asc" },
  });

  // Parse JSON fields back to standard JSON types for tool response formatting
  const parsed = characters.map((c) => ({
    ...c,
    inventory: JSON.parse(c.inventory || "[]"),
    modifiers: JSON.parse(c.modifiers || "{}"),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

async function handleCreateCharacter(args, { prisma, generateModifiers }) {
  const { userId, name: charName, race, class: cls, level, hp, maxHp, ...rest } = args;

  // userId is optional - if provided, verify the user exists
  if (userId) {
    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (!owner) {
      throw new Error(`User with ID ${userId} does not exist.`);
    }
  }

  // Extract base stats
  const strength = rest.strength ?? 10;
  const dexterity = rest.dexterity ?? 10;
  const constitution = rest.constitution ?? 10;
  const intelligence = rest.intelligence ?? 10;
  const wisdom = rest.wisdom ?? 10;
  const charisma = rest.charisma ?? 10;

  // Modifiers auto-calculation or manual override
  const computedMods = rest.modifiers || generateModifiers({
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
  });

  const inventoryStr = JSON.stringify(args.inventory || []);
  const modifiersStr = JSON.stringify(computedMods);

  const characterData = {
    name: charName,
    race: race || "",
    class: cls || "",
    level: level || 1,
    hp: hp ?? 10,
    maxHp: maxHp ?? 10,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    inventory: inventoryStr,
    modifiers: modifiersStr,
  };
  if (userId) characterData.userId = userId;

  const character = await prisma.character.create({
    data: characterData,
  });

  const parsed = {
    ...character,
    inventory: JSON.parse(character.inventory),
    modifiers: JSON.parse(character.modifiers),
  };

  return {
    content: [
      { type: "text", text: `Character created successfully:\n${JSON.stringify(parsed, null, 2)}` },
    ],
  };
}

async function handleUpdateCharacter(args, { prisma, generateModifiers }) {
  const { id, name: charName, race, class: cls, level, hp, maxHp, inventory, modifiers, ...statsUpdate } = args;

  // Load existing character to handle stat merging and modifier calculation
  const existing = await prisma.character.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Character with ID ${id} not found.`);
  }

  const dataUpdate = {};

  if (charName !== undefined) dataUpdate.name = charName;
  if (race !== undefined) dataUpdate.race = race;
  if (cls !== undefined) dataUpdate.class = cls;
  if (level !== undefined) dataUpdate.level = level;
  if (hp !== undefined) dataUpdate.hp = hp;
  if (maxHp !== undefined) dataUpdate.maxHp = maxHp;

  // Merge stats if updated
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

  if (modifiers !== undefined) {
    dataUpdate.modifiers = JSON.stringify(modifiers);
  } else if (statsChanged) {
    // If stats changed and no custom modifiers override was passed, recalculate modifiers
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

  const updated = await prisma.character.update({
    where: { id },
    data: dataUpdate,
  });

  const parsed = {
    ...updated,
    inventory: JSON.parse(updated.inventory),
    modifiers: JSON.parse(updated.modifiers),
  };

  return {
    content: [
      { type: "text", text: `Character updated successfully:\n${JSON.stringify(parsed, null, 2)}` },
    ],
  };
}

async function handleDeleteCharacter(args, { prisma }) {
  const { id } = args;
  await prisma.character.delete({ where: { id } });
  return {
    content: [{ type: "text", text: `Character with ID ${id} deleted successfully.` }],
  };
}

async function handleAddItemToCharacter(args, { prisma }) {
  const { characterId, name: itemName, quantity, weight } = args;

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) {
    throw new Error(`Character with ID ${characterId} not found.`);
  }

  let inv = [];
  try {
    inv = JSON.parse(character.inventory || "[]");
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

  const updated = await prisma.character.update({
    where: { id: characterId },
    data: { inventory: JSON.stringify(inv) },
  });

  return {
    content: [{ type: "text", text: `Item '${itemName}' successfully added to character '${character.name}'. New inventory:\n${JSON.stringify(inv, null, 2)}` }],
  };
}

module.exports = {
  handleListCharacters,
  handleCreateCharacter,
  handleUpdateCharacter,
  handleDeleteCharacter,
  handleAddItemToCharacter,
};
