-- RedefineTables
-- Step 1: Remove diceTheme and diceColor from users table
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "id", "role", "updatedAt", "username") SELECT "createdAt", "id", "role", "updatedAt", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Step 2: Add diceTheme and diceColor to characters, make userId optional
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_characters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
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
    "diceTheme" TEXT NOT NULL DEFAULT 'default',
    "diceColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "inventory" TEXT NOT NULL DEFAULT '[]',
    "modifiers" TEXT NOT NULL DEFAULT '{}',
    "spellSlots" TEXT NOT NULL DEFAULT '{}',
    "spells" TEXT NOT NULL DEFAULT '[]',
    "spellcastingAbility" TEXT NOT NULL DEFAULT '',
    "spellSaveDc" INTEGER NOT NULL DEFAULT 10,
    "spellAttackBonus" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_characters" ("charisma", "class", "constitution", "createdAt", "dexterity", "hp", "id", "intelligence", "inventory", "level", "maxHp", "modifiers", "name", "race", "spellAttackBonus", "spellSaveDc", "spellSlots", "spellcastingAbility", "spells", "strength", "updatedAt", "userId", "wisdom") SELECT "charisma", "class", "constitution", "createdAt", "dexterity", "hp", "id", "intelligence", "inventory", "level", "maxHp", "modifiers", "name", "race", "spellAttackBonus", "spellSaveDc", "spellSlots", "spellcastingAbility", "spells", "strength", "updatedAt", "userId", "wisdom" FROM "characters";
DROP TABLE "characters";
ALTER TABLE "new_characters" RENAME TO "characters";
CREATE INDEX "characters_userId_idx" ON "characters"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Step 3: Add characterId to chat_messages
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_chat_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER,
    "characterId" INTEGER,
    "sender" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'user',
    "rollDetails" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chat_messages_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_chat_messages" ("createdAt", "id", "rollDetails", "sender", "text", "type", "userId") SELECT "createdAt", "id", "rollDetails", "sender", "text", "type", "userId" FROM "chat_messages";
DROP TABLE "chat_messages";
ALTER TABLE "new_chat_messages" RENAME TO "chat_messages";
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");
CREATE INDEX "chat_messages_userId_idx" ON "chat_messages"("userId");
CREATE INDEX "chat_messages_characterId_idx" ON "chat_messages"("characterId");
CREATE INDEX "chat_messages_type_idx" ON "chat_messages"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Step 4: Add characterId to rolls
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_rolls" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sender" TEXT NOT NULL,
    "characterId" INTEGER,
    "rollName" TEXT NOT NULL DEFAULT 'Dice Roll',
    "formula" TEXT NOT NULL,
    "rolls" TEXT NOT NULL,
    "modifier" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "diceTheme" TEXT NOT NULL DEFAULT 'default',
    "diceColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rolls_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_rolls" ("createdAt", "diceColor", "diceTheme", "formula", "id", "modifier", "rollName", "rolls", "sender", "total") SELECT "createdAt", "diceColor", "diceTheme", "formula", "id", "modifier", "rollName", "rolls", "sender", "total" FROM "rolls";
DROP TABLE "rolls";
ALTER TABLE "new_rolls" RENAME TO "rolls";
CREATE INDEX "rolls_createdAt_idx" ON "rolls"("createdAt");
CREATE INDEX "rolls_characterId_idx" ON "rolls"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Step 5: Add characterId to ai_conversations
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ai_conversations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "characterId" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'rules',
    "npcId" INTEGER,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ai_conversations_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ai_conversations_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "npcs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ai_conversations" ("createdAt", "id", "npcId", "title", "type", "updatedAt", "userId") SELECT "createdAt", "id", "npcId", "title", "type", "updatedAt", "userId" FROM "ai_conversations";
DROP TABLE "ai_conversations";
ALTER TABLE "new_ai_conversations" RENAME TO "ai_conversations";
CREATE INDEX "ai_conversations_userId_idx" ON "ai_conversations"("userId");
CREATE INDEX "ai_conversations_characterId_idx" ON "ai_conversations"("characterId");
CREATE INDEX "ai_conversations_npcId_idx" ON "ai_conversations"("npcId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
