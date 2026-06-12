# Project Context - Section 4.5 Complete (Loot Generator)

## Environment
- Language: JavaScript (Node.js 22, React 18)
- Build: Vite 5 (client) / Node (server)
- Package Manager: npm, Docker, Prisma 5 (SQLite)

## What Was Built — Section 4.5: Loot Generator

### Reference Data — `server/src/utils/treasureTables.js` (644 lines)
- DMG treasure tables A-I encoded with full d100 lookup
- Individual Treasure per CR tier (0-4, 5-10, 11-16, 17+)
- Hoard Treasure per CR tier with coin hoards, gems, art, magic items
- Magic item tables A-I (consumables, minor, major, weapons, scrolls, rods, wondrous, very rare, legendary)
- Gem types (10gp–5000gp) and art objects (25gp–7500gp)
- Dice rolling helpers (rollDice, rollD100) with multiplier notation

### Backend — `/api/loot` Routes (5 endpoints)
- `POST /api/loot/generate` — Generate loot from CR + type (individual/hoard/both)
- `POST /api/loot/cache` — Save generated loot as unclaimed cache
- `GET /api/loot/cache` — List all unclaimed caches
- `POST /api/loot/cache/:id/assign` — Assign cache to party (coins → gold pool, items → inventory)
- `DELETE /api/loot/cache/:id` — Discard a cache entry

### Prisma — `LootCache` model
- Fields: id, data (JSON - full loot result), assignedToPartyId?, assignedAt, createdAt
- Migration `add_loot_cache` applied, DB up to date

### Frontend — `LootGeneratorPanel.jsx` (681 lines)
- **Generate tab**: CR input, treasure type selector, formatted result with coins/gems/art/magic items, Keep Unclaimed / Regenerate buttons
- **Unclaimed tab**: Cached loot list with party selector dropdown, Assign / Discard buttons per entry
- Toast notifications, auth headers, responsive layout matching project patterns

### Wiring
- Route wired in index.js at `/api/loot`
- Nav item added to App.jsx: id="loot", icon=TreasureChest, path="/dm/loot"
- Route in DmLayout: `<Route path="loot" element={...} />`

### Tests
- 31 unit tests covering all treasure table functions (all pass)

### Status: ✅ §4.6 is next unmarked section in features.md
