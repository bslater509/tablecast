-- CreateTable
CREATE TABLE "quests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "objectives" TEXT NOT NULL DEFAULT '[]',
    "rewards" TEXT NOT NULL DEFAULT '{}',
    "questGiverNpcId" INTEGER,
    "parentQuestId" INTEGER,
    "assignedToCharacterIds" TEXT NOT NULL DEFAULT '[]',
    "isVisibleToPlayers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "quests_questGiverNpcId_fkey" FOREIGN KEY ("questGiverNpcId") REFERENCES "npcs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "quests_parentQuestId_fkey" FOREIGN KEY ("parentQuestId") REFERENCES "quests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "handouts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "targetCharacterIds" TEXT NOT NULL DEFAULT '[]',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdByDmId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "handouts_createdByDmId_fkey" FOREIGN KEY ("createdByDmId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "dialogueTree" TEXT NOT NULL DEFAULT '{}',
    "voice" TEXT NOT NULL DEFAULT '',
    "voicePitch" REAL NOT NULL DEFAULT 1.0,
    "voiceRate" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_npcs" ("ac", "actions", "alignment", "appearance", "charisma", "class", "constitution", "cr", "createdAt", "description", "dexterity", "history", "hp", "id", "imageUrl", "intelligence", "inventory", "isVisibleToPlayers", "largeImageUrl", "level", "maxHp", "modifiers", "name", "partyRelationship", "personality", "race", "strength", "updatedAt", "wisdom") SELECT "ac", "actions", "alignment", "appearance", "charisma", "class", "constitution", "cr", "createdAt", "description", "dexterity", "history", "hp", "id", "imageUrl", "intelligence", "inventory", "isVisibleToPlayers", "largeImageUrl", "level", "maxHp", "modifiers", "name", "partyRelationship", "personality", "race", "strength", "updatedAt", "wisdom" FROM "npcs";
DROP TABLE "npcs";
ALTER TABLE "new_npcs" RENAME TO "npcs";
CREATE INDEX "npcs_name_idx" ON "npcs"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "quests_status_idx" ON "quests"("status");

-- CreateIndex
CREATE INDEX "quests_questGiverNpcId_idx" ON "quests"("questGiverNpcId");

-- CreateIndex
CREATE INDEX "quests_parentQuestId_idx" ON "quests"("parentQuestId");

-- CreateIndex
CREATE INDEX "handouts_createdByDmId_idx" ON "handouts"("createdByDmId");
