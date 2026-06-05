// =============================================================================
// Tablecast — Database Seed Script
// Populates the database with sample data for development/testing.
//
// Usage:  node prisma/seed.js
// =============================================================================
"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Tablecast database…\n");

  // ── DM User ───────────────────────────────────────────────────────────────
  const dm = await prisma.user.upsert({
    where: { username: "DungeonMaster" },
    update: {},
    create: {
      username: "DungeonMaster",
      role: "DM",
    },
  });
  console.log(`  ✅ DM user:     ${dm.username} (id=${dm.id})`);

  // ── Player User ───────────────────────────────────────────────────────────
  const player = await prisma.user.upsert({
    where: { username: "Thorin" },
    update: {},
    create: {
      username: "Thorin",
      role: "PLAYER",
    },
  });
  console.log(`  ✅ Player user: ${player.username} (id=${player.id})`);

  // ── Player Character ──────────────────────────────────────────────────────
  // Check if the character already exists for idempotency
  const existingChar = await prisma.character.findFirst({
    where: { userId: player.id, name: "Thorin Ironforge" },
  });

  const character = existingChar
    ? existingChar
    : await prisma.character.create({
        data: {
          userId: player.id,
          name: "Thorin Ironforge",
          race: "Mountain Dwarf",
          class: "Fighter",
          level: 5,
          hp: 52,
          maxHp: 52,
          strength: 18,
          dexterity: 12,
          constitution: 16,
          intelligence: 10,
          wisdom: 13,
          charisma: 8,
          inventory: JSON.stringify([
            { name: "Battleaxe", quantity: 1, weight: 4 },
            { name: "Shield", quantity: 1, weight: 6 },
            { name: "Chain Mail", quantity: 1, weight: 55 },
            { name: "Healing Potion", quantity: 3, weight: 0.5 },
            { name: "Rope (50 ft)", quantity: 1, weight: 10 },
          ]),
          modifiers: JSON.stringify({
            strength: 4,
            dexterity: 1,
            constitution: 3,
            intelligence: 0,
            wisdom: 1,
            charisma: -1,
          }),
        },
      });
  console.log(`  ✅ Character:   ${character.name} (id=${character.id}, owner=${player.username})`);

  // ── DM Character (NPC template) ──────────────────────────────────────────
  const existingNpc = await prisma.character.findFirst({
    where: { userId: dm.id, name: "Aldric the Sage" },
  });

  const npc = existingNpc
    ? existingNpc
    : await prisma.character.create({
        data: {
          userId: dm.id,
          name: "Aldric the Sage",
          race: "High Elf",
          class: "Wizard",
          level: 12,
          hp: 66,
          maxHp: 66,
          strength: 8,
          dexterity: 14,
          constitution: 12,
          intelligence: 20,
          wisdom: 16,
          charisma: 13,
          inventory: JSON.stringify([
            { name: "Staff of Power", quantity: 1, weight: 4 },
            { name: "Spellbook", quantity: 1, weight: 3 },
          ]),
          modifiers: JSON.stringify({
            strength: -1,
            dexterity: 2,
            constitution: 1,
            intelligence: 5,
            wisdom: 3,
            charisma: 1,
          }),
        },
      });
  console.log(`  ✅ NPC:         ${npc.name} (id=${npc.id}, owner=${dm.username})`);

  // ── Wiki Articles ─────────────────────────────────────────────────────────
  const articles = [
    {
      title: "The City of Neverwinter",
      content:
        "## Overview\n\nNeverwinter is a metropolis on the Sword Coast, known as the **Jewel of the North**. " +
        "Despite suffering a cataclysmic eruption of Mount Hotenow decades ago, the city has been largely rebuilt " +
        "under the leadership of Lord Dagult Neverember.\n\n" +
        "## Key Locations\n\n" +
        "- **The Protector's Enclave** — The heart of the city, home to the Hall of Justice.\n" +
        "- **The Driftwood Tavern** — A popular adventurer's gathering spot near the docks.\n" +
        "- **Castle Never** — The ancient seat of power, partially ruined and rumoured to be haunted.\n",
      isVisibleToPlayers: true,
      tags: JSON.stringify(["Location", "City", "Sword Coast"]),
    },
    {
      title: "Lord Dagult Neverember",
      content:
        "## Background\n\n" +
        "Lord Dagult Neverember is the self-proclaimed **Lord Protector of Neverwinter** and the " +
        "former Open Lord of Waterdeep. A shrewd politician and capable administrator, his motives " +
        "are debated even among his allies.\n\n" +
        "## DM Notes (Hidden)\n\n" +
        "Neverember has been secretly siphoning city treasury funds. The party may discover " +
        "forged ledgers if they investigate the Hall of Justice basement.",
      isVisibleToPlayers: false,
      tags: JSON.stringify(["NPC", "Neverwinter", "Noble"]),
    },
    {
      title: "Session 1 — The Missing Caravan",
      content:
        "## Summary\n\n" +
        "The party was hired by merchant Halana Brightwood to investigate a missing trade caravan " +
        "on the Triboar Trail. They discovered goblin tracks leading north into the Neverwinter Wood.\n\n" +
        "## Loot Found\n\n" +
        "- 50 gold pieces\n- A damaged map fragment\n- A goblin chieftain's crude iron crown\n",
      isVisibleToPlayers: true,
      tags: JSON.stringify(["Session Notes", "Quest"]),
    },
  ];

  for (const data of articles) {
    const existing = await prisma.wikiArticle.findFirst({
      where: { title: data.title },
    });

    if (!existing) {
      const article = await prisma.wikiArticle.create({ data });
      console.log(
        `  ✅ Wiki:        "${article.title}" (id=${article.id}, visible=${article.isVisibleToPlayers})`
      );
    } else {
      console.log(`  ⏭️  Wiki:        "${existing.title}" already exists, skipping.`);
    }
  }

  console.log("\n🎲 Seeding complete!");
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
