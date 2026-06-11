-- CreateTable
CREATE TABLE "parties" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL DEFAULT 'Party',
    "inventory" TEXT NOT NULL DEFAULT '[]',
    "currency" TEXT NOT NULL DEFAULT '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "party_members" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "partyId" INTEGER NOT NULL,
    "characterId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    CONSTRAINT "party_members_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "party_members_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
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
    "hitDiceType" TEXT NOT NULL DEFAULT 'd10',
    "hitDiceTotal" INTEGER NOT NULL DEFAULT 1,
    "hitDiceUsed" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}',
    "gold" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_characters" ("charisma", "class", "constitution", "createdAt", "dexterity", "diceColor", "diceTheme", "hitDiceTotal", "hitDiceType", "hitDiceUsed", "hp", "id", "intelligence", "inventory", "level", "maxHp", "modifiers", "name", "race", "spellAttackBonus", "spellSaveDc", "spellSlots", "spellcastingAbility", "spells", "strength", "updatedAt", "userId", "wisdom") SELECT "charisma", "class", "constitution", "createdAt", "dexterity", "diceColor", "diceTheme", "hitDiceTotal", "hitDiceType", "hitDiceUsed", "hp", "id", "intelligence", "inventory", "level", "maxHp", "modifiers", "name", "race", "spellAttackBonus", "spellSaveDc", "spellSlots", "spellcastingAbility", "spells", "strength", "updatedAt", "userId", "wisdom" FROM "characters";
DROP TABLE "characters";
ALTER TABLE "new_characters" RENAME TO "characters";
CREATE INDEX "characters_userId_idx" ON "characters"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "party_members_partyId_characterId_key" ON "party_members"("partyId", "characterId");
