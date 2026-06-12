// =============================================================================
// Tablecast — localStorage Cache Helpers
// Offline resilience: cache map/fog/encounter/character data for disconnected UX.
// =============================================================================

const CACHE_PREFIX = "cache:";
const MAX_CACHE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Write data to localStorage with a cache-prefixed key and timestamp.
 * @param {string} key - Storage key (without "cache:" prefix)
 * @param {*} data - Serializable data to store
 * @returns {boolean} Whether the write succeeded
 */
export function cacheSet(key, data) {
  try {
    const entry = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    return true;
  } catch (err) {
    if (err.name === "QuotaExceededError" || err.code === 22) {
      console.warn("[Cache] Quota exceeded — evicting oldest entries");
      evictOldest();
      try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
        return true;
      } catch (retryErr) {
        console.error("[Cache] Still unable to write after eviction:", retryErr);
      }
    } else {
      console.error("[Cache] Write error:", err);
    }
    return false;
  }
}

/**
 * Read data from localStorage by cache key.
 * @param {string} key - Storage key (without "cache:" prefix)
 * @returns {{ data: *, timestamp: number } | null}
 */
export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.timestamp === "number") {
      return parsed;
    }
    // Corrupt entry — remove and return null
    localStorage.removeItem(CACHE_PREFIX + key);
    return null;
  } catch (err) {
    console.warn("[Cache] Read error for", key, err);
    try { localStorage.removeItem(CACHE_PREFIX + key); } catch {}
    return null;
  }
}

/**
 * Remove a single cache entry.
 * @param {string} key
 */
export function cacheRemove(key) {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch (err) {
    console.warn("[Cache] Remove error:", err);
  }
}

/**
 * Clear all cache-prefixed entries from localStorage.
 */
export function cacheClear() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.warn("[Cache] Clear error:", err);
  }
}

/**
 * Get approximate total size in bytes of all cached entries.
 * @returns {number}
 */
export function getCacheSize() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        total += localStorage.getItem(key).length * 2; // UTF-16 ~2 bytes/char
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Check whether available cache space exists (under 5MB threshold).
 * @returns {boolean}
 */
export function isCacheSpaceAvailable() {
  return getCacheSize() < MAX_CACHE_BYTES * 0.9; // 90% threshold
}

// ---- Domain-Specific Helpers ----

/** Cache tokens for a map */
export function writeTokenCache(mapId, tokens) {
  return cacheSet(`map:${mapId}:tokens`, tokens);
}
export function readTokenCache(mapId) {
  const entry = cacheGet(`map:${mapId}:tokens`);
  return entry ? entry.data : null;
}

/** Cache fog state for a map */
export function writeFogCache(mapId, fogState) {
  return cacheSet(`map:${mapId}:fog`, fogState);
}
export function readFogCache(mapId) {
  const entry = cacheGet(`map:${mapId}:fog`);
  return entry ? entry.data : null;
}

/** Cache encounter data */
export function writeEncounterCache(encounterId, encounter) {
  return cacheSet(`encounter:${encounterId}`, encounter);
}
export function readEncounterCache(encounterId) {
  const entry = cacheGet(`encounter:${encounterId}`);
  return entry ? entry.data : null;
}

/** Cache character data */
export function writeCharacterCache(characterId, character) {
  return cacheSet(`character:${characterId}`, character);
}
export function readCharacterCache(characterId) {
  const entry = cacheGet(`character:${characterId}`);
  return entry ? entry.data : null;
}

/** Write/read last sync timestamp */
export function writeLastSync() {
  return cacheSet("lastSync", Date.now());
}
export function getLastSyncTime() {
  const entry = cacheGet("lastSync");
  return entry ? entry.data : null;
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a cache entry is stale (older than 5 minutes).
 * @param {{ data: *, timestamp: number }} entry
 * @returns {boolean}
 */
export function isStale(entry) {
  if (!entry || !entry.timestamp) return true;
  return Date.now() - entry.timestamp > STALE_MS;
}

// ---- Pending Queue Persistence (via sessionStorage) ----

const PENDING_QUEUE_KEY = "tablecast:pendingQueue";

/**
 * Save pending event queue to sessionStorage (survives page refresh).
 * @param {Array<{ event: string, data: *, timestamp: number, retries: number }>} queue
 */
export function savePendingQueue(queue) {
  try {
    const filtered = queue.filter(item => Date.now() - item.timestamp < STALE_MS);
    sessionStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn("[Cache] Failed to save pending queue:", err);
  }
}

/**
 * Load pending event queue from sessionStorage.
 * @returns {Array}
 */
export function loadPendingQueue() {
  try {
    const raw = sessionStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out stale items
    return parsed.filter(item => Date.now() - (item.timestamp || 0) < STALE_MS);
  } catch {
    return [];
  }
}

/**
 * Clear persisted pending queue.
 */
export function clearPendingQueue() {
  try {
    sessionStorage.removeItem(PENDING_QUEUE_KEY);
  } catch {}
}

// ---- Internal: evict oldest 20% of cache entries when quota is exceeded ----
function evictOldest() {
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const raw = localStorage.getItem(key);
          const parsed = JSON.parse(raw);
          entries.push({ key, timestamp: parsed.timestamp || 0 });
        } catch {
          entries.push({ key, timestamp: 0 });
        }
      }
    }
    // Sort oldest first, remove oldest 20%
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const removeCount = Math.max(1, Math.ceil(entries.length * 0.2));
    entries.slice(0, removeCount).forEach(e => {
      try { localStorage.removeItem(e.key); } catch {}
    });
  } catch (err) {
    console.warn("[Cache] Eviction error:", err);
  }
}
