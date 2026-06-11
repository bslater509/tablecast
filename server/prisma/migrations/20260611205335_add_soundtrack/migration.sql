-- CreateTable
CREATE TABLE "soundtracks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'AMBIENT',
    "filePath" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "loop" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "soundtracks_category_idx" ON "soundtracks"("category");
