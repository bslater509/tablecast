// =============================================================================
// Tablecast  5etools Token Image URL Constructor
// Constructs https://5e.tools/img/... URLs programmatically.
// No local filesystem walk needed — all references point to 5e.tools CDN.
// =============================================================================
"use strict";

const IMG_BASE_URL = "https://5e.tools/img";

/**
 * Encode a name for use in a URL path.
 */
function urlEncodeName(name) {
  return encodeURIComponent(name);
}

/**
 * Constructs the 5e.tools URL for a monster token image.
 * Format: https://5e.tools/img/bestiary/tokens/{source}/{name}.webp
 */
function getMonsterTokenUrl(name, source) {
  const cleanSource = (source || "MM").trim();
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  return `${IMG_BASE_URL}/bestiary/tokens/${urlEncodeName(cleanSource)}/${urlEncodeName(cleanName)}.webp`;
}

/**
 * Constructs the 5e.tools URL for a monster portrait image.
 * Format: https://5e.tools/img/bestiary/{source}/{name}.webp
 */
function getMonsterPortraitUrl(name, source) {
  const cleanSource = (source || "MM").trim();
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  return `${IMG_BASE_URL}/bestiary/${urlEncodeName(cleanSource)}/${urlEncodeName(cleanName)}.webp`;
}

/**
 * Find a reference image URL by constructing it from known patterns.
 * Since we can't scan the remote filesystem, we construct the most likely URL.
 *
 * Returns a match object with the constructed URL, or null if name is empty.
 */
function findReferenceImage({ name, source, section, preferToken = false, tokenOnly = false }) {
  if (!name || typeof name !== "string" || !name.trim()) {
    return null;
  }

  const cleanName = name.trim();
  const cleanSource = (source || "").trim() || "MM";
  const cleanSection = (section || "").trim().toLowerCase();

  let url = null;
  let isToken = false;

  if (cleanSection === "bestiary") {
    if (preferToken || tokenOnly) {
      url = getMonsterTokenUrl(cleanName, cleanSource);
      isToken = true;
    }
    if (!url && !tokenOnly) {
      url = getMonsterPortraitUrl(cleanName, cleanSource);
    }
  } else if (cleanSection) {
    // Generic section: construct URL from section/source/name
    url = `${IMG_BASE_URL}/${urlEncodeName(cleanSection)}/${urlEncodeName(cleanSource)}/${urlEncodeName(cleanName)}.webp`;
  } else {
    // No section specified — default to bestiary token
    url = getMonsterTokenUrl(cleanName, cleanSource);
    isToken = true;
  }

  return {
    name: cleanName,
    source: cleanSource,
    section: cleanSection || "bestiary",
    url,
    isToken,
    matchCount: 1,
  };
}

/**
 * Find a monster token image (convenience wrapper).
 */
function findMonsterTokenImage({ name, source }) {
  return findReferenceImage({ name, source, section: "bestiary", preferToken: true, tokenOnly: true });
}

/**
 * Clear cache — no-op since no in-memory index is maintained.
 */
function clearCache() {
  // No filesystem index to clear
}

module.exports = {
  clearCache,
  findReferenceImage,
  findMonsterTokenImage,
};
