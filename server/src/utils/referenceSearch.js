// =============================================================================
// Tablecast  5etools Reference Search Engine
// Lazy-loads and caches JSON files from the 5etoolssrc repository in memory.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const dataRootCandidates = [
  path.resolve(__dirname, "../../5etoolssrc/data"),
  path.resolve(__dirname, "../../../5etoolssrc/data"),
];
const dataRoot = dataRootCandidates.find((candidate) => fs.existsSync(candidate)) || dataRootCandidates[0];

// In-memory cache for D&D records
let cache = {
  spells: null,
  monsters: null,
  monsterFluff: null,
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
    monsterFluff: null,
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

function normalizeSource(source) {
  return String(source || "").trim().toUpperCase();
}

function normalizeSourceList(sources = []) {
  if (!Array.isArray(sources)) return [];
  return sources.map(normalizeSource).filter(Boolean);
}

function applySourceFilter(dataset, sources = []) {
  const allowedSources = normalizeSourceList(sources);
  if (allowedSources.length === 0) return dataset;
  const allowed = new Set(allowedSources);
  return dataset.filter((item) => allowed.has(normalizeSource(item?.source)));
}

function summarizeItem(item, category) {
  const base = {
    name: item.name,
    source: item.source,
  };

  switch (category) {
    case "spells":
      return {
        ...base,
        level: item.level,
        school: item.school,
        time: item.time,
        range: item.range,
        duration: item.duration,
      };
    case "monsters":
      return {
        ...base,
        cr: item.cr,
        hp: item.hp ? { average: item.hp.average, formula: item.hp.formula } : undefined,
        ac: item.ac,
        size: item.size,
        type: item.type,
      };
    case "items":
      return {
        ...base,
        rarity: item.rarity,
        type: item.type,
        weight: item.weight,
        value: item.value,
      };
    default:
      return base;
  }
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

function getMonsterFluff() {
  if (cache.monsterFluff) return cache.monsterFluff;
  const bestiaryDir = path.join(dataRoot, "bestiary");
  cache.monsterFluff = loadFromDirectory(bestiaryDir, "monsterFluff", "fluff-bestiary-");
  console.log(`[ReferenceSearch] Loaded ${cache.monsterFluff.length} monster fluff entries into memory.`);
  return cache.monsterFluff;
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
function getDataset(category) {
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

  return dataset;
}

/**
 * Searches in a category by matching the name field.
 */
function search(category, query = "", limit = 50, options = {}) {
  const normalizedCategory = String(category || "").toLowerCase();
  let dataset = applySourceFilter(getDataset(normalizedCategory), options.sources);

  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery) {
    dataset = dataset.filter((item) => item && item.name && item.name.toLowerCase().includes(cleanQuery));
  }

  return dataset
    .slice(0, limit)
    .map((item) => options.summary === false ? item : summarizeItem(item, normalizedCategory));
}

function getByName(category, name, source = "", options = {}) {
  const normalizedCategory = String(category || "").toLowerCase();
  const cleanName = String(name || "").trim().toLowerCase();
  const cleanSource = normalizeSource(source);
  if (!cleanName) return null;

  const dataset = applySourceFilter(getDataset(normalizedCategory), options.sources);
  return dataset.find((item) => {
    if (!item?.name || item.name.toLowerCase() !== cleanName) return false;
    return !cleanSource || normalizeSource(item.source) === cleanSource;
  }) || null;
}

function hasUsableFluff(fluff) {
  return Boolean(fluff && Array.isArray(fluff.entries) && fluff.entries.length);
}

function getMonsterFluffByName(name, source = "", options = {}) {
  const cleanName = String(name || "").trim().toLowerCase();
  const cleanSource = normalizeSource(source);
  if (!cleanName) return null;

  const dataset = applySourceFilter(getMonsterFluff(), options.sources);
  const sourceMatches = dataset.filter((item) => {
    if (!item?.name) return false;
    return !cleanSource || normalizeSource(item.source) === cleanSource;
  });

  const exact = sourceMatches.find((item) => item.name.toLowerCase() === cleanName);
  if (hasUsableFluff(exact)) return exact;

  const words = cleanName.split(/\s+/).filter(Boolean);
  const familyCandidates = [];
  if (words.length) {
    familyCandidates.push(`${words[0]}s`);
  }
  if (words.length > 1) {
    familyCandidates.push(`${words.slice(0, -1).join(" ")}s`);
  }

  return sourceMatches.find((item) => (
    hasUsableFluff(item) && familyCandidates.includes(item.name.toLowerCase())
  )) || exact || null;
}

function listAvailableSources(category) {
  const sourceSet = new Set();
  const categories = category ? [category] : ["spells", "monsters", "items", "races", "classes", "rules"];
  for (const cat of categories) {
    for (const item of getDataset(cat)) {
      const source = normalizeSource(item?.source);
      if (source) sourceSet.add(source);
    }
  }
  return Array.from(sourceSet).sort();
}

module.exports = {
  search,
  getByName,
  getMonsterFluffByName,
  listAvailableSources,
  clearCache,
};
