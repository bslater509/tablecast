-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_rolls" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sender" TEXT NOT NULL,
    "rollName" TEXT NOT NULL DEFAULT 'Dice Roll',
    "formula" TEXT NOT NULL,
    "rolls" TEXT NOT NULL,
    "modifier" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "diceColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_rolls" ("createdAt", "formula", "id", "modifier", "rollName", "rolls", "sender", "total") SELECT "createdAt", "formula", "id", "modifier", "rollName", "rolls", "sender", "total" FROM "rolls";
DROP TABLE "rolls";
ALTER TABLE "new_rolls" RENAME TO "rolls";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
