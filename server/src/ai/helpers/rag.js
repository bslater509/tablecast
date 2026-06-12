// =============================================================================
// Tablecast — AI Shared Helpers: RAG
// Keyword-based RAG Rules Querying and campaign context retrieval
// =============================================================================
"use strict";

const prisma = require("../../prisma");
const referenceSearch = require("../../utils/referenceSearch");
const logger = require("../../utils/logger");
const { cleanText, stringifyEntries } = require("./formatting");

// ---------------------------------------------------------------------------
// Keyword-based RAG Rules Querying
// ---------------------------------------------------------------------------
async function findRelevantRules(message, user) {
  if (!message) return "";

  const excludedWords = new Set([
    "what", "with", "that", "your", "about", "the", "and", "for", "are", "but",
    "not", "you", "was", "out", "him", "her", "his", "who", "its", "can",
    "use", "has", "how", "why", "get", "set", "one", "two", "new", "old",
    "our", "any", "all", "she", "they", "them", "this", "from", "their", "there",
    "will", "would", "shall", "should", "some", "more", "most", "than", "then", "into"
  ]);

  const words = message.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => {
      if (excludedWords.has(w)) return false;
      return w.length > 2 || w === "ac" || w === "hp" || w === "cr";
    });

  if (words.length === 0) return "";

  const isDm = user?.role === "DM";

  // 1. Search Wiki Articles
  const matchedWiki = [];
  for (const word of words.slice(0, 5)) {
    try {
      const articles = await prisma.wikiArticle.findMany({
        where: {
          OR: [
            { title: { contains: word } },
            { content: { contains: word } },
            { tags: { contains: word } }
          ],
          ...(isDm ? {} : { isVisibleToPlayers: true })
        },
        take: 2
      });
      for (const art of articles) {
        if (!matchedWiki.some(a => a.id === art.id)) {
          matchedWiki.push(art);
        }
      }
    } catch (err) {
      logger.error("ai:rag", "Wiki search error", { error: err.message });
    }
  }

  // 2. Search Campaign NPCs
  const matchedNpcs = [];
  for (const word of words.slice(0, 5)) {
    try {
      const npcs = await prisma.npc.findMany({
        where: {
          OR: [
            { name: { contains: word } },
            { race: { contains: word } },
            { class: { contains: word } },
            { description: { contains: word } }
          ],
          ...(isDm ? {} : { isVisibleToPlayers: true })
        },
        take: 2
      });
      for (const npc of npcs) {
        if (!matchedNpcs.some(n => n.id === npc.id)) {
          matchedNpcs.push(npc);
        }
      }
    } catch (err) {
      logger.error("ai:rag", "NPC search error", { error: err.message });
    }
  }

  // 3. Search Core Rules
  const allowedSetting = await prisma.appSetting.findUnique({ where: { key: "reference.allowedSources" } });
  let allowedSources = [];
  if (allowedSetting?.value) {
    try {
      allowedSources = JSON.parse(allowedSetting.value);
    } catch (e) {}
  }

  const matches = [];
  const categories = ["rules", "spells", "monsters", "items"];

  for (const cat of categories) {
    for (const word of words.slice(0, 5)) {
      const results = referenceSearch.search(cat, word, 1, { sources: allowedSources, summary: false });
      if (results.length > 0) {
        matches.push({ category: cat, item: results[0] });
      }
    }
  }

  // Format matches into context
  let context = "";

  if (matchedWiki.length > 0) {
    context += "\n=== CAMPAIGN LORE & WIKI ===\n";
    for (const art of matchedWiki.slice(0, 3)) {
      context += `Title: ${art.title} | Category: ${art.category}\n`;
      context += `Content: ${art.content}\n\n`;
    }
  }

  if (matchedNpcs.length > 0) {
    context += "\n=== CAMPAIGN NPCs ===\n";
    for (const npc of matchedNpcs.slice(0, 3)) {
      context += `Name: ${npc.name} | Race: ${npc.race || "unknown"} | Class: ${npc.class || "NPC"}\n`;
      context += `- Description: ${npc.description}\n`;
      context += `- Personality: ${npc.personality}\n`;
      context += `- History: ${npc.history}\n\n`;
    }
  }

  if (matches.length > 0) {
    context += "\n=== D&D 5e REFERENCE DATA (LOCAL DATABASE) ===\n";
    const uniqueNames = new Set();

    for (const match of matches) {
      const {item} = match;
      if (uniqueNames.has(item.name)) continue;
      uniqueNames.add(item.name);

      context += `Category: ${match.category.toUpperCase()} | Name: ${item.name} | Source: ${item.source || "Unknown"}\n`;

      if (match.category === "spells") {
        context += `- Level: ${item.level === 0 ? "Cantrip" : item.level} spell | School: ${item.school || ""}\n`;
        context += `- Range: ${item.range?.type || ""} | Duration: ${item.duration?.[0]?.type || ""}\n`;
        context += `- Description: ${stringifyEntries(item.entries)}\n\n`;
      } else if (match.category === "monsters") {
        context += `- CR: ${item.cr || "0"} | AC: ${item.ac?.[0]?.ac || item.ac?.[0] || "10"} | HP: ${item.hp?.average || "10"}\n`;
        context += `- Stats: STR ${item.str} DEX ${item.dex} CON ${item.con} INT ${item.int} WIS ${item.wis} CHA ${item.cha}\n`;
        if (item.action) {
          context += `- Actions: ${item.action.map(a => `${a.name}: ${stringifyEntries(a.entries)}`).join("; ")}\n`;
        }
        context += "\n";
      } else if (match.category === "items") {
        context += `- Rarity: ${item.rarity || "Common"} | Weight: ${item.weight || 0} lbs | Value: ${item.value || "0 gp"}\n`;
        context += `- Description: ${stringifyEntries(item.entries)}\n\n`;
      } else {
        context += `- Details: ${stringifyEntries(item.entries || item.entry || item.description)}\n\n`;
      }
    }
  }

  if (context) {
    context = `\n=== RELEVANT CONTEXT ===\n${context}========================\n`;
  }

  return context;
}

async function fetchCampaignWikiSnippet(queryText, limit = 5) {
  const words = (queryText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  const articles = [];
  for (const word of words) {
    try {
      const found = await prisma.wikiArticle.findMany({
        where: {
          OR: [
            { title: { contains: word } },
            { content: { contains: word } },
            { tags: { contains: word } },
          ],
        },
        take: 2,
        orderBy: { updatedAt: "desc" },
      });
      for (const art of found) {
        if (!articles.some((a) => a.id === art.id)) articles.push(art);
      }
    } catch (err) {
      logger.error("ai:assist", "Wiki context lookup failed", { error: err.message });
    }
  }

  return articles.slice(0, limit).map((a) => {
    const snippet = (a.content || "").replace(/\s+/g, " ").slice(0, 220);
    return `- ${a.title} (${a.category}): ${snippet}${a.content?.length > 220 ? "…" : ""}`;
  }).join("\n");
}

module.exports = {
  findRelevantRules,
  fetchCampaignWikiSnippet,
};
