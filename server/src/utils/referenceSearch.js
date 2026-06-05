// =============================================================================
// Tablecast  5etools Reference Search Engine
// Lazy-loads and caches JSON files from the 5etoolssrc repository in memory.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const dataRoot = path.resolve(__dirname, "../../5etoolssrc/data");

// In-memory cache for D&D records
let cache = {
  spells: null,
  monsters: null,
  items: null,
  races: null,
  classes: null,
  rules: null,
};

/**
 * Clears the cache. Called when repositories are updated.
 */
function clearCache() {
  cache = {
    spells: null,
    monsters: null,
    items: null,
    races: null,
    classes: null,
    rules: null,
  };
  console.log("[ReferenceSearch] Memory cache cleared.");
}

/**
 * Helper to scan a directory and load/combine matching JSON data arrays.
 */
function loadFromDirectory(dirPath, arrayKey, filePrefix = "") {
  const list = [];
  if (!fs.existsSync(dirPath)) return list;

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      if (filePrefix && !file.startsWith(filePrefix)) continue;
      if (file === "index.json") continue; // skip indices

      const filePath = path.join(dirPath, file);
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(content);
        if (data && Array.isArray(data[arrayKey])) {
          list.push(...data[arrayKey]);
        }
      } catch (err) {
        console.warn(`[ReferenceSearch] Failed to parse file ${file}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`[ReferenceSearch] Directory read failed for ${dirPath}:`, err.message);
  }
  return list;
}

/**
 * Helper to load from a single JSON file.
 */
function loadFromFile(filePath, arrayKey) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    if (data && Array.isArray(data[arrayKey])) {
      return data[arrayKey];
    }
  } catch (err) {
    console.error(`[ReferenceSearch] File read failed for ${filePath}:`, err.message);
  }
  return [];
}

/**
 * Lazy loaders for each category.
 */
function getSpells() {
  if (cache.spells) return cache.spells;
  // Spells reside in 5etoolssrc/data/spells/spells-*.json
  const spellsDir = path.join(dataRoot, "spells");
  cache.spells = loadFromDirectory(spellsDir, "spell", "spells-");
  console.log(`[ReferenceSearch] Loaded ${cache.spells.length} spells into memory.`);
  return cache.spells;
}

function getMonsters() {
  if (cache.monsters) return cache.monsters;
  // Monsters reside in 5etoolssrc/data/bestiary/bestiary-*.json
  const bestiaryDir = path.join(dataRoot, "bestiary");
  cache.monsters = loadFromDirectory(bestiaryDir, "monster", "bestiary-");
  console.log(`[ReferenceSearch] Loaded ${cache.monsters.length} monsters into memory.`);
  return cache.monsters;
}

function getItems() {
  if (cache.items) return cache.items;
  // Items reside in 5etoolssrc/data/items.json
  const itemsFile = path.join(dataRoot, "items.json");
  cache.items = loadFromFile(itemsFile, "item");
  console.log(`[ReferenceSearch] Loaded ${cache.items.length} items into memory.`);
  return cache.items;
}

function getRaces() {
  if (cache.races) return cache.races;
  // Races reside in 5etoolssrc/data/races.json
  const racesFile = path.join(dataRoot, "races.json");
  cache.races = loadFromFile(racesFile, "race");
  console.log(`[ReferenceSearch] Loaded ${cache.races.length} races into memory.`);
  return cache.races;
}

function getClasses() {
  if (cache.classes) return cache.classes;
  // Classes reside in 5etoolssrc/data/class/class-*.json
  const classDir = path.join(dataRoot, "class");
  cache.classes = loadFromDirectory(classDir, "class", "class-");
  console.log(`[ReferenceSearch] Loaded ${cache.classes.length} classes into memory.`);
  return cache.classes;
}

function getRules() {
  if (cache.rules) return cache.rules;
  // Rules reside in 5etoolssrc/data/rules.json (or fallback/books)
  const rulesFile = path.join(dataRoot, "rules.json");
  cache.rules = loadFromFile(rulesFile, "rules");
  if (cache.rules.length === 0) {
    // If no main rules.json array, try loading actions or books indices
    cache.rules = loadFromFile(path.join(dataRoot, "actions.json"), "action");
  }
  console.log(`[ReferenceSearch] Loaded ${cache.rules.length} rules/actions into memory.`);
  return cache.rules;
}

/**
 * Searches in a category by matching the name field.
 */
function search(category, query = "", limit = 50) {
  let dataset = [];
  
  switch (category.toLowerCase()) {
    case "spells":
      dataset = getSpells();
      break;
    case "monsters":
      dataset = getMonsters();
      break;
    case "items":
      dataset = getItems();
      break;
    case "races":
      dataset = getRaces();
      break;
    case "classes":
      dataset = getClasses();
      break;
    case "rules":
      dataset = getRules();
      break;
    default:
      return [];
  }

  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return dataset.slice(0, limit);
  }

  // Filter items that match the query
  return dataset
    .filter((item) => item && item.name && item.name.toLowerCase().includes(cleanQuery))
    .slice(0, limit);
}

module.exports = {
  search,
  clearCache,
};
