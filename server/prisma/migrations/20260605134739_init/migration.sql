-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "characters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL DEFAULT '',
    "class" TEXT NOT NULL DEFAULT '',
    "level" INTEGER NOT NULL DEFAULT 1,
    "hp" INTEGER NOT NULL DEFAULT 10,
    "maxHp" INTEGER NOT NULL DEFAULT 10,
    "strength" INTEGER NOT NULL DEFAULT 10,
    "dexterity" INTEGER NOT NULL DEFAULT 10,
    "constitution" INTEGER NOT NULL DEFAULT 10,
    "intelligence" INTEGER NOT NULL DEFAULT 10,
    "wisdom" INTEGER NOT NULL DEFAULT 10,
    "charisma" INTEGER NOT NULL DEFAULT 10,
    "inventory" TEXT NOT NULL DEFAULT '[]',
    "modifiers" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maps" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 50,
    "gridType" TEXT NOT NULL DEFAULT 'SQUARE',
    "fogState" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mapId" INTEGER NOT NULL,
    "characterId" INTEGER,
    "label" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "x" REAL NOT NULL DEFAULT 0,
    "y" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tokens_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tokens_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wiki_articles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "isVisibleToPlayers" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
