// =============================================================================
// Tablecast  5etools Reference Search Engine
// Fetches from https://5e.tools/data/ with disk + in-memory caching.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const logger = require("./logger");

const CACHE_DIR = path.resolve(__dirname, "../../uploads/5etools-cache");
// Base URL for 5etools raw data (GitHub mirror — 5e.tools is behind Cloudflare)
const DATA_BASE_URL = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master/data";

// In-memory cache
let cache = {
  spells: null,
  monsters: null,
  monsterFluff: null,
  items: null,
  races: null,
  classes: null,
  rules: null,
  actions: null,
  feats: null,
};

/**
 * Clears the in-memory cache.
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
    actions: null,
    feats: null,
  };
  logger.info("app:reference", "Memory cache cleared.");
}

/**
 * HTTP GET helper that returns response body as string.
 * Uses curl via child_process because 5e.tools is behind Cloudflare
 * which blocks Node.js's built-in http/https TLS fingerprint.
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const result = spawnSync("curl", [
      "-s",
      "-L",
      "--max-time", "30",
      "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "-H", "Accept: application/json, text/plain, */*",
      url,
    ], { timeout: 35000, maxBuffer: 50 * 1024 * 1024, encoding: "utf8" });

    if (result.error) {
      reject(new Error(`Curl error: ${result.error.message}`));
      return;
    }
    if (result.status !== 0) {
      reject(new Error(`Curl exit code ${result.status} for ${url}: ${result.stderr?.substring(0, 200)}`));
      return;
    }
    resolve(result.stdout);
  });
}

/**
 * Returns a file-safe name from a URL path.
 */
function urlPathToFilename(urlPath) {
  return urlPath.replace(/^\/+/, "").replace(/[/?]/g, "_");
}

/**
 * Ensures cache dir exists.
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Loads JSON data for a given 5e.tools URL path.
 * Tries: in-memory → disk cache → HTTP fetch.
 */
async function loadData(urlPath, dataKey) {
  const cacheFile = path.join(CACHE_DIR, urlPathToFilename(urlPath));
  const url = `${DATA_BASE_URL}${urlPath}`;

  // Try disk cache first
  if (fs.existsSync(cacheFile)) {
    try {
      const content = fs.readFileSync(cacheFile, "utf8");
      const data = JSON.parse(content);
      if (data && Array.isArray(data[dataKey])) {
        return data[dataKey];
      }
    } catch (err) {
      logger.warn("app:reference", `Cache read failed for ${cacheFile}: ${err.message}`);
    }
  }

  // Fetch from remote
  try {
    logger.info("app:reference", `Fetching ${url}...`);
    const body = await fetchUrl(url);
    ensureCacheDir();
    fs.writeFileSync(cacheFile, body, "utf8");
    const data = JSON.parse(body);
    if (data && Array.isArray(data[dataKey])) {
      return data[dataKey];
    }
    return [];
  } catch (err) {
    logger.error("app:reference", `Failed to fetch ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Scan the cache directory for all bestiary/spell files and load/combine them.
 */
function loadAllFromCache(prefix, arrayKey) {
  const list = [];
  if (!fs.existsSync(CACHE_DIR)) return list;

  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      if (!file.startsWith(prefix)) continue;
      if (!file.endsWith(".json")) continue;
      try {
        const content = fs.readFileSync(path.join(CACHE_DIR, file), "utf8");
        const data = JSON.parse(content);
        if (data && Array.isArray(data[arrayKey])) {
          list.push(...data[arrayKey]);
        }
      } catch (err) {
        logger.warn("app:reference", `Failed to parse cached file ${file}:`, { error: err.message });
      }
    }
  } catch (err) {
    logger.error("app:reference", `Cache directory read failed:`, { error: err.message });
  }
  return list;
}

/**
 * Attempts to load from a single cached JSON file.
 */
function loadSingleFromCache(filename, arrayKey) {
  const filePath = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    if (data && Array.isArray(data[arrayKey])) {
      return data[arrayKey];
    }
  } catch (err) {
    logger.warn("app:reference", `Failed to parse ${filePath}:`, { error: err.message });
  }
  return [];
}

// ---------------------------------------------------------------------------
// Lazy loaders — try disk cache first, then async fetch on miss
// ---------------------------------------------------------------------------
function getSpells() {
  if (cache.spells) return cache.spells;
  cache.spells = loadAllFromCache("spells_spells-", "spell");
  if (!cache.spells.length) {
    cache.spells = loadSingleFromCache("spells_spells-phb.json", "spell");
  }
  logger.info("app:reference", `Loaded ${cache.spells.length} spells from cache.`);
  return cache.spells;
}

function getMonsters() {
  if (cache.monsters) return cache.monsters;
  cache.monsters = loadAllFromCache("bestiary_bestiary-", "monster");
  if (!cache.monsters.length) {
    cache.monsters = loadSingleFromCache("bestiary_bestiary-mm.json", "monster");
  }
  logger.info("app:reference", `Loaded ${cache.monsters.length} monsters from cache.`);
  return cache.monsters;
}

function getMonsterFluff() {
  if (cache.monsterFluff) return cache.monsterFluff;
  cache.monsterFluff = loadAllFromCache("bestiary_fluff-bestiary-", "monsterFluff");
  if (!cache.monsterFluff.length) {
    cache.monsterFluff = loadSingleFromCache("bestiary_fluff-bestiary-mm.json", "monsterFluff");
  }
  logger.info("app:reference", `Loaded ${cache.monsterFluff.length} monster fluff entries from cache.`);
  return cache.monsterFluff;
}

function getItems() {
  if (cache.items) return cache.items;
  cache.items = loadSingleFromCache("items.json", "item");
  if (!cache.items.length) {
    cache.items = loadSingleFromCache("items.json", "item");
  }
  logger.info("app:reference", `Loaded ${cache.items.length} items from cache.`);
  return cache.items;
}

function getRaces() {
  if (cache.races) return cache.races;
  cache.races = loadSingleFromCache("races.json", "race");
  logger.info("app:reference", `Loaded ${cache.races.length} races from cache.`);
  return cache.races;
}

function getClasses() {
  if (cache.classes) return cache.classes;
  cache.classes = loadAllFromCache("class_class-", "class");
  if (!cache.classes.length) {
    cache.classes = loadSingleFromCache("class_class-barbarian.json", "class");
  }
  logger.info("app:reference", `Loaded ${cache.classes.length} classes from cache.`);
  return cache.classes;
}

function getRules() {
  if (cache.rules) return cache.rules;
  cache.rules = loadSingleFromCache("actions.json", "action");
  logger.info("app:reference", `Loaded ${cache.rules.length} rules/actions from cache.`);
  return cache.rules;
}

function getFeats() {
  if (cache.feats) return cache.feats;
  cache.feats = loadSingleFromCache("feats.json", "feat");
  if (!cache.feats.length) {
    cache.feats = loadSingleFromCache("feats.json", "feat");
  }
  logger.info("app:reference", `Loaded ${cache.feats.length} feats from cache.`);
  return cache.feats;
}

// ---------------------------------------------------------------------------
// Helpers (unchanged from original)
// ---------------------------------------------------------------------------
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
  const base = { name: item.name, source: item.source };
  switch (category) {
    case "spells":
      return { ...base, level: item.level, school: item.school, time: item.time, range: item.range, duration: item.duration };
    case "monsters":
      return { ...base, cr: item.cr, hp: item.hp ? { average: item.hp.average, formula: item.hp.formula } : undefined, ac: item.ac, size: item.size, type: item.type };
    case "items":
      return { ...base, rarity: item.rarity, type: item.type, weight: item.weight, value: item.value };
    case "feats":
      return { ...base, prerequisite: item.prerequisite };
    default:
      return base;
  }
}

function getDataset(category) {
  switch (category.toLowerCase()) {
    case "spells":   return getSpells();
    case "monsters": return getMonsters();
    case "items":    return getItems();
    case "races":    return getRaces();
    case "classes":  return getClasses();
    case "rules":    return getRules();
    case "feats":    return getFeats();
    default:         return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function search(category, query = "", limit = 50, options = {}) {
  const normalizedCategory = String(category || "").toLowerCase();
  let dataset = applySourceFilter(getDataset(normalizedCategory), options.sources);
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery) {
    dataset = dataset.filter((item) => item && item.name && item.name.toLowerCase().includes(cleanQuery));
  }
  return dataset.slice(0, limit).map((item) => options.summary === false ? item : summarizeItem(item, normalizedCategory));
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
  if (words.length) familyCandidates.push(`${words[0]}s`);
  if (words.length > 1) familyCandidates.push(`${words.slice(0, -1).join(" ")}s`);
  return sourceMatches.find((item) => (hasUsableFluff(item) && familyCandidates.includes(item.name.toLowerCase()))) || exact || null;
}

function listAvailableSources(category) {
  const sourceSet = new Set();
  const categories = category ? [category] : ["spells", "monsters", "items", "races", "classes", "rules", "feats"];
  for (const cat of categories) {
    for (const item of getDataset(cat)) {
      const src = normalizeSource(item?.source);
      if (src) sourceSet.add(src);
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
  loadData, // Exported for on-demand cache population
};
