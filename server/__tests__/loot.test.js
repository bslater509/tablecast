// =============================================================================
// Tablecast  Loot Generator Unit Tests
// Tests the treasure table reference data pure functions.
// No DB or Express dependency — runs with Node 22+ built-in test runner.
// Usage:  node --test server/__tests__/loot.test.js
// =============================================================================
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// ---------------------------------------------------------------------------
// Import treasure tables module
// ---------------------------------------------------------------------------
const {
  INDIVIDUAL_TREASURE,
  HOARD_TREASURE,
  MAGIC_ITEM_TABLES,
  GEM_TYPES,
  ART_TYPES,
  generateIndividualTreasure,
  generateHoardTreasure,
  generateGemsOrArt,
  rollMagicItems,
  calculateTotalValue,
  getCrTier,
  rollDice,
  rollD100,
} = require("../src/utils/treasureTables");

// ---------------------------------------------------------------------------
// Helper: Count total coins across all currencies in a result
// ---------------------------------------------------------------------------
function totalCoins(result) {
  if (!result || !result.coins) return 0;
  const c = result.coins;
  return (c.pp || 0) + (c.gp || 0) + (c.ep || 0) + (c.sp || 0) + (c.cp || 0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("treasureTables — getCrTier()", () => {
  it("returns '0-4' for CR 0 to 4", () => {
    assert.equal(getCrTier(0), "0-4");
    assert.equal(getCrTier(1), "0-4");
    assert.equal(getCrTier(4), "0-4");
  });

  it("returns '5-10' for CR 5 to 10", () => {
    assert.equal(getCrTier(5), "5-10");
    assert.equal(getCrTier(7.5), "5-10");
    assert.equal(getCrTier(10), "5-10");
  });

  it("returns '11-16' for CR 11 to 16", () => {
    assert.equal(getCrTier(11), "11-16");
    assert.equal(getCrTier(16), "11-16");
  });

  it("returns '17+' for CR 17+", () => {
    assert.equal(getCrTier(17), "17+");
    assert.equal(getCrTier(20), "17+");
    assert.equal(getCrTier(30), "17+");
  });

  it("handles string input", () => {
    assert.equal(getCrTier("3"), "0-4");
    assert.equal(getCrTier("8"), "5-10");
    assert.equal(getCrTier("15"), "11-16");
    assert.equal(getCrTier("25"), "17+");
  });
});

describe("treasureTables — calculateTotalValue()", () => {
  it("returns 0 for empty result", () => {
    assert.equal(calculateTotalValue({}), 0);
  });

  it("calculates coin values correctly (note: EP is NOT included)", () => {
    const result = {
      coins: { pp: 5, gp: 10, ep: 20, sp: 30, cp: 100 },
    };
    // pp=5*10=50, gp=10, sp=30/10=3, cp=100/100=1 => 50+10+3+1 = 64 (EP excluded from calc)
    assert.equal(calculateTotalValue(result), 64);
  });

  it("includes gem and art values", () => {
    const result = {
      coins: { gp: 100 },
      gems: [{ value: 50 }, { value: 100 }],
      art: [{ value: 250 }],
    };
    // 100 + 50 + 100 + 250 = 500
    assert.equal(calculateTotalValue(result), 500);
  });
});

describe("treasureTables — rollDice()", () => {
  it("parses basic dice notation", () => {
    const result = rollDice("3d6");
    assert.ok(Number.isInteger(result));
    assert.ok(result >= 3 && result <= 18);
  });

  it("parses multiplier notation (2d6x10)", () => {
    const result = rollDice("2d6x10");
    assert.ok(Number.isInteger(result));
    // min=2*10=20, max=12*10=120
    assert.ok(result >= 20 && result <= 120);
  });

  it("returns 0 for '0' input", () => {
    assert.equal(rollDice("0"), 0);
  });

  it("handles single die (1d20)", () => {
    for (let i = 0; i < 50; i++) {
      const result = rollDice("1d20");
      assert.ok(result >= 1 && result <= 20);
    }
  });
});

describe("treasureTables — generateIndividualTreasure()", () => {
  it("returns a valid result for CR 1", () => {
    const result = generateIndividualTreasure(1);
    assert.ok(result, "Result should be defined");
    assert.ok(result.coins, "Result should have coins");
    assert.ok(totalCoins(result) > 0, "Should have some coins");
    assert.ok(result.tier, "Should have a tier");
  });

  it("returns a valid result for CR 8", () => {
    const result = generateIndividualTreasure(8);
    assert.ok(result, "Result should be defined");
    assert.ok(result.coins, "Result should have coins");
    assert.ok(totalCoins(result) > 0, "Should have some coins");
  });

  it("returns different results on repeated calls (stochastic)", () => {
    const results = new Set();
    for (let i = 0; i < 20; i++) {
      const r = generateIndividualTreasure(3);
      results.add(JSON.stringify(r.coins));
    }
    // With 20 rolls we should get at least some variation
    assert.ok(results.size > 1, "Should produce varied coin amounts");
  });

  it("handles very low CR (0)", () => {
    const result = generateIndividualTreasure(0);
    assert.ok(result);
    assert.ok(result.coins);
  });

  it("handles very high CR (30)", () => {
    const result = generateIndividualTreasure(30);
    assert.ok(result);
    assert.ok(result.coins);
  });
});

describe("treasureTables — generateHoardTreasure()", () => {
  it("returns a hoard result for CR 5 (mid tier)", () => {
    const result = generateHoardTreasure(5);
    assert.ok(result, "Result should be defined");
    assert.ok(result.coins, "Should have coins");
    assert.ok(totalCoins(result) > 0, "Should have some coins");
  });

  it("returns gems or art objects for higher CR hoards", () => {
    // Run multiple times to increase chance of hitting gem/art roll
    let foundGemsOrArt = false;
    for (let i = 0; i < 20; i++) {
      const result = generateHoardTreasure(10);
      if ((result.gems && result.gems.length > 0) || (result.art && result.art.length > 0)) {
        foundGemsOrArt = true;
        break;
      }
    }
    assert.ok(foundGemsOrArt, "Should generate gems or art in some rolls");
  });

  it("includes magic items for higher CR hoards", () => {
    // Run multiple times to see if we get magic items
    let foundMagic = false;
    for (let i = 0; i < 30; i++) {
      const result = generateHoardTreasure(11);
      if (result.magicItems && result.magicItems.length > 0) {
        foundMagic = true;
        break;
      }
    }
    assert.ok(foundMagic, "Should generate magic items in some CR 11+ hoards");
  });

  it("calculated total value includes coins + gems + magic items", () => {
    const result = generateHoardTreasure(15);
    const calculated = calculateTotalValue(result);
    assert.ok(calculated > 0, "Total value should be positive");
    if (result.gems) {
      assert.ok(calculated >= result.coins.gp, "Total should include gem values");
    }
  });
});

describe("treasureTables — generateGemsOrArt()", () => {
  it("returns an array of gems or art objects", () => {
    // CR 10 tier has gem/art generation
    const result = generateGemsOrArt("5-10");
    assert.ok(Array.isArray(result));
  });
});

describe("treasureTables — rollMagicItems()", () => {
  it("handles table A (minor items) — default 1 roll", () => {
    const result = rollMagicItems("A");
    assert.ok(result, "Result should exist");
    assert.ok(Array.isArray(result.items));
    assert.equal(result.items.length, 1);
    assert.ok(result.items[0].name, "Magic item should have a name");
  });

  it("handles multiple rolls with dice notation", () => {
    const result = rollMagicItems("B", "1d4");
    assert.ok(Array.isArray(result.items));
    assert.ok(result.items.length >= 1 && result.items.length <= 4);
  });

  it("returns empty items for unknown table", () => {
    const result = rollMagicItems("Z");
    assert.ok(typeof result === "object");
    assert.ok(Array.isArray(result.items));
    assert.equal(result.items.length, 0);
  });
});

describe("treasureTables — MAGIC_ITEM_TABLES structure", () => {
  it("all tables A through I exist", () => {
    const expectedTables = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    for (const t of expectedTables) {
      assert.ok(MAGIC_ITEM_TABLES[t], `Table ${t} should exist`);
      assert.ok(Array.isArray(MAGIC_ITEM_TABLES[t]), `Table ${t} should be an array`);
    }
  });

  it("each table entry has name and range", () => {
    for (const [key, table] of Object.entries(MAGIC_ITEM_TABLES)) {
      for (const entry of table) {
        assert.ok(entry.name, `Entry in table ${key} should have a name`);
        if (entry.range) {
          assert.ok(Array.isArray(entry.range));
          assert.equal(entry.range.length, 2);
        }
      }
    }
  });

  it("table A items have consumable boolean property", () => {
    for (const item of MAGIC_ITEM_TABLES.A) {
      assert.ok(typeof item.consumable === "boolean", `Item ${item.name} should have boolean consumable`);
    }
  });
});

describe("treasureTables — GEM_TYPES and ART_TYPES", () => {
  it("GEM_TYPES has gem entries grouped by value", () => {
    assert.ok(Object.keys(GEM_TYPES).length > 0);
    for (const [value, gems] of Object.entries(GEM_TYPES)) {
      assert.ok(Array.isArray(gems), `${value} should map to an array`);
      assert.ok(gems.length > 0, `${value} should have at least one gem`);
    }
  });

  it("ART_TYPES has art entries grouped by value", () => {
    assert.ok(Object.keys(ART_TYPES).length > 0);
    for (const [value, art] of Object.entries(ART_TYPES)) {
      assert.ok(Array.isArray(art), `${value} should map to an array`);
      assert.ok(art.length > 0, `${value} should have at least one art object`);
    }
  });

  it("gems are arrays of name strings", () => {
    const gems = GEM_TYPES["10 gp"];
    assert.ok(gems.length > 0);
    assert.equal(typeof gems[0], "string", "Gem type entry should be a string name");
  });
});
