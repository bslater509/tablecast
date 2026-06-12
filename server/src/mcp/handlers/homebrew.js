// =============================================================================
// Tablecast MCP — Homebrew Entry Tool Handlers
// =============================================================================
"use strict";

const VALID_HOMEBREW_TYPES = new Set(["RACE", "CLASS", "FEAT", "SPELL", "MAGIC_ITEM", "MONSTER"]);

async function handleListHomebrew(args, { prisma, parseJsonArray, parseJsonObject }) {
  const where = {};
  if (args.type !== undefined) {
    const type = String(args.type).toUpperCase();
    if (!VALID_HOMEBREW_TYPES.has(type)) {
      throw new Error(`Homebrew type must be one of: ${[...VALID_HOMEBREW_TYPES].join(", ")}`);
    }
    where.type = type;
  }
  if (args.active === true) {
    where.isActive = true;
  }

  const entries = await prisma.homebrewEntry.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  const parsed = entries.map((e) => ({
    ...e,
    content: parseJsonObject(e.content),
    tags: parseJsonArray(e.tags),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

async function handleCreateHomebrew(args, { prisma }) {
  const { type, name, source, version, content, tags, isActive } = args;

  const entryType = String(type || "").toUpperCase();
  if (!entryType || !VALID_HOMEBREW_TYPES.has(entryType)) {
    throw new Error(`Homebrew type must be one of: ${[...VALID_HOMEBREW_TYPES].join(", ")}`);
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Homebrew entry name is required.");
  }

  const data = {
    type: entryType,
    name: name.trim(),
    source: source || "",
    version: version || "1.0.0",
    content: content !== undefined ? JSON.stringify(content) : "{}",
    tags: tags !== undefined ? JSON.stringify(tags) : "[]",
    isActive: isActive !== false,
  };

  const entry = await prisma.homebrewEntry.create({ data });

  const parsed = {
    ...entry,
    content: JSON.parse(entry.content || "{}"),
    tags: JSON.parse(entry.tags || "[]"),
  };

  return {
    content: [{ type: "text", text: `Homebrew entry created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleUpdateHomebrew(args, { prisma }) {
  const { id, type, name, source, version, content, tags, isActive } = args;

  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new Error("Homebrew entry id must be a valid positive number.");
  }

  const existing = await prisma.homebrewEntry.findUnique({ where: { id: entryId } });
  if (!existing) {
    throw new Error(`Homebrew entry with ID ${entryId} not found.`);
  }

  const data = {};

  if (type !== undefined) {
    const t = String(type).toUpperCase();
    if (!VALID_HOMEBREW_TYPES.has(t)) {
      throw new Error(`Homebrew type must be one of: ${[...VALID_HOMEBREW_TYPES].join(", ")}`);
    }
    data.type = t;
  }
  if (name !== undefined) {
    if (!String(name || "").trim()) {
      throw new Error("name must be a non-empty string.");
    }
    data.name = String(name).trim();
  }
  if (source !== undefined) data.source = source;
  if (version !== undefined) data.version = version;
  if (content !== undefined) data.content = JSON.stringify(content);
  if (tags !== undefined) data.tags = JSON.stringify(tags);
  if (isActive !== undefined) data.isActive = isActive === true;

  if (Object.keys(data).length === 0) {
    throw new Error("No valid fields provided to update.");
  }

  const entry = await prisma.homebrewEntry.update({ where: { id: entryId }, data });

  const parsed = {
    ...entry,
    content: JSON.parse(entry.content || "{}"),
    tags: JSON.parse(entry.tags || "[]"),
  };

  return {
    content: [{ type: "text", text: `Homebrew entry updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleDeleteHomebrew(args, { prisma }) {
  const { id } = args;

  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new Error("Homebrew entry id must be a valid positive number.");
  }

  await prisma.homebrewEntry.delete({ where: { id: entryId } });

  return {
    content: [{ type: "text", text: `Homebrew entry with ID ${entryId} deleted successfully.` }],
  };
}

module.exports = {
  handleListHomebrew,
  handleCreateHomebrew,
  handleUpdateHomebrew,
  handleDeleteHomebrew,
};
