// =============================================================================
// Tablecast — AI Shared Helpers: Session
// Session AI context loader
// =============================================================================
"use strict";

const prisma = require("../../prisma");
const { parseJsonArray } = require("./formatting");

// ---------------------------------------------------------------------------
// Session AI Context Loader
// ---------------------------------------------------------------------------
async function loadSessionAiContext(sessionId) {
  const id = Number(sessionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("sessionId must be a valid positive number.");
  }

  const session = await prisma.gameSession.findUnique({ where: { id } });
  if (!session) {
    throw new Error("Session not found.");
  }

  const [chatMessages, linkedWikiIds, linkedEncounterIds] = await Promise.all([
    prisma.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    Promise.resolve(parseJsonArray(session.linkedWikiIds)),
    Promise.resolve(parseJsonArray(session.linkedEncounterIds)),
  ]);

  const [wikiArticles, encounters] = await Promise.all([
    linkedWikiIds.length
      ? prisma.wikiArticle.findMany({
          where: { id: { in: linkedWikiIds } },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    linkedEncounterIds.length
      ? prisma.encounter.findMany({
          where: { id: { in: linkedEncounterIds } },
          include: { participants: { select: { id: true } } },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return { session, chatMessages: chatMessages.reverse(), wikiArticles, encounters };
}

module.exports = { loadSessionAiContext };
