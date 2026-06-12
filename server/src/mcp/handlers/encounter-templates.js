// =============================================================================
// Tablecast MCP — Encounter Template Tool Handlers
// =============================================================================
"use strict";

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard", "deadly"]);

async function handleListEncounterTemplates(args, { prisma, parseJsonArray }) {
  const filter = {};
  if (args.difficulty !== undefined) {
    const difficulty = String(args.difficulty).toLowerCase();
    if (!VALID_DIFFICULTIES.has(difficulty)) {
      throw new Error("Encounter template difficulty must be easy, medium, hard, or deadly.");
    }
    filter.difficulty = difficulty;
  }

  const templates = await prisma.encounterTemplate.findMany({
    where: filter,
    orderBy: { updatedAt: "desc" },
  });

  const parsed = templates.map((t) => ({
    ...t,
    tags: parseJsonArray(t.tags),
    participants: parseJsonArray(t.participants),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
async function handleCreateEncounterTemplate(args, { prisma, toJsonArrayString }) {
  const { name, description, difficulty, recommendedLevel, tags, participants, mapId } = args;

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Encounter template name is required.");
  }

  const nextDifficulty = difficulty ? String(difficulty).toLowerCase() : "medium";
  if (!VALID_DIFFICULTIES.has(nextDifficulty)) {
    throw new Error("Encounter template difficulty must be easy, medium, hard, or deadly.");
  }

  const data = {
    name: name.trim(),
    description: description || "",
    difficulty: nextDifficulty,
    recommendedLevel: recommendedLevel !== undefined ? Number(recommendedLevel) : 1,
    tags: tags !== undefined ? JSON.stringify(tags) : "[]",
    participants: participants !== undefined ? JSON.stringify(participants) : "[]",
  };

  if (mapId !== undefined && mapId !== null) {
    data.mapId = Number(mapId);
  }

  const template = await prisma.encounterTemplate.create({ data });

  const parsed = {
    ...template,
    tags: JSON.parse(template.tags || "[]"),
    participants: JSON.parse(template.participants || "[]"),
  };

  return {
    content: [{ type: "text", text: `Encounter template created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleUpdateEncounterTemplate(args, { prisma }) {
  const { id, name, description, difficulty, recommendedLevel, tags, participants, mapId } = args;

  const templateId = Number(id);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    throw new Error("Encounter template id must be a valid positive number.");
  }

  const existing = await prisma.encounterTemplate.findUnique({ where: { id: templateId } });
  if (!existing) {
    throw new Error(`Encounter template with ID ${templateId} not found.`);
  }

  const data = {};

  if (name !== undefined) {
    if (!String(name || "").trim()) {
      throw new Error("name must be a non-empty string.");
    }
    data.name = String(name).trim();
  }

  if (description !== undefined) {
    data.description = String(description);
  }

  if (difficulty !== undefined) {
    const nextDifficulty = String(difficulty).toLowerCase();
    if (!VALID_DIFFICULTIES.has(nextDifficulty)) {
      throw new Error("Encounter template difficulty must be easy, medium, hard, or deadly.");
    }
    data.difficulty = nextDifficulty;
  }

  if (recommendedLevel !== undefined) {
    data.recommendedLevel = Number(recommendedLevel);
  }

  if (tags !== undefined) {
    data.tags = JSON.stringify(tags);
  }

  if (participants !== undefined) {
    data.participants = JSON.stringify(participants);
  }

  if (mapId !== undefined) {
    data.mapId = mapId === null ? null : Number(mapId);
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No valid encounter template fields provided to update.");
  }

  const template = await prisma.encounterTemplate.update({
    where: { id: templateId },
    data,
  });

  const parsed = {
    ...template,
    tags: JSON.parse(template.tags || "[]"),
    participants: JSON.parse(template.participants || "[]"),
  };

  return {
    content: [{ type: "text", text: `Encounter template updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleDeleteEncounterTemplate(args, { prisma }) {
  const { id } = args;

  const templateId = Number(id);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    throw new Error("Encounter template id must be a valid positive number.");
  }

  await prisma.encounterTemplate.delete({ where: { id: templateId } });

  return {
    content: [{ type: "text", text: `Encounter template with ID ${templateId} deleted successfully.` }],
  };
}

async function handleApplyEncounterTemplate(args, { prisma, parseJsonArray }) {
  const { templateId, mapId: overrideMapId, name: encounterName } = args;

  // Validate templateId
  const tId = Number(templateId);
  if (!Number.isInteger(tId) || tId <= 0) {
    throw new Error("Encounter template id must be a valid positive number.");
  }

  // Fetch template
  const template = await prisma.encounterTemplate.findUnique({ where: { id: tId } });
  if (!template) {
    throw new Error("Encounter template not found.");
  }

  // Determine mapId: args ?? template ?? undefined
  const mapId = overrideMapId !== undefined ? Number(overrideMapId) : (template.mapId ?? undefined);

  // Create encounter
  const encounter = await prisma.encounter.create({
    data: {
      name: encounterName || template.name,
      status: "DRAFT",
      ...(mapId !== undefined ? { mapId } : {}),
    },
  });

  // Parse participants and create participant records
  const participants = parseJsonArray(template.participants);

  for (const entry of participants) {
    const count = Math.max(1, Math.round(Number(entry.count || 1)));
    const baseName = String(entry.name || "Combatant").trim();

    for (let i = 0; i < count; i++) {
      const label = count > 1 ? `${baseName} ${i + 1}` : baseName;
      await prisma.encounterParticipant.create({
        data: {
          encounterId: encounter.id,
          name: label,
          currentHp: 1,
          maxHp: 1,
          ac: 10,
          initiative: 0,
        },
      });
    }
  }

  // Fetch the encounter with participants included
  const result = await prisma.encounter.findUnique({
    where: { id: encounter.id },
    include: { participants: true },
  });

  return {
    content: [{ type: "text", text: `Encounter created from template successfully:\n${JSON.stringify(result, null, 2)}` }],
  };
}

module.exports = {
  handleListEncounterTemplates,
  handleCreateEncounterTemplate,
  handleUpdateEncounterTemplate,
  handleDeleteEncounterTemplate,
  handleApplyEncounterTemplate,
};
