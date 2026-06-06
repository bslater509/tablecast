-- CreateTable
CREATE TABLE "encounters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "mapId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "round" INTEGER NOT NULL DEFAULT 1,
    "turnIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "encounters_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "encounter_participants" (
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
