// =============================================================================
// Tablecast MCP — Session Tool Handlers
// =============================================================================
"use strict";

async function handleListSessions(args, { prisma, parseJsonArray, VALID_SESSION_STATUSES }) {
  const filter = {};
  if (args.status !== undefined) {
    const status = String(args.status).toUpperCase();
    if (!VALID_SESSION_STATUSES.has(status)) {
      throw new Error("Session status must be PLANNED, ACTIVE, or COMPLETED.");
    }
    filter.status = status;
  }

  const sessions = await prisma.gameSession.findMany({
    where: filter,
    orderBy: [
      { sessionNumber: "asc" },
      { scheduledFor: "asc" },
      { createdAt: "desc" },
    ],
  });

  const parsed = sessions.map((session) => ({
    ...session,
    prepChecklist: parseJsonArray(session.prepChecklist),
    linkedWikiIds: parseJsonArray(session.linkedWikiIds),
    linkedMapIds: parseJsonArray(session.linkedMapIds),
    linkedEncounterIds: parseJsonArray(session.linkedEncounterIds),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

async function handleCreateSession(args, { prisma, parseJsonArray, toJsonArrayString, VALID_SESSION_STATUSES }) {
  const {
    title,
    sessionNumber,
    status,
    scheduledFor,
    agenda,
    recap,
    isVisibleToPlayers,
  } = args;

  if (!title || typeof title !== "string" || !title.trim()) {
    throw new Error("Session title is required.");
  }

  const nextStatus = status ? String(status).toUpperCase() : "PLANNED";
  if (!VALID_SESSION_STATUSES.has(nextStatus)) {
    throw new Error("Session status must be PLANNED, ACTIVE, or COMPLETED.");
  }

  const data = {
    title: title.trim(),
    status: nextStatus,
    prepChecklist: JSON.stringify([]),
    linkedWikiIds: JSON.stringify([]),
    linkedMapIds: JSON.stringify([]),
    linkedEncounterIds: JSON.stringify([]),
  };

  if (sessionNumber !== undefined && sessionNumber !== null && sessionNumber !== "") {
    const parsedNumber = Number(sessionNumber);
    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
      throw new Error("sessionNumber must be a positive integer.");
    }
    data.sessionNumber = parsedNumber;
  }

  if (scheduledFor !== undefined && scheduledFor !== null && scheduledFor !== "") {
    const parsedDate = new Date(scheduledFor);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error("scheduledFor must be a valid ISO date string.");
    }
    data.scheduledFor = parsedDate;
  }

  if (agenda !== undefined) data.agenda = String(agenda || "");
  if (recap !== undefined) data.recap = String(recap || "");
  if (isVisibleToPlayers !== undefined) data.isVisibleToPlayers = isVisibleToPlayers === true;

  const session = await prisma.gameSession.create({ data });

  const parsed = {
    ...session,
    prepChecklist: parseJsonArray(session.prepChecklist),
    linkedWikiIds: parseJsonArray(session.linkedWikiIds),
    linkedMapIds: parseJsonArray(session.linkedMapIds),
    linkedEncounterIds: parseJsonArray(session.linkedEncounterIds),
  };

  return {
    content: [{ type: "text", text: `Session created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

async function handleUpdateSession(args, { prisma, parseJsonArray, toJsonArrayString, VALID_SESSION_STATUSES }) {
  const {
    id,
    title,
    sessionNumber,
    status,
    scheduledFor,
    agenda,
    recap,
    isVisibleToPlayers,
    prepChecklist,
    linkedWikiIds,
    linkedMapIds,
    linkedEncounterIds,
  } = args;

  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new Error("Session id must be a valid positive number.");
  }

  const existing = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!existing) {
    throw new Error(`Session with ID ${sessionId} not found.`);
  }

  const data = {};

  if (title !== undefined) {
    if (!String(title || "").trim()) {
      throw new Error("title must be a non-empty string.");
    }
    data.title = String(title).trim();
  }

  if (sessionNumber !== undefined) {
    const parsedNumber = Number(sessionNumber);
    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
      throw new Error("sessionNumber must be a positive integer.");
    }
    data.sessionNumber = parsedNumber;
  }

  if (status !== undefined) {
    const nextStatus = String(status).toUpperCase();
    if (!VALID_SESSION_STATUSES.has(nextStatus)) {
      throw new Error("Session status must be PLANNED, ACTIVE, or COMPLETED.");
    }
    data.status = nextStatus;
  }

  if (scheduledFor !== undefined) {
    if (scheduledFor === null || scheduledFor === "") {
      data.scheduledFor = null;
    } else {
      const parsedDate = new Date(scheduledFor);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error("scheduledFor must be a valid ISO date string.");
      }
      data.scheduledFor = parsedDate;
    }
  }

  if (agenda !== undefined) data.agenda = String(agenda || "");
  if (recap !== undefined) data.recap = String(recap || "");
  if (isVisibleToPlayers !== undefined) data.isVisibleToPlayers = isVisibleToPlayers === true;

  if (prepChecklist !== undefined) {
    data.prepChecklist = toJsonArrayString(prepChecklist, "prepChecklist", []);
  }

  if (linkedWikiIds !== undefined) {
    data.linkedWikiIds = toJsonArrayString(linkedWikiIds, "linkedWikiIds", []);
  }
  if (linkedMapIds !== undefined) {
    data.linkedMapIds = toJsonArrayString(linkedMapIds, "linkedMapIds", []);
  }
  if (linkedEncounterIds !== undefined) {
    data.linkedEncounterIds = toJsonArrayString(linkedEncounterIds, "linkedEncounterIds", []);
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No valid session fields provided to update.");
  }

  if (data.status === "ACTIVE") {
    await prisma.gameSession.updateMany({
      where: { status: "ACTIVE", id: { not: sessionId } },
      data: { status: "COMPLETED" },
    });
  }

  const session = await prisma.gameSession.update({
    where: { id: sessionId },
    data,
  });

  const parsed = {
    ...session,
    prepChecklist: parseJsonArray(session.prepChecklist),
    linkedWikiIds: parseJsonArray(session.linkedWikiIds),
    linkedMapIds: parseJsonArray(session.linkedMapIds),
    linkedEncounterIds: parseJsonArray(session.linkedEncounterIds),
  };

  return {
    content: [{ type: "text", text: `Session updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
  };
}

module.exports = {
  handleListSessions,
  handleCreateSession,
  handleUpdateSession,
};
