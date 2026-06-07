-- CreateTable
CREATE TABLE "rolls" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sender" TEXT NOT NULL,
    "rollName" TEXT NOT NULL DEFAULT 'Dice Roll',
    "formula" TEXT NOT NULL,
    "rolls" TEXT NOT NULL,
    "modifier" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
