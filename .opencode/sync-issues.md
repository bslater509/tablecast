# Sync Issues (Unresolved Only)

## Loot Generator — Section 4.5 Unit Review Failed

### SYNC-1: Route Not Wired
- **Severity:** HIGH
- **Files:** `server/src/routes/loot.js` ↔ `server/src/index.js`
- **Problem:** `loot.js` is created but not imported or mounted in `server/src/index.js`. All `/api/loot/*` endpoints unreachable.
- **Fix:** Add `const lootRouter = require("./routes/loot");` after line 214 in `server/src/index.js`, then add `app.use("/api/loot", lootRouter);` before the features route.
- **Status:** pending

### SYNC-2: Frontend Component Not Wired
- **Severity:** HIGH
- **Files:** `client/src/components/LootGeneratorPanel.jsx` ↔ `client/src/App.jsx`
- **Problem:** `LootGeneratorPanel` is not imported, has no nav item, and no route in `App.jsx`.
- **Fix:** Add import, create nav item (id: "loot", label: "Loot", icon: Coins, path: "/dm/loot") between "templates" and "handouts" in `DM_NAV_ITEMS`, add `<Route path="loot" element={<LootGeneratorPanel user={user} />} />` in DM routes block.
- **Status:** pending

### SYNC-3: Missing POST /api/loot/cache Endpoint
- **Severity:** HIGH
- **Files:** `server/src/routes/loot.js` (backend) ↔ `client/src/components/LootGeneratorPanel.jsx` (frontend calls it)
- **Problem:** Frontend's "Keep Unclaimed" calls `POST /api/loot/cache` with `{ label, data, totalValue, tier }`, but `loot.js` only defines `GET /cache`, `POST /cache/:id/assign`, and `DELETE /cache/:id`. No `POST /cache` handler exists.
- **Fix:** Add `router.post("/cache", requireDm, async (req, res) => { ... })` to `loot.js` that creates a `prisma.lootCache.create(...)` record.
- **Status:** pending

### SYNC-4: Missing Prisma Migration for LootCache
- **Severity:** HIGH
- **Files:** `server/prisma/schema.prisma` ↔ database
- **Problem:** `LootCache` model defined in schema.prisma (line 781) but no migration has been generated. `loot_caches` table does not exist in the database.
- **Fix:** Run `npx prisma migrate dev --name add_loot_cache` in the server directory.
- **Status:** pending

### SYNC-5: rollDice("1") Returns 0
- **Severity:** MEDIUM
- **Files:** `server/src/utils/treasureTables.js`
- **Problem:** `rollMagicItems(table, "1")` passes plain "1" as countRoll to `rollDice()`. `rollDice()` only understands `NdM` notation, so plain "1" returns 0. This affects CR 0-4 hoard magic item generation (2% chance, but when triggered, 0 items are returned).
- **Fix:** Either update `rollDice()` to return `parseInt(notation)` for plain numbers, or change defaults in `HOARD_TREASURE` to use "1d1" instead of undefined for `magicItemRolls`, or handle the plain number case in `rollMagicItems`.
- **Status:** pending
