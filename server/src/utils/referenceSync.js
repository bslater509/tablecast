// =============================================================================
// Tablecast  5etools HTTP Cache Manager
// Fetches D&D 5e reference data from https://5e.tools/ and caches to disk.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Cache directory — resolves to server/uploads/5etools-cache/
const CACHE_DIR = path.resolve(__dirname, "../../uploads/5etools-cache");

// Base URL for 5e.tools data
const DATA_BASE_URL = "https://5e.tools/data";

// Mapping of category to remote JSON paths
const DATA_FILES = {
  spells:   "/spells/spells-phb.json",
  monsters: "/bestiary/bestiary-mm.json",
  items:    "/items.json",
  races:    "/races.json",
  classes:  "/class/class-barbarian.json",
  rules:    "/rules.json",
};

// Additional spell/monster/class source files (discovered at sync time)
const ADDITIONAL_SOURCES = [
  "/spells/spells-xge.json",
  "/spells/spells-tce.json",
  "/spells/spells-ftd.json",
  "/spells/spells-scc.json",
  "/spells/spells-bmt.json",
  "/spells/spells-ggr.json",
  "/spells/spells-idrotf.json",
  "/spells/spells-ai.json",
  "/bestiary/bestiary-xmm.json",
  "/bestiary/bestiary-ftd.json",
  "/bestiary/bestiary-tce.json",
  "/bestiary/bestiary-bmt.json",
  "/bestiary/bestiary-scc.json",
  "/bestiary/bestiary-ggr.json",
  "/bestiary/bestiary-mot.json",
  "/bestiary/fluff-bestiary-mm.json",
  "/bestiary/fluff-bestiary-xmm.json",
  "/class/class-bard.json",
  "/class/class-cleric.json",
  "/class/class-druid.json",
  "/class/class-fighter.json",
  "/class/class-monk.json",
  "/class/class-paladin.json",
  "/class/class-ranger.json",
  "/class/class-rogue.json",
  "/class/class-sorcerer.json",
  "/class/class-warlock.json",
  "/class/class-wizard.json",
  "/class/class-artificer.json",
  "/actions.json",
];

// In-memory sync state
let syncState = {
  isSyncing: false,
  status: "idle", // "idle", "syncing", "success", "error"
  progress: "Idle",
  logs: [],
  cachedBytes: 0,
  cacheFileCount: 0,
};

/**
 * Log message helper.
 */
function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  console.log(`[ReferenceSync] ${logLine}`);
  syncState.logs.push(logLine);
  if (syncState.logs.length > 500) {
    syncState.logs.shift();
  }
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
    ], { timeout: 35000, encoding: "utf8" });

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
 * Ensures the cache directory exists.
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    log(`Created cache directory: ${CACHE_DIR}`);
  }
}

/**
 * Returns a file-safe name from a URL path.
 */
function urlPathToFilename(urlPath) {
  return urlPath.replace(/^\/+/, "").replace(/[\/?]/g, "_");
}

/**
 * Returns full local path for a cached file.
 */
function getCacheFilePath(urlPath) {
  return path.join(CACHE_DIR, urlPathToFilename(urlPath));
}

/**
 * Scans the cache directory and computes total size.
 */
function scanCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    syncState.cachedBytes = 0;
    syncState.cacheFileCount = 0;
    return;
  }
  try {
    const files = fs.readdirSync(CACHE_DIR);
    syncState.cacheFileCount = files.length;
    syncState.cachedBytes = files.reduce((total, file) => {
      const filePath = path.join(CACHE_DIR, file);
      try {
        return total + fs.statSync(filePath).size;
      } catch { return total; }
    }, 0);
  } catch (err) {
    log(`Cache scan failed: ${err.message}`, "error");
  }
}

/**
 * Returns current sync status.
 */
function getStatus() {
  scanCache();
  return { ...syncState };
}

/**
 * Fetches a data file from 5e.tools and caches it to disk.
 */
async function fetchAndCache(urlPath) {
  const url = `${DATA_BASE_URL}${urlPath}`;
  const cacheFile = getCacheFilePath(urlPath);
  const label = urlPath.split("/").pop();

  try {
    log(`Fetching ${label} from ${url}...`);
    const body = await fetchUrl(url);

    // Validate JSON before caching
    try { JSON.parse(body); } catch (e) {
      throw new Error(`Invalid JSON for ${label}: ${e.message}`);
    }

    fs.writeFileSync(cacheFile, body, "utf8");
    log(`Cached ${label} (${(Buffer.byteLength(body) / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    log(`Failed to fetch ${label}: ${err.message}`, "error");
    return false;
  }
}

/**
 * Orchestrates fetching data files in the background.
 */
async function sync() {
  if (syncState.isSyncing) {
    log("Sync already in progress. Ignoring request.", "warn");
    return;
  }

  syncState.isSyncing = true;
  syncState.status = "syncing";
  syncState.logs = [];
  log("Starting 5etools data cache refresh...");

  ensureCacheDir();

  try {
    // Collect all URLs to fetch
    const allSources = new Set(Object.values(DATA_FILES));
    for (const src of ADDITIONAL_SOURCES) {
      allSources.add(src);
    }

    const urls = Array.from(allSources);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
      const urlPath = urls[i];
      syncState.progress = `Fetching ${i + 1}/${urls.length}: ${urlPath.split("/").pop()}...`;

      const ok = await fetchAndCache(urlPath);
      if (ok) successCount++;
      else failCount++;
    }

    scanCache();
    syncState.progress = `Cache refresh complete: ${successCount} OK, ${failCount} failed, ${syncState.cacheFileCount} files (${(syncState.cachedBytes / 1024 / 1024).toFixed(1)} MB)`;
    syncState.status = failCount > 0 ? "error" : "success";
    log(`Sync finished. ${successCount} OK, ${failCount} failed. Total cache: ${syncState.cacheFileCount} files, ${(syncState.cachedBytes / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    syncState.progress = `Sync failed: ${err.message}`;
    syncState.status = "error";
    log(`Sync failed: ${err.message}`, "error");
  } finally {
    syncState.isSyncing = false;
  }
}

/**
 * Clears the entire disk cache.
 */
function clearDiskCache() {
  if (!fs.existsSync(CACHE_DIR)) return;
  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
    syncState.cachedBytes = 0;
    syncState.cacheFileCount = 0;
    log("Disk cache cleared.");
  } catch (err) {
    log(`Failed to clear disk cache: ${err.message}`, "error");
  }
}

/**
 * Returns the cache directory path for use by referenceSearch.
 */
function getCacheDir() {
  return CACHE_DIR;
}

module.exports = {
  getStatus,
  sync,
  clearDiskCache,
  getCacheDir,
  DATA_BASE_URL,
};
