// =============================================================================
// Tablecast — Campaign Dashboard Route (4.6)
// Aggregates data from multiple models for the DM campaign overview.
// GET /api/dashboard
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

/**
 * GET /api/dashboard
 * Returns aggregated campaign data for the DM landing page.
 */
router.get("/", requireDm, async (req, res) => {
  try {
    const results = await Promise.all([
      // 1 — Active quests
      prisma.quest.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, title: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),

      // 2 — Encounters grouped by status
      prisma.encounter.groupBy({
        by: ["status"],
        _count: { id: true },
      }),

      // 3 — Upcoming sessions
      prisma.gameSession.findMany({
        where: {
          status: { in: ["PLANNED", "ACTIVE"] },
        },
        select: {
          id: true,
          title: true,
          sessionNumber: true,
          status: true,
          scheduledFor: true,
          agenda: true,
        },
        orderBy: { scheduledFor: "asc" },
        take: 5,
      }),

      // 4 — Recent chat messages
      prisma.chatMessage.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          sender: true,
          text: true,
          type: true,
          createdAt: true,
        },
      }),

      // 5 — All characters for party HP overview
      prisma.character.findMany({
        select: {
          id: true,
          name: true,
          race: true,
          class: true,
          level: true,
          hp: true,
          maxHp: true,
        },
        orderBy: { name: "asc" },
      }),

      // 6 — Entity counts
      prisma.map.count(),
      prisma.npc.count(),
      prisma.monster.count(),
      prisma.wikiArticle.count(),
      prisma.encounter.count({ where: { status: "ACTIVE" } }),
      prisma.gameSession.count({ where: { status: "ACTIVE" } }),

      // 7 — Recent rolls
      prisma.roll.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          sender: true,
          formula: true,
          total: true,
          createdAt: true,
        },
      }),
    ]);

    const [
      activeQuests,
      encounterGroups,
      upcomingSessions,
      recentChat,
      characters,
      mapCount,
      npcCount,
      monsterCount,
      wikiCount,
      activeEncounterCount,
      activeSessionCount,
      recentRolls,
    ] = results;

    // Build encounter counts map
    const encounterCounts = { DRAFT: 0, ACTIVE: 0, COMPLETE: 0 };
    for (const g of encounterGroups) {
      encounterCounts[g.status] = g._count.id;
    }

    // Compute party HP status
    const partyStatus = characters.map((c) => ({
      id: c.id,
      name: c.name,
      race: c.race,
      class: c.class,
      level: c.level,
      hp: c.hp,
      maxHp: c.maxHp,
      hpPercent: c.maxHp > 0 ? Math.round((c.hp / c.maxHp) * 100) : 100,
    }));

    // Build next session info
    const nextSession = upcomingSessions.find((s) => s.scheduledFor) || null;

    res.json({
      quests: {
        active: activeQuests,
        total: activeQuests.length,
      },
      encounters: {
        byStatus: encounterCounts,
        total: encounterCounts.DRAFT + encounterCounts.ACTIVE + encounterCounts.COMPLETE,
        active: activeEncounterCount,
      },
      sessions: {
        upcoming: upcomingSessions,
        nextSession,
        active: activeSessionCount,
      },
      chat: {
        recent: recentChat,
      },
      party: {
        characters: partyStatus,
        total: characters.length,
        totalHp: characters.reduce((sum, c) => sum + c.hp, 0),
        totalMaxHp: characters.reduce((sum, c) => sum + c.maxHp, 0),
      },
      stats: {
        maps: mapCount,
        npcs: npcCount,
        monsters: monsterCount,
        wikiArticles: wikiCount,
      },
      rolls: {
        recent: recentRolls,
      },
    });
  } catch (err) {
    logger.error("dashboard", "Failed to fetch dashboard data", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Failed to fetch dashboard data." });
  }
});

module.exports = router;
