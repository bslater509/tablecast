-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_npcs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL DEFAULT '',
    "class" TEXT NOT NULL DEFAULT '',
    "level" INTEGER NOT NULL DEFAULT 1,
    "hp" INTEGER NOT NULL DEFAULT 10,
    "maxHp" INTEGER NOT NULL DEFAULT 10,
    "ac" INTEGER NOT NULL DEFAULT 10,
    "cr" TEXT NOT NULL DEFAULT '0',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "largeImageUrl" TEXT NOT NULL DEFAULT '',
    "strength" INTEGER NOT NULL DEFAULT 10,
    "dexterity" INTEGER NOT NULL DEFAULT 10,
    "constitution" INTEGER NOT NULL DEFAULT 10,
    "intelligence" INTEGER NOT NULL DEFAULT 10,
    "wisdom" INTEGER NOT NULL DEFAULT 10,
    "charisma" INTEGER NOT NULL DEFAULT 10,
    "inventory" TEXT NOT NULL DEFAULT '[]',
    "modifiers" TEXT NOT NULL DEFAULT '{}',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL DEFAULT '',
    "alignment" TEXT NOT NULL DEFAULT '',
    "appearance" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "history" TEXT NOT NULL DEFAULT '',
    "partyRelationship" TEXT NOT NULL DEFAULT '',
    "isVisibleToPlayers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_npcs" ("ac", "actions", "alignment", "appearance", "charisma", "class", "constitution", "cr", "createdAt", "description", "dexterity", "history", "hp", "id", "imageUrl", "intelligence", "inventory", "isVisibleToPlayers", "level", "maxHp", "modifiers", "name", "partyRelationship", "personality", "race", "strength", "updatedAt", "wisdom") SELECT "ac", "actions", "alignment", "appearance", "charisma", "class", "constitution", "cr", "createdAt", "description", "dexterity", "history", "hp", "id", "imageUrl", "intelligence", "inventory", "isVisibleToPlayers", "level", "maxHp", "modifiers", "name", "partyRelationship", "personality", "race", "strength", "updatedAt", "wisdom" FROM "npcs";
DROP TABLE "npcs";
ALTER TABLE "new_npcs" RENAME TO "npcs";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
