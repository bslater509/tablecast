-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_characters" (
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
    "spellSlots" TEXT NOT NULL DEFAULT '{}',
    "spells" TEXT NOT NULL DEFAULT '[]',
    "spellcastingAbility" TEXT NOT NULL DEFAULT '',
    "spellSaveDc" INTEGER NOT NULL DEFAULT 10,
    "spellAttackBonus" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_characters" ("charisma", "class", "constitution", "createdAt", "dexterity", "hp", "id", "intelligence", "inventory", "level", "maxHp", "modifiers", "name", "race", "strength", "updatedAt", "userId", "wisdom") SELECT "charisma", "class", "constitution", "createdAt", "dexterity", "hp", "id", "intelligence", "inventory", "level", "maxHp", "modifiers", "name", "race", "strength", "updatedAt", "userId", "wisdom" FROM "characters";
DROP TABLE "characters";
ALTER TABLE "new_characters" RENAME TO "characters";
CREATE INDEX "characters_userId_idx" ON "characters"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
