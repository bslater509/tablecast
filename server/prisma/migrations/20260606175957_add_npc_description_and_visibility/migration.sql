-- CreateTable
CREATE TABLE "npcs" (
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
    "isVisibleToPlayers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_encounter_participants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "encounterId" INTEGER NOT NULL,
    "tokenId" INTEGER,
    "npcId" INTEGER,
    "characterId" INTEGER,
    "name" TEXT NOT NULL,
    "initiative" INTEGER NOT NULL DEFAULT 0,
    "currentHp" INTEGER NOT NULL DEFAULT 1,
    "maxHp" INTEGER NOT NULL DEFAULT 1,
    "ac" INTEGER NOT NULL DEFAULT 10,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "stats" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "encounter_participants_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "encounter_participants_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "encounter_participants_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "npcs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "encounter_participants_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_encounter_participants" ("ac", "characterId", "createdAt", "currentHp", "encounterId", "id", "imageUrl", "initiative", "isHidden", "maxHp", "name", "npcId", "sortOrder", "source", "stats", "tokenId", "updatedAt") SELECT "ac", "characterId", "createdAt", "currentHp", "encounterId", "id", "imageUrl", "initiative", "isHidden", "maxHp", "name", "npcId", "sortOrder", "source", "stats", "tokenId", "updatedAt" FROM "encounter_participants";
DROP TABLE "encounter_participants";
ALTER TABLE "new_encounter_participants" RENAME TO "encounter_participants";
CREATE TABLE "new_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mapId" INTEGER NOT NULL,
    "characterId" INTEGER,
    "npcId" INTEGER,
    "label" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "x" REAL NOT NULL DEFAULT 0,
    "y" REAL NOT NULL DEFAULT 0,
    "stats" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tokens_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tokens_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tokens_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "npcs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tokens" ("characterId", "createdAt", "id", "imageUrl", "label", "mapId", "stats", "updatedAt", "x", "y") SELECT "characterId", "createdAt", "id", "imageUrl", "label", "mapId", "stats", "updatedAt", "x", "y" FROM "tokens";
DROP TABLE "tokens";
ALTER TABLE "new_tokens" RENAME TO "tokens";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
