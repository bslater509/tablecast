// =============================================================================
// Tablecast  5etools Reference API Routes
// Endpoints:  GET  /api/reference/status
//             POST /api/reference/sync
//             GET  /api/reference/search
// =============================================================================
"use strict";

const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const referenceSync = require("../utils/referenceSync");
const referenceSearch = require("../utils/referenceSearch");
const tokenImageLookup = require("../utils/tokenImageLookup");
const { requireDm } = require("../auth");
const prisma = require("../prisma");
const logger = require("../utils/logger");

const router = Router();
const SETTINGS_KEY = "reference.allowedSources";
const IMAGE_SECTIONS = {
  monsters: "bestiary",
  spells: "spells",
  items: "items",
  races: "races",
  classes: "classes",
  rules: "variantrules",
  feats: "feats",
};

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return Array.from(new Set(
    sources
      .map((source) => String(source || "").trim().toUpperCase())
      .filter((source) => /^[A-Z0-9-]{2,24}$/.test(source))
  )).slice(0, 100);
}

async function getAllowedSources() {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!setting?.value) return [];

  try {
    return normalizeSources(JSON.parse(setting.value));
  } catch (err) {
    logger.warn("api:reference", "Invalid reference source settings ignored", { error: err.message });
    return [];
  }
}

async function setAllowedSources(sources) {
  const allowedSources = normalizeSources(sources);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(allowedSources) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(allowedSources) },
  });
  return allowedSources;
}

function withReferenceImage(item, category) {
  if (!item || typeof item !== "object") return item;

  const section = IMAGE_SECTIONS[String(category || "").toLowerCase()];
  if (!section || !item.name) return item;

  const match = tokenImageLookup.findReferenceImage({
    name: item.name,
    source: item.source,
    section,
    excludeTokens: true,
  });
  const tokenMatch = section === "bestiary"
    ? tokenImageLookup.findReferenceImage({
        name: item.name,
        source: item.source,
        section,
        preferToken: true,
        tokenOnly: true,
      })
    : null;

  if (!match && !tokenMatch) return item;
  return {
    ...item,
    imageUrl: match?.url,
    imageMatchCount: match?.matchCount,
    tokenUrl: tokenMatch?.url,
    tokenMatchCount: tokenMatch?.matchCount,
  };
}

function imageHrefToUrl(image) {
  const imagePath = image?.href?.type === "internal" ? image.href.path : "";
  if (!imagePath || typeof imagePath !== "string") return "";
  // Build URL pointing to 5e.tools CDN: https://5e.tools/img/{path}
  const parts = imagePath.split("/").map(encodeURIComponent).join("/");
  return `https://5e.tools/img/${parts}`;
}

function withReferenceInfo(item, category, allowedSources) {
  if (String(category || "").toLowerCase() !== "monsters") return item;

  const fluff = referenceSearch.getMonsterFluffByName(item.name, item.source, {
    sources: allowedSources,
  });

  if (!fluff) return item;
  const infoImageUrls = Array.isArray(fluff.images)
    ? fluff.images.map(imageHrefToUrl).filter(Boolean)
    : [];

  return {
    ...item,
    imageUrl: item.imageUrl || infoImageUrls[0],
    infoName: fluff.name,
    infoSource: fluff.source,
    infoEntries: fluff.entries,
    infoImages: fluff.images,
    infoImageUrls,
  };
}

// ---------------------------------------------------------------------------
// GET /api/reference/status  Retrieve repository and sync status
// ---------------------------------------------------------------------------
router.get("/status", requireDm, async (req, res) => {
  try {
    const status = referenceSync.getStatus();
    const allowedSources = await getAllowedSources();
    res.json({ ...status, allowedSources });
  } catch (err) {
    logger.error("api:reference", "Error in GET /api/reference/status", { error: err.message });
    res.status(500).json({ error: "Failed to retrieve sync status." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/settings  Retrieve DM-controlled source filters
// ---------------------------------------------------------------------------
router.get("/settings", requireDm, async (req, res) => {
  try {
    const allowedSources = await getAllowedSources();
    const availableSources = referenceSearch.listAvailableSources();
    res.json({ allowedSources, availableSources });
  } catch (err) {
    logger.error("api:reference", "Error in GET /api/reference/settings", { error: err.message });
    res.status(500).json({ error: "Failed to retrieve reference settings." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/reference/settings  Update allowed 5etools source books
// ---------------------------------------------------------------------------
router.put("/settings", requireDm, async (req, res) => {
  try {
    const allowedSources = await setAllowedSources(req.body?.allowedSources);
    referenceSearch.clearCache();
    res.json({ success: true, allowedSources });
  } catch (err) {
    logger.error("api:reference", "Error in PUT /api/reference/settings", { error: err.message });
    res.status(500).json({ error: "Failed to save reference settings." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reference/clear-cache  Clear disk and memory cache
// ---------------------------------------------------------------------------
router.post("/clear-cache", requireDm, (req, res) => {
  try {
    referenceSync.clearDiskCache();
    referenceSearch.clearCache();
    tokenImageLookup.clearCache();
    res.json({ success: true, message: "Cache cleared." });
  } catch (err) {
    logger.error("api:reference", "Error clearing cache", { error: err.message });
    res.status(500).json({ error: "Failed to clear cache." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reference/sync  Trigger background HTTP cache refresh
// ---------------------------------------------------------------------------
router.post("/sync", requireDm, (req, res) => {
  try {
    const status = referenceSync.getStatus();
    if (status.isSyncing) {
      return res.status(400).json({ error: "Sync is already in progress." });
    }

    // Trigger cache refresh in background
    referenceSync.sync()
      .then(() => {
        // Clear in-memory cache so next search uses fresh data
        referenceSearch.clearCache();
        tokenImageLookup.clearCache();
      })
      .catch((err) => {
        logger.error("api:reference", "Background cache refresh failed", { error: err.message });
      });

    res.json({ success: true, message: "Reference cache refresh started in the background." });
  } catch (err) {
    logger.error("api:reference", "Error in POST /api/reference/sync", { error: err.message });
    res.status(500).json({ error: "Failed to start cache refresh." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/search  Search D&D reference files
// Query params: ?category=spells|monsters|items|races|classes|rules&q=fireball&limit=50
// ---------------------------------------------------------------------------
router.get("/search", async (req, res) => {
  try {
    const { category, q, limit, summary } = req.query;

    if (!category) {
      return res.status(400).json({ error: "Category query parameter is required." });
    }

    const maxResults = limit ? Math.min(200, Math.max(1, Number(limit))) : 50;
    const allowedSources = await getAllowedSources();
    // Support summary=false for full item data (used by Character Builder Wizard)
    const searchOpts = { sources: allowedSources };
    if (String(summary).toLowerCase() === "false") {
      searchOpts.summary = false;
    }
    const results = referenceSearch
      .search(category, q || "", maxResults, searchOpts)
      .map((item) => withReferenceImage(item, category));

    // Augment results with homebrew entries matching the category
    const categoryToHomebrewType = {
      spells: "SPELL",
      monsters: "MONSTER",
      items: "MAGIC_ITEM",
      races: "RACE",
      classes: "CLASS",
      feats: "FEAT",
    };
    const homebrewType = categoryToHomebrewType[String(category).toLowerCase()];
    if (homebrewType) {
      try {
        const query = String(q || "").toLowerCase();
        const homebrewEntries = await prisma.homebrewEntry.findMany({
          where: {
            type: homebrewType,
            isActive: true,
            ...(query ? { name: { contains: query } } : {}),
          },
          take: maxResults,
          orderBy: { updatedAt: "desc" },
        });
        for (const entry of homebrewEntries) {
          let content;
          try { content = JSON.parse(entry.content || "{}"); } catch { content = {}; }
          const homebrewItem = {
            name: entry.name,
            source: entry.source || "Homebrew",
            homebrew: true,
            homebrewId: entry.id,
            _homebrew: true,
            description: content.description || "",
            ...(homebrewType === "SPELL" ? {
              level: content.level ?? 0,
              school: content.school || "",
              castingTime: content.castingTime || "",
              range: content.range || "",
              duration: content.duration || "",
              components: content.components || "",
            } : {}),
            ...(homebrewType === "MONSTER" ? {
              cr: content.cr || "0",
              type: content.type || "",
              ac: content.ac || 10,
              hp: content.hp || { average: 10 },
            } : {}),
            ...(homebrewType === "MAGIC_ITEM" ? {
              type: content.type || "",
              rarity: content.rarity || "",
              attunement: content.attunement || false,
            } : {}),
            ...(homebrewType === "RACE" ? {
              abilityBonuses: content.abilityBonuses || {},
              speed: content.speed || 30,
              size: content.size || "Medium",
              traits: content.traits || [],
            } : {}),
            ...(homebrewType === "CLASS" ? {
              hitDie: content.hitDie || "d8",
              proficiencies: content.proficiencies || {},
              spellcastingAbility: content.spellcastingAbility || "",
            } : {}),
            ...(homebrewType === "FEAT" ? {
              prerequisites: content.prerequisites || [],
              abilityBonus: content.abilityBonus || {},
            } : {}),
          };
          results.push(homebrewItem);
        }
      } catch (hbErr) {
        // Homebrew augmentation is best-effort
        logger.error("api:reference", "Error augmenting with homebrew entries", { error: hbErr.message });
      }
    }

    res.json(results);
  } catch (err) {
    logger.error("api:reference", "Error in GET /api/reference/search", { error: err.message });
    res.status(500).json({ error: "Failed to perform reference search." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/detail  Retrieve one full reference record
// Query params: ?category=monsters&name=Goblin&source=MM
// ---------------------------------------------------------------------------
router.get("/detail", async (req, res) => {
  try {
    const { category, name, source } = req.query;
    if (!category || !name || typeof category !== "string" || typeof name !== "string") {
      return res.status(400).json({ error: "Category and name query parameters are required." });
    }

    const allowedSources = await getAllowedSources();
    const item = referenceSearch.getByName(category, name, typeof source === "string" ? source : "", {
      sources: allowedSources,
    });

    if (item) {
      return res.json(withReferenceInfo(withReferenceImage(item, category), category, allowedSources));
    }

    // Fallback: try to find a homebrew entry by name
    const categoryToHomebrewType = {
      spells: "SPELL",
      monsters: "MONSTER",
      items: "MAGIC_ITEM",
      races: "RACE",
      classes: "CLASS",
      feats: "FEAT",
    };
    const hbType = categoryToHomebrewType[String(category).toLowerCase()];
    if (hbType) {
      const homebrewEntry = await prisma.homebrewEntry.findFirst({
        where: { type: hbType, name: { equals: name }, isActive: true },
      });
      if (homebrewEntry) {
        let content;
        try { content = JSON.parse(homebrewEntry.content || "{}"); } catch { content = {}; }
        return res.json({
          name: homebrewEntry.name,
          source: homebrewEntry.source || "Homebrew",
          homebrew: true,
          homebrewId: homebrewEntry.id,
          ...content,
        });
      }
    }

    return res.status(404).json({ error: "Reference entry not found." });
  } catch (err) {
    logger.error("api:reference", "Error in GET /api/reference/detail", { error: err.message });
    res.status(500).json({ error: "Failed to retrieve reference detail." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reference/token-image  Resolve a monster portrait from 5etools images
// Query params: ?name=Goblin&source=MM
// ---------------------------------------------------------------------------
router.get("/token-image", (req, res) => {
  try {
    const { name, source } = req.query;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Monster name query parameter is required." });
    }

    const match = tokenImageLookup.findMonsterTokenImage({
      name: name.trim(),
      source: typeof source === "string" ? source.trim() : "",
    });

    if (!match) {
      return res.status(404).json({ error: "No token image found for this monster." });
    }

    res.json(match);
  } catch (err) {
    logger.error("api:reference", "Error in GET /api/reference/token-image", { error: err.message });
    res.status(500).json({ error: "Failed to resolve token image." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reference/import  Import a reference item into the database (DM only)
// ---------------------------------------------------------------------------
router.post("/import", requireDm, async (req, res) => {
  try {
    const { category, name, source } = req.body;
    if (!category || !name || typeof category !== "string" || typeof name !== "string") {
      return res.status(400).json({ error: "Category and name are required." });
    }

    const cleanSource = typeof source === "string" ? source : "";
    const allowedSources = await getAllowedSources();

    const rawItem = referenceSearch.getByName(category, name, cleanSource, {
      sources: allowedSources,
    });

    if (!rawItem) {
      return res.status(404).json({ error: "Reference item not found in raw repository." });
    }

    const item = withReferenceInfo(withReferenceImage(rawItem, category), category, allowedSources);

    let localImageUrl = "";
    let localLargeImageUrl = "";

    if (item.tokenUrl) {
      localImageUrl = await copyReferenceImage(item.tokenUrl);
    }
    if (item.imageUrl) {
      localLargeImageUrl = await copyReferenceImage(item.imageUrl);
    }

    if (!localImageUrl) {
      localImageUrl = localLargeImageUrl;
    }

    if (category.toLowerCase() === "monsters") {
      const existing = await prisma.monster.findFirst({
        where: { name: item.name },
      });
      if (existing) {
        return res.status(400).json({ error: `Monster "${item.name}" is already imported.` });
      }

      const actions = [];
      if (Array.isArray(item.action)) {
        for (const act of item.action) {
          const entriesStr = Array.isArray(act.entries) ? act.entries.join(" ") : String(act.entries || "");
          const hitMatch = entriesStr.match(/\{@hit (\d+)\}/);
          const toHit = hitMatch ? parseInt(hitMatch[1], 10) : 0;
          const dmgMatch = entriesStr.match(/\{@damage ([^}]+)\}/);
          const damage = dmgMatch ? dmgMatch[1].trim() : "";

          actions.push({
            name: act.name || "Action",
            description: entriesStr.replace(/\{@[a-z]+ ([^}]+)\}/g, "$1").replace(/\{@hit (\d+)\}/g, "+$1").replace(/\{@damage ([^}]+)\}/g, "$1"),
            toHit,
            damage,
          });
        }
      }

      const hpVal = clampInt(item.hp?.average, 10, 1, 10000);
      const acVal = Array.isArray(item.ac)
        ? clampInt(item.ac[0]?.ac ?? item.ac[0], 10, 0, 1000)
        : 10;

      const modifiers = {
        strength: `${getModifier(item.str) >= 0 ? "+" : ""}${getModifier(item.str)}`,
        dexterity: `${getModifier(item.dex) >= 0 ? "+" : ""}${getModifier(item.dex)}`,
        constitution: `${getModifier(item.con) >= 0 ? "+" : ""}${getModifier(item.con)}`,
        intelligence: `${getModifier(item.int) >= 0 ? "+" : ""}${getModifier(item.int)}`,
        wisdom: `${getModifier(item.wis) >= 0 ? "+" : ""}${getModifier(item.wis)}`,
        charisma: `${getModifier(item.cha) >= 0 ? "+" : ""}${getModifier(item.cha)}`,
      };

      const monster = await prisma.monster.create({
        data: {
          name: item.name,
          race: monsterTypeLabel(item.type),
          class: "Monster",
          level: Math.max(1, Math.floor(hpVal / 6)),
          hp: hpVal,
          maxHp: hpVal,
          ac: acVal,
          cr: String(item.cr || "0"),
          imageUrl: localImageUrl,
          largeImageUrl: localLargeImageUrl,
          strength: clampInt(item.str, 10, 1, 100),
          dexterity: clampInt(item.dex, 10, 1, 100),
          constitution: clampInt(item.con, 10, 1, 100),
          intelligence: clampInt(item.int, 10, 1, 100),
          wisdom: clampInt(item.wis, 10, 1, 100),
          charisma: clampInt(item.cha, 10, 1, 100),
          inventory: "[]",
          modifiers: JSON.stringify(modifiers),
          actions: JSON.stringify(actions),
          description: item.infoEntries ? cleanText(Array.isArray(item.infoEntries) ? item.infoEntries.join("\n") : String(item.infoEntries)) : "",
          alignment: parseAlignmentField(item.alignment),
          appearance: "Physical details.",
          personality: "Mannerisms and demeanor.",
          history: "Backstory.",
          partyRelationship: "",
          isVisibleToPlayers: false,
        },
      });

      return res.json({ success: true, type: "monster", item: monster });
    }
      const wikiCategory = category.toUpperCase().slice(0, -1);
      const finalCategory = wikiCategory === "RULE" ? "RULE" : wikiCategory === "CLAS" ? "CLASS" : wikiCategory;

      const existing = await prisma.wikiArticle.findFirst({
        where: { title: item.name, category: finalCategory },
      });
      if (existing) {
        return res.status(400).json({ error: `Wiki Article "${item.name}" is already imported under ${finalCategory}.` });
      }

      let contentMarkdown = "";
      if (item.entries) {
        contentMarkdown = formatEntriesToMarkdown(item.entries);
      } else if (item.entry) {
        contentMarkdown = formatEntriesToMarkdown(item.entry);
      } else if (item.description) {
        contentMarkdown = formatEntriesToMarkdown(item.description);
      }

      let detailsHeader = "";
      if (finalCategory === "SPELL") {
        detailsHeader = `**Level**: ${item.level === 0 ? "Cantrip" : `Level ${item.level}`}  \n` +
          `**Casting Time**: ${item.time?.[0]?.number} ${item.time?.[0]?.unit}  \n` +
          `**Range**: ${item.range?.distance?.amount || ""} ${item.range?.distance?.type || item.range?.type || ""}  \n` +
          `**Duration**: ${item.duration?.[0]?.duration?.amount || ""} ${item.duration?.[0]?.duration?.type || item.duration?.[0]?.type || ""}  \n\n`;
      } else if (finalCategory === "ITEM") {
        detailsHeader = `**Type**: ${item.type || "Item"}  \n` +
          `**Rarity**: ${item.rarity || "Common"}  \n` +
          `**Weight**: ${item.weight || "0"} lbs  \n` +
          `**Value**: ${item.value || "0 gp"}  \n\n`;
      }

      let imageMarkdown = "";
      if (localLargeImageUrl) {
        imageMarkdown = `![${item.name}](${localLargeImageUrl})\n\n`;
      }

      const wikiArticle = await prisma.wikiArticle.create({
        data: {
          title: item.name,
          content: `${imageMarkdown}${detailsHeader}${contentMarkdown}`,
          isVisibleToPlayers: true,
          category: finalCategory,
          tags: JSON.stringify(["imported", item.source || ""]),
        },
      });

      return res.json({ success: true, type: "wiki", item: wikiArticle });

  } catch (err) {
    logger.error("api:reference", "Error in POST /api/reference/import", { error: err.message });
    res.status(500).json({ error: `Failed to import reference: ${err.message}` });
  }
});

// Helper utilities for importing
async function copyReferenceImage(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== "string") return "";

  // If it's a 5e.tools URL, download it
  if (sourceUrl.startsWith("https://5e.tools/img/")) {
    return downloadReferenceImage(sourceUrl);
  }

  // Legacy: if it's an uploads URL, return as-is (already local)
  if (sourceUrl.startsWith("/uploads/")) {
    return sourceUrl;
  }

  // Otherwise, treat any http/https URL as a remote image to download
  if (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
    return downloadReferenceImage(sourceUrl);
  }

  return "";
}

/**
 * Downloads an image from a remote URL to the local uploads directory.
 */
function downloadReferenceImage(url) {
  return new Promise((resolve) => {
    const https = require("https");
    const http = require("http");
    const protocol = url.startsWith("https") ? https : http;

    const destDir = path.resolve(__dirname, "../../uploads");
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const urlObj = new URL(url);
    const ext = path.extname(urlObj.pathname) || ".webp";
    const base = path.basename(urlObj.pathname, ext);
    const uniqueName = `imported_${base.replace(/[^a-z0-9]+/gi, "_")}_${Date.now()}${ext}`;
    const destFilePath = path.join(destDir, uniqueName);

    protocol.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        logger.error("api:reference", "Failed to download reference image", { url, status: res.statusCode });
        resolve("");
        return;
      }

      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadReferenceImage(res.headers.location));
        return;
      }

      const fileStream = fs.createWriteStream(destFilePath);
      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close();
        // Verify the file is valid
        const stats = fs.statSync(destFilePath);
        if (stats.size === 0) {
          fs.unlinkSync(destFilePath);
          logger.error("api:reference", "Downloaded image is empty", { url });
          resolve("");
        } else {
          logger.info("api:reference", "Downloaded reference image", { url, dest: destFilePath, size: stats.size });
          resolve(`/uploads/${uniqueName}`);
        }
      });

      fileStream.on("error", (err) => {
        fs.unlink(destFilePath, () => {});
        logger.error("api:reference", "Error writing downloaded image", { error: err.message, url });
        resolve("");
      });
    }).on("error", (err) => {
      logger.error("api:reference", "Error downloading reference image", { error: err.message, url });
      resolve("");
    }).on("timeout", function () {
      this.destroy();
      logger.error("api:reference", "Timeout downloading reference image", { url });
      resolve("");
    });
  });
}

function getModifier(val) {
  const score = val !== undefined && val !== null ? Number(val) : 10;
  return Math.floor((score - 10) / 2);
}

function clampInt(val, def, min, max) {
  const num = Number(val);
  if (isNaN(num)) return def;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function monsterTypeLabel(type) {
  if (!type) return "Monster";
  if (typeof type === "string") return type;
  if (type.type) {
    if (Array.isArray(type.tags) && type.tags.length > 0) {
      return `${type.type} (${type.tags.join(", ")})`;
    }
    return type.type;
  }
  return "Monster";
}

function cleanText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\{@spell ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@dice ([^}|]+)[^}]*\}/g, "($1)")
    .replace(/\{@item ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@creature ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@condition ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@filter ([^|]+)\|[^}]+\}/g, "$1")
    .replace(/\{@table ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@style ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@[a-z]+ ([^}|]+)[^}]*\}/g, "$1");
}

function formatEntriesToMarkdown(entries) {
  if (!entries) return "";
  if (typeof entries === "string") return cleanText(entries);
  if (Array.isArray(entries)) {
    return entries.map((entry) => {
      if (typeof entry === "string") return cleanText(entry);
      if (!entry || typeof entry !== "object") return "";

      if (entry.type === "list" && Array.isArray(entry.items)) {
        return entry.items.map((item) => `* ${typeof item === "string" ? cleanText(item) : formatEntriesToMarkdown(item.entries || item)}`).join("\n");
      }
      if ((entry.type === "entries" || entry.type === "section") && Array.isArray(entry.entries)) {
        const header = entry.name ? `### ${entry.name}\n\n` : "";
        return `${header}${formatEntriesToMarkdown(entry.entries)}`;
      }
      if (entry.type === "item" && entry.entry) {
        const header = entry.name ? `**${cleanText(entry.name)}**: ` : "";
        return `${header}${cleanText(entry.entry)}`;
      }
      if (entry.type === "insetReadaloud" && Array.isArray(entry.entries)) {
        return `> ${formatEntriesToMarkdown(entry.entries).replace(/\n/g, "\n> ")}`;
      }
      if (entry.type === "quote" && Array.isArray(entry.entries)) {
        const byLine = entry.by ? `\n\n— *${cleanText(entry.by)}*` : "";
        return `> ${formatEntriesToMarkdown(entry.entries).replace(/\n/g, "\n> ")}${byLine}`;
      }
      if (entry.type === "table" && Array.isArray(entry.rows)) {
        let tableStr = "";
        if (entry.caption) tableStr += `##### ${entry.caption}\n\n`;
        if (entry.colLabels) {
          tableStr += `| ${entry.colLabels.map(cleanText).join(" | ")} |\n`;
          tableStr += `| ${entry.colLabels.map(() => "---").join(" | ")} |\n`;
        }
        tableStr += entry.rows.map((row) => `| ${row.map(cleanText).join(" | ")} |`).join("\n");
        return tableStr;
      }
      if (entry.name && entry.entries) {
        return `### ${cleanText(entry.name)}\n\n${formatEntriesToMarkdown(entry.entries)}`;
      }
      return "";
    }).join("\n\n");
  }
  if (typeof entries === "object") {
    if (entries.entries) return formatEntriesToMarkdown(entries.entries);
    if (entries.name) return cleanText(entries.name);
  }
  return "";
}

function parseAlignmentField(alignment) {
  if (!alignment) return "Unaligned";
  if (typeof alignment === "string") return alignment;
  if (!Array.isArray(alignment)) return "Unaligned";

  const codes = alignment.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && Array.isArray(item.alignment)) {
      return item.alignment;
    }
    return "";
  }).flat().filter(Boolean);

  if (codes.length === 0) return "Unaligned";
  if (codes.includes("A")) return "Any alignment";
  if (codes.includes("U")) return "Unaligned";

  const mapping = {
    L: "Lawful",
    C: "Chaotic",
    G: "Good",
    E: "Evil",
    N: "Neutral"
  };

  if (codes.length === 1 && codes[0] === "N") return "Neutral";

  const words = codes.map(c => mapping[c] || c);
  return words.join(" ");
}

module.exports = router;
