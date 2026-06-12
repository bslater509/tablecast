-- CreateTable
CREATE TABLE "encounter_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "recommendedLevel" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "participants" TEXT NOT NULL DEFAULT '[]',
    "mapId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "encounter_templates_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "encounter_templates_difficulty_idx" ON "encounter_templates"("difficulty");

-- CreateIndex
CREATE INDEX "encounter_templates_recommendedLevel_idx" ON "encounter_templates"("recommendedLevel");
