# Unit Test Record: treasureTables.js

## Target File
`server/src/utils/treasureTables.js`

## Test File (DELETED)
`server/src/utils/__tests__/treasureTables.isolated.test.js`

## Test Summary
30 isolated tests, all passed:

### Data Structure Tests (6)
- INDIVIDUAL_TREASURE has all 4 CR tiers ✅
- HOARD_TREASURE has all 4 CR tiers ✅
- MAGIC_ITEM_TABLES has tables A through I ✅
- GEM_TYPES has all value tiers ✅
- ART_TYPES has all value tiers ✅
- Individual treasure tier 0-4 has 5 entries covering ranges 1-100 ✅

### Dice Helper Tests (4)
- rollDice returns 0 for empty/zero input ✅
- rollDice rolls within expected range for simple notation ✅
- rollDice rolls within expected range for multiplied notation (x) ✅
- rollD100 returns 1-100 ✅

### getCrTier Tests (3)
- getCrTier returns correct tiers ✅
- getCrTier handles fractional CRs ✅
- getCrTier defaults to 0-4 for null/undefined ✅

### generateIndividualTreasure Tests (3)
- generateIndividualTreasure returns valid coin object ✅
- generateIndividualTreasure handles low CR (0-4) ✅
- generateIndividualTreasure handles high CR (17+) ✅

### rollMagicItems Tests (3)
- rollMagicItems returns items from valid table ✅
- rollMagicItems returns empty for invalid table ✅
- rollMagicItems returns correct count with countRoll ✅

### generateGemsOrArt Tests (3)
- generateGemsOrArt returns gems with names ✅
- generateGemsOrArt returns art objects ✅
- generateGemsOrArt returns empty for zero count ✅

### generateHoardTreasure Tests (3)
- generateHoardTreasure returns valid structure ✅
- generateHoardTreasure handles low CR ✅
- generateHoardTreasure handles high CR ✅

### calculateTotalValue Tests (3)
- calculateTotalValue sums coins correctly ✅
- calculateTotalValue includes gem and art values ✅
- calculateTotalValue handles empty/zero values ✅

### Smoke Tests (2)
- generateIndividualTreasure produces random results ✅
- generateHoardTreasure produces random results ✅

## Test Result
- Status: pass
- Session: ses_loot_treasure_tables
- Timestamp: 2026-06-12T07:08:00.000Z
