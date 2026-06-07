-- CreateTable
CREATE TABLE "game_sessions" (
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
    "updatedAt" DATETIME NOT NULL
);
