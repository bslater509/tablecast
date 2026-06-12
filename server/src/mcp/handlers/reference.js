// =============================================================================
// Tablecast MCP — Reference Tool Handlers
// =============================================================================
"use strict";

// eslint-disable-next-line unused-imports/no-unused-vars
async function handleSearchReference(args, { prisma, referenceSearch, logError }) {
  const { category, query, limit } = args;
  const maxResults = limit ? Math.min(100, Math.max(1, limit)) : 10;

  // Fetch allowed sources from AppSettings
  const allowedSetting = await prisma.appSetting.findUnique({ where: { key: "reference.allowedSources" } });
  let allowedSources = [];
  if (allowedSetting?.value) {
    try {
      allowedSources = JSON.parse(allowedSetting.value);
    } catch (e) {}
  }

  const results = referenceSearch.search(category, query, maxResults, { sources: allowedSources });
  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
async function handleGetReferenceDetail(args, { prisma, referenceSearch, logError }) {
  const { category, name: refName, source } = args;

  const allowedSetting = await prisma.appSetting.findUnique({ where: { key: "reference.allowedSources" } });
  let allowedSources = [];
  if (allowedSetting?.value) {
    try {
      allowedSources = JSON.parse(allowedSetting.value);
    } catch (e) {}
  }

  const item = referenceSearch.getByName(category, refName, source || "", { sources: allowedSources });
  if (!item) {
    throw new Error(`D&D Reference entry not found for name '${refName}' in category '${category}'.`);
  }

  // For monsters, get fluff too if available
  if (category === "monsters") {
    const fluff = referenceSearch.getMonsterFluffByName(refName, source || "", { sources: allowedSources });
    if (fluff) {
      item.infoEntries = fluff.entries;
      item.infoName = fluff.name;
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
  };
}

module.exports = {
  handleSearchReference,
  handleGetReferenceDetail,
};
