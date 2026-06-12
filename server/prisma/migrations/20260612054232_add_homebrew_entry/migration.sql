-- CreateTable
CREATE TABLE "homebrew_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "content" TEXT NOT NULL DEFAULT '{}',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "homebrew_entries_type_idx" ON "homebrew_entries"("type");

-- CreateIndex
CREATE INDEX "homebrew_entries_name_idx" ON "homebrew_entries"("name");

-- CreateIndex
CREATE INDEX "homebrew_entries_isActive_idx" ON "homebrew_entries"("isActive");
