-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_game_sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "sessionNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "scheduledFor" DATETIME,
    "agenda" TEXT NOT NULL DEFAULT '',
    "prepChecklist" TEXT NOT NULL DEFAULT '[]',
    "recap" TEXT NOT NULL DEFAULT '',
    "wikiLogId" INTEGER,
    "linkedWikiIds" TEXT NOT NULL DEFAULT '[]',
    "linkedMapIds" TEXT NOT NULL DEFAULT '[]',
    "linkedEncounterIds" TEXT NOT NULL DEFAULT '[]',
    "isVisibleToPlayers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "game_sessions_wikiLogId_fkey" FOREIGN KEY ("wikiLogId") REFERENCES "wiki_articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_game_sessions" ("agenda", "createdAt", "id", "isVisibleToPlayers", "linkedEncounterIds", "linkedMapIds", "linkedWikiIds", "prepChecklist", "recap", "scheduledFor", "sessionNumber", "status", "title", "updatedAt", "wikiLogId") SELECT "agenda", "createdAt", "id", "isVisibleToPlayers", "linkedEncounterIds", "linkedMapIds", "linkedWikiIds", "prepChecklist", "recap", "scheduledFor", "sessionNumber", "status", "title", "updatedAt", "wikiLogId" FROM "game_sessions";
DROP TABLE "game_sessions";
ALTER TABLE "new_game_sessions" RENAME TO "game_sessions";
CREATE INDEX "game_sessions_status_idx" ON "game_sessions"("status");
CREATE INDEX "game_sessions_scheduledFor_idx" ON "game_sessions"("scheduledFor");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "encounter_participants_tokenId_idx" ON "encounter_participants"("tokenId");

-- CreateIndex
CREATE INDEX "encounter_participants_npcId_idx" ON "encounter_participants"("npcId");

-- CreateIndex
CREATE INDEX "encounter_participants_characterId_idx" ON "encounter_participants"("characterId");

-- CreateIndex
CREATE INDEX "encounter_participants_monsterId_idx" ON "encounter_participants"("monsterId");

-- CreateIndex
CREATE INDEX "monsters_name_idx" ON "monsters"("name");

-- CreateIndex
CREATE INDEX "npcs_name_idx" ON "npcs"("name");

-- CreateIndex
CREATE INDEX "rolls_createdAt_idx" ON "rolls"("createdAt");

-- CreateIndex
CREATE INDEX "tokens_characterId_idx" ON "tokens"("characterId");

-- CreateIndex
CREATE INDEX "tokens_npcId_idx" ON "tokens"("npcId");

-- CreateIndex
CREATE INDEX "tokens_monsterId_idx" ON "tokens"("monsterId");
