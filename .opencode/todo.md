# Mission: Section 2 - Gameplay Systems

## M1: Short/Long Rest with Recovery (§2.1) | status: completed
### T1.1: Backend — Hit Die tracking & rest endpoint
- [x] S1.1.1: Add hitDiceType, hitDiceTotal, hitDiceUsed to Character model + migration
- [x] S1.1.2: Add POST /api/characters/:id/rest endpoint (short/long rest logic)
- [x] S1.1.3: Update ALLOWED_FIELDS in characters.js for new fields

### T1.2: Frontend — Rest UI in CharacterSheet
- [x] S1.2.1: Add rest buttons (Short Rest, Long Rest) with hit dice spending UI
- [x] S1.2.2: Add rest notification/recovery animation
- [x] S1.2.3: Wire up rest endpoint with socket broadcast

## M2: Spellbook & Spell Cards UI (§2.4) | status: completed
### T2.1: Enhanced SpellsPanel
- [x] S2.1.1: Add spell card layout with full detail view (school, level, components, description)
- [x] S2.1.2: Add Cast button with slot consumption, concentration tracking
- [x] S2.1.3: Add filtering (All, Cantrips, Prepared, Concentration, Ritual) + search
- [x] S2.1.4: Add sorting by level/school/name
- [x] S2.1.5: Add upcast support (dropdown for higher level casting)

### T2.2: Spell Detail Integration with 5etools
- [x] S2.2.1: Fetch spell details from 5etools cache on expand
- [x] S2.2.2: Show save DC, attack roll, damage formula on spell cards
- [x] S2.2.3: Add "Roll Damage" and "Roll Attack" buttons on spell cards

## M3: Level-Up Wizard (§2.5) | status: completed
### T3.1: Backend — Level-up support
- [x] S3.1.1: Add POST /api/characters/:id/level-up endpoint
- [x] S3.1.2: Add class features / ASI validation logic

### T3.2: Frontend — Level-Up Wizard UI
- [x] S3.2.1: Create LevelUpWizard component (multi-step flow: HP, features, ASI/feat, spells)
- [x] S3.2.2: Add "Level Up" button to CharacterSheet
- [x] S3.2.3: Integration with 5etools class/feat reference data

### Fixes
- [x] S3.3.1: Fix prop name mismatch (CharacterSheet.jsx: onLevelUpComplete → onApplied)
- [x] S3.3.2: Add 5etools reference integration for feats (276 feats cached, autocomplete in LevelUpWizard)

## M4: Party Inventory & Shared Gold (§2.3) | status: completed
### T4.1: Backend — Party model & routes
- [x] S4.1.1: Add Party model + PartyMember model to Prisma schema + migration
- [x] S4.1.2: Add CRUD routes for party inventory / shared gold
- [x] S4.1.3: Add transfer endpoint (character ↔ party)

### T4.2: Frontend — Party Vault Panel
- [x] S4.2.1: Create PartyVaultPanel component
- [x] S4.2.2: Add transfer UI for items/gold between characters and party
- [x] S4.2.3: Add "Party Vault" tab to navigation

## M5: Shopping & Economy System (§2.2) | status: completed
### T5.1: Backend — Shop model & routes
- [x] S5.1.1: Add Shop + ShopItem models to Prisma schema + migration
- [x] S5.1.2: Add CRUD routes for shops/items
- [x] S5.1.3: Add buy/sell endpoint with currency management

### T5.2: Frontend — Shop Panel
- [x] S5.2.1: Create ShopPanel component (inventory browsing, buying)
- [x] S5.2.2: Add currency display/management on CharacterSheet
- [x] S5.2.3: Add haggle mechanic (Persuasion check)

## M6: Verification | status: completed
- [x] S6.1: Run Vite build
- [x] S6.2: Run LSP diagnostics
- [x] S6.3: Verify git status and push
