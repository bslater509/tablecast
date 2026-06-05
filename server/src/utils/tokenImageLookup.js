"use strict";

const fs = require("fs");
const path = require("path");

const IMAGE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif"]);
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = {
  builtAt: 0,
  files: [],
};

function getImageRoots() {
  return [
    path.resolve(__dirname, "../../5etoolsimg"),
    path.resolve(__dirname, "../../../5etoolsimg"),
  ].filter((dir, index, all) => fs.existsSync(dir) && all.indexOf(dir) === index);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toUrlPath(root, filePath) {
  const relativePath = path.relative(root, filePath).split(path.sep).map(encodeURIComponent).join("/");
  return `/5etoolsimg/${relativePath}`;
}

function walkImages(root, dir, list) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[TokenImageLookup] Could not scan ${dir}:`, err.message);
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(root, entryPath, list);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const relativeParts = path.relative(root, entryPath).split(path.sep);
    const isToken = relativeParts[0] === "bestiary" && relativeParts[1] === "tokens";
    const source = isToken
      ? (relativeParts.length >= 3 ? relativeParts[2] : "")
      : (relativeParts.length >= 2 ? relativeParts[1] : "");
    list.push({
      name: path.basename(entry.name, ext),
      normalizedName: normalize(path.basename(entry.name, ext)),
      source: normalize(source),
      section: normalize(relativeParts[0] || ""),
      isToken,
      url: toUrlPath(root, entryPath),
    });
  }
}

function getImageIndex() {
  const now = Date.now();
  if (cache.files.length && now - cache.builtAt < CACHE_TTL_MS) {
    return cache.files;
  }

  const files = [];
  for (const root of getImageRoots()) {
    walkImages(root, root, files);
  }

  cache = {
    builtAt: now,
    files,
  };

  console.log(`[TokenImageLookup] Indexed ${files.length} 5etools image files.`);
  return files;
}

function scoreCandidate(candidate, referenceName, source, section = "", options = {}) {
  const normalizedReference = normalize(referenceName);
  const normalizedSource = normalize(source);
  const normalizedSection = normalize(section);
  let score = 0;

  if (normalizedSection && candidate.section !== normalizedSection) return 0;
  if (normalizedSource && candidate.source !== normalizedSource) return 0;

  if (candidate.normalizedName === normalizedReference) score += 100;
  else if (normalizedReference.length >= 4 && candidate.normalizedName.startsWith(normalizedReference)) score += 60;
  else if (candidate.normalizedName.length >= 4 && normalizedReference.includes(candidate.normalizedName)) score += 35;
  else return 0;

  if (normalizedSection && candidate.section === normalizedSection) score += 35;
  else if (candidate.section === "bestiary") score += 25;
  if (normalizedSource && candidate.source === normalizedSource) score += 50;
  if (options.preferToken && candidate.isToken) score += 75;
  if (options.tokenOnly && !candidate.isToken) return 0;
  if (options.excludeTokens && candidate.isToken) return 0;
  if (candidate.url.endsWith(".webp")) score += 5;

  return score;
}

function findReferenceImage({ name, source, section, preferToken = false, tokenOnly = false, excludeTokens = false }) {
  if (!name || typeof name !== "string") {
    return null;
  }

  const matches = getImageIndex()
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, name, source, section, { preferToken, tokenOnly, excludeTokens }),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!matches.length) {
    return null;
  }

  const best = matches[0].candidate;
  return {
    name: best.name,
    source: best.source,
    section: best.section,
    url: best.url,
    matchCount: matches.length,
  };
}

function findMonsterTokenImage({ name, source }) {
  return findReferenceImage({ name, source, section: "bestiary", preferToken: true, tokenOnly: true });
}

function clearCache() {
  cache = { builtAt: 0, files: [] };
}

module.exports = {
  clearCache,
  findReferenceImage,
  findMonsterTokenImage,
};
