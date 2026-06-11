# Project Context

## Current Mission: Section 2 - Gameplay Systems (COMPLETE ✅)

All 5 milestones implemented, verified, and deployed.

---

## Section 2 Implementation Summary

### M1: Short/Long Rest with Recovery (§2.1)
- **Backend**: `server/src/routes/rest.js` — POST /api/characters/:id/rest endpoint
  - Short rest: spend hit dice, recover HP, track hitDiceUsed
  - Long rest: full HP recovery, half hit dice recovery, spell slot reset
  - Prisma migration `20260611191612_add_hit_dice`: hitDiceType (TEXT), hitDiceTotal (INT), hitDiceUsed (INT)
  - Seed updated for Thorin (d12, 2 total, 0 used) and Aldric (d8, 2 total, 0 used)
- **Frontend**: CharacterSheet.jsx — rest buttons with hit dice input, auto-dismiss toast notifications, socket broadcast via chat:send

### M2: Spellbook & Spell Cards UI (§2.4)
- **SpellsPanel.jsx** (625 lines): Spell card layout with school color badges, meta grid, description, material components, cast button with slot dropdown, upcast level selector, filter tabs (All/Cantrips/Prepared/Concentration/Ritual), search, sort (level/name/school), prepared checkbox, delete, Roll Damage/Attack buttons
- **CharacterSheet.jsx** wiring: handleCastSpell, handleSpellDamage, handleSpellAttack, handleEnrichSpell (5etools), fetchSpellDetail, handleAddSpell/TogglePrepared/RemoveSpell/ResetSlots/SlotToggle/RecoverSlot
- **characterStyles.js**: All spell-related styles

### M3: Level-Up Wizard (§2.5)
- **Backend**: `server/src/routes/levelup.js` — POST /api/characters/:id/level-up
  - Validates newHp, applies ASI (max 20), tracks feat name in modifiers, updates spell slots per PHB table, level capped at 20
- **Frontend**: `LevelUpWizard.jsx` (481 lines) — Multi-step: HP (average/manual), ASI/Feat (with 5etools autocomplete search), Review & Apply
  - 5etools feat search via `/api/reference/search?category=feats&q=...`
  - Feats cached to `server/uploads/5etools-cache/feats.json` (363KB)

### M4: Party Inventory & Shared Gold (§2.3)
- **Backend**: `server/src/routes/parties.js` (672 lines) — 7 endpoints
  - Prisma models: Party + PartyMember with `gold` (copper-piece-based), party `inventory` (JSON), aggregated member inventory
  - Transfer endpoint: character ↔ party gold/items with denomination breakdown
- **Frontend**: `PartyVaultPanel.jsx` (939 lines) — Full vault UI with member list, aggregated inventory, currency display, transfer forms
  - Registered at `/api/parties` in index.js, DM nav tab "Party Vault"

### M5: Shopping & Economy System (§2.2)
- **Backend**: `server/src/routes/shops.js` (494 lines) — Shop + ShopItem CRUD
  - Prisma models: Shop (name, description, markup), ShopItem (name, description, category, priceCp, quantity, magic)
  - Buy endpoint: deducts gold from character, adds item to inventory; Sell with haggle (Persuasion DC10 for +10%)
  - Prisma migration `20260611192731_add_shops`
- **Frontend**: `ShopPanel.jsx` (1136 lines) — Inventory browsing, buy, sell, currency display, haggle roll with result display
  - DM nav tab "Shop", player access via DM permission

---

## Reference Data Updates
- **feats.json** fetched from 5etools mirror (363KB)
- `referenceSearch.js`: feats support enabled (getFeats(), case "feats", summarizeItem for feats)
- `reference.js`: IMAGE_SECTIONS includes feats mapping
- All-category search includes "feats"

## Build Verification
- Vite build: ✅ 1794 modules, 4.69s
- LSP diagnostics: ✅ Clean (0 errors, 0 warnings)
- Server require(): ✅ All routes load cleanly

## Git
- Commit `7594d39`: "Section 2: Gameplay Systems - SpellsPanel enhancement, LevelUp wizard, Party vault, Shopping"
- Commit `995d956`: "fix: M5 Shopping & Economy SYNC-3 through SYNC-7 fixes"
- All changes pushed to origin/master ✅
