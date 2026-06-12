// =============================================================================
// Tablecast MCP — Quest Tool Handlers
// =============================================================================
"use strict";

const VALID_QUEST_STATUSES = new Set(["ACTIVE", "COMPLETED", "FAILED"]);

async function handleListQuests(args, { prisma, parseJsonArray, parseJsonObject }) {
  const filter = {};
  if (args.status !== undefined) {
    const status = String(args.status).toUpperCase();
    if (!VALID_QUEST_STATUSES.has(status)) {
      throw new Error("Quest status must be ACTIVE, COMPLETED, or FAILED.");
    }
    filter.status = status;
  }

  const quests = await prisma.quest.findMany({
    where: filter,
    orderBy: { updatedAt: "desc" },
  });

  const parsed = quests.map((q) => ({
    ...q,
    objectives: parseJsonArray(q.objectives),
    rewards: parseJsonObject(q.rewards),
    assignedToCharacterIds: parseJsonArray(q.assignedToCharacterIds),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
// eslint-disable-next-line unused-imports/no-unused-vars
async function handleCreateQuest(args, { prisma, toJsonArrayString, toJsonObjectString }) {
  const {
    title,
    description,
    status,
    objectives,
    rewards,
    questGiverNpcId,
    parentQuestId,
    isVisibleToPlayers,
  } = args;

  if (!title || typeof title !== "string" || !title.trim()) {
    throw new Error("Quest title is required.");
  }

  const nextStatus = status ? String(status).toUpperCase() : "ACTIVE";
  if (!VALID_QUEST_STATUSES.has(nextStatus)) {
    throw new Error("Quest status must be ACTIVE, COMPLETED, or FAILED.");
  }

  const data = {
    title: title.trim(),
    description: description || "",
    status: nextStatus,
    objectives: objectives !== undefined ? JSON.stringify(objectives) : "[]",
    rewards: rewards !== undefined ? JSON.stringify(rewards) : "{}",
    isVisibleToPlayers: isVisibleToPlayers === true,
  };

  if (questGiverNpcId !== undefined && questGiverNpcId !== null) {
    data.questGiverNpcId = Number(questGiverNpcId);
  }

  if (parentQuestId !== undefined && parentQuestId !== null) {
    data.parentQuestId = Number(parentQuestId);
  }

  const quest = await prisma.quest.create({ data });

  const parsed = {
    ...quest,
    objectives: JSON.parse(quest.objectives || "[]"),
    rewards: JSON.parse(quest.rewards || "{}"),
    assignedToCharacterIds: JSON.parse(quest.assignedToCharacterIds || "[]"),
  };

  return {
    content: [{ type: "text", text: `Quest created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleUpdateQuest(args, { prisma }) {
  const { id, title, description, status, objectives, rewards, questGiverNpcId, parentQuestId, isVisibleToPlayers } = args;

  const questId = Number(id);
  if (!Number.isInteger(questId) || questId <= 0) {
    throw new Error("Quest id must be a valid positive number.");
  }

  const existing = await prisma.quest.findUnique({ where: { id: questId } });
  if (!existing) {
    throw new Error(`Quest with ID ${questId} not found.`);
  }

  const data = {};

  if (title !== undefined) {
    if (!String(title || "").trim()) {
      throw new Error("title must be a non-empty string.");
    }
    data.title = String(title).trim();
  }

  if (description !== undefined) {
    data.description = String(description);
  }

  if (status !== undefined) {
    const nextStatus = String(status).toUpperCase();
    if (!VALID_QUEST_STATUSES.has(nextStatus)) {
      throw new Error("Quest status must be ACTIVE, COMPLETED, or FAILED.");
    }
    data.status = nextStatus;
  }

  if (objectives !== undefined) {
    data.objectives = JSON.stringify(objectives);
  }

  if (rewards !== undefined) {
    data.rewards = JSON.stringify(rewards);
  }

  if (questGiverNpcId !== undefined) {
    data.questGiverNpcId = questGiverNpcId === null ? null : Number(questGiverNpcId);
  }

  if (parentQuestId !== undefined) {
    data.parentQuestId = parentQuestId === null ? null : Number(parentQuestId);
  }

  if (isVisibleToPlayers !== undefined) {
    data.isVisibleToPlayers = isVisibleToPlayers === true;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No valid quest fields provided to update.");
  }

  const quest = await prisma.quest.update({
    where: { id: questId },
    data,
  });

  const parsed = {
    ...quest,
    objectives: JSON.parse(quest.objectives || "[]"),
    rewards: JSON.parse(quest.rewards || "{}"),
    assignedToCharacterIds: JSON.parse(quest.assignedToCharacterIds || "[]"),
  };

  return {
    content: [{ type: "text", text: `Quest updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleDeleteQuest(args, { prisma }) {
  const { id } = args;

  const questId = Number(id);
  if (!Number.isInteger(questId) || questId <= 0) {
    throw new Error("Quest id must be a valid positive number.");
  }

  await prisma.quest.delete({ where: { id: questId } });

  return {
    content: [{ type: "text", text: `Quest with ID ${questId} deleted successfully.` }],
  };
}

module.exports = {
  handleListQuests,
  handleCreateQuest,
  handleUpdateQuest,
  handleDeleteQuest,
};
