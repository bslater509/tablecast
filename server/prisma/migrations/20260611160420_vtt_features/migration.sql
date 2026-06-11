-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_encounter_participants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "encounterId" INTEGER NOT NULL,
    "tokenId" INTEGER,
    "npcId" INTEGER,
    "characterId" INTEGER,
    "monsterId" INTEGER,
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
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "deathSaves" TEXT NOT NULL DEFAULT '{"successes":0,"failures":0,"isStable":false}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "encounter_participants_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "encounter_participants_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "encounter_participants_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "npcs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "encounter_participants_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "encounter_participants_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "monsters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_encounter_participants" ("ac", "characterId", "createdAt", "currentHp", "encounterId", "id", "imageUrl", "initiative", "isHidden", "maxHp", "monsterId", "name", "npcId", "sortOrder", "source", "stats", "tokenId", "updatedAt") SELECT "ac", "characterId", "createdAt", "currentHp", "encounterId", "id", "imageUrl", "initiative", "isHidden", "maxHp", "monsterId", "name", "npcId", "sortOrder", "source", "stats", "tokenId", "updatedAt" FROM "encounter_participants";
DROP TABLE "encounter_participants";
ALTER TABLE "new_encounter_participants" RENAME TO "encounter_participants";
CREATE INDEX "encounter_participants_encounterId_idx" ON "encounter_participants"("encounterId");
CREATE INDEX "encounter_participants_tokenId_idx" ON "encounter_participants"("tokenId");
CREATE INDEX "encounter_participants_npcId_idx" ON "encounter_participants"("npcId");
CREATE INDEX "encounter_participants_characterId_idx" ON "encounter_participants"("characterId");
CREATE INDEX "encounter_participants_monsterId_idx" ON "encounter_participants"("monsterId");
CREATE TABLE "new_maps" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 50,
    "gridType" TEXT NOT NULL DEFAULT 'SQUARE',
    "fogState" TEXT NOT NULL DEFAULT '[]',
    "walls" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_maps" ("createdAt", "fogState", "gridSize", "gridType", "id", "imageUrl", "name", "updatedAt") SELECT "createdAt", "fogState", "gridSize", "gridType", "id", "imageUrl", "name", "updatedAt" FROM "maps";
DROP TABLE "maps";
ALTER TABLE "new_maps" RENAME TO "maps";
CREATE TABLE "new_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mapId" INTEGER NOT NULL,
    "characterId" INTEGER,
    "npcId" INTEGER,
    "monsterId" INTEGER,
    "label" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "x" REAL NOT NULL DEFAULT 0,
    "y" REAL NOT NULL DEFAULT 0,
    "stats" TEXT,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "visionRadius" REAL NOT NULL DEFAULT 0,
    "darkvisionRadius" REAL NOT NULL DEFAULT 0,
    "auraRadius" REAL NOT NULL DEFAULT 0,
    "auraColor" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tokens_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tokens_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tokens_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "npcs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tokens_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "monsters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tokens" ("characterId", "createdAt", "id", "imageUrl", "label", "mapId", "monsterId", "npcId", "stats", "updatedAt", "x", "y") SELECT "characterId", "createdAt", "id", "imageUrl", "label", "mapId", "monsterId", "npcId", "stats", "updatedAt", "x", "y" FROM "tokens";
DROP TABLE "tokens";
ALTER TABLE "new_tokens" RENAME TO "tokens";
CREATE INDEX "tokens_mapId_idx" ON "tokens"("mapId");
CREATE INDEX "tokens_characterId_idx" ON "tokens"("characterId");
CREATE INDEX "tokens_npcId_idx" ON "tokens"("npcId");
CREATE INDEX "tokens_monsterId_idx" ON "tokens"("monsterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
