// =============================================================================
// Tablecast — AI Session Co-Pilot
// Proactive DM assistant: rule reminders, encounter balance, lore checks
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const logger = require("../utils/logger");
const { requireDm } = require("../auth");
const { loadAiSettings, performAiCall, findRelevantRules, fetchCampaignWikiSnippet } = require("./helpers");

const router = Router();

// Rate limiting state (in-memory, per-session)
const rateLimitMap = new Map();
function isRateLimited(sessionId) {
  const now = Date.now();
  const last = rateLimitMap.get(sessionId);
  if (last && now - last < 30000) return true; // 30 second cooldown
  rateLimitMap.set(sessionId, now);
  return false;
}

// ---------------------------------------------------------------------------
// POST /copilot/check — Analyze a chat message and return suggestions
// ---------------------------------------------------------------------------
router.post("/copilot/check", requireDm, async (req, res) => {
  try {
    const { text, encounterId, mapId, sessionId } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Message text is required." });
    }

    const effectiveSessionId = sessionId || "default";
    if (isRateLimited(effectiveSessionId)) {
      return res.json({ cooldown: true, suggestion: null });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    // Gather encounter context for balance warnings
    let encounterContext = "";
    if (encounterId) {
      const encounter = await prisma.encounter.findUnique({
        where: { id: Number(encounterId) },
        include: {
          participants: {
            include: { npc: true, character: true, monster: true }
          }
        }
      });
      if (encounter) {
        const activeCount = encounter.participants.filter(p => p.currentHp > 0).length;
        const partyCount = encounter.participants.filter(p => p.characterId).length;
        encounterContext = `\nActive encounter: "${encounter.name}" (Round ${encounter.round}), ${activeCount} active combatants, ${partyCount} party members`;
        // Check for balance warnings
        if (encounter.status === "ACTIVE" || encounter.status === "DRAFT") {
          const maxCr = Math.max(...encounter.participants.map(p => {
            const cr = p.monster?.cr || p.npc?.cr || "0";
            return cr === "0" ? 0 : (cr.includes("/") ? 0.5 : Number(cr) || 0);
          }).filter(v => v > 0));
          const partyLevels = encounter.participants.filter(p => p.character).map(p => p.character.level);
          const avgLevel = partyLevels.length > 0 ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length) : 0;
          if (maxCr > 0 && avgLevel > 0 && maxCr > avgLevel + 4) {
            encounterContext += `\n⚠️ CR WARNING: Max CR ${maxCr} vs party avg level ${avgLevel} — potentially Deadly encounter`;
          }
        }
      }
    }

    // Fetch wiki context for lore consistency
    const wikiContext = await fetchCampaignWikiSnippet(text);

    // Check for rules questions
    const rulesTriggerPatterns = [
      /how\s+(far|much|long|many)/i,
      /what\s+(does|is|are|can)/i,
      /can\s+(i|we|you)/i,
      /rule/i,
      /advantage|disadvantage/i,
      /saving\s+throw/i,
      /spell\s+(save|dc|slot|level)/i,
      /concentration/i,
      /grapple|shove/i,
      /opportunity\s+attack/i,
      /reaction/i,
      /bonus\s+action/i,
      /proficiency/i,
    ];
    const isRulesQuestion = rulesTriggerPatterns.some(p => p.test(text));

    let suggestions = [];

    // 1. Rules suggestion
    if (isRulesQuestion && provider && apiKey) {
      const rulesResult = await findRelevantRules(text, { role: "DM" });
      if (rulesResult && rulesResult.trim().length > 0) {
        suggestions.push({
          type: "rule",
          priority: "high",
          title: "📖 Rules Reference",
          text: rulesResult,
        });
      }
    }

    // 2. Lore consistency check
    if (wikiContext && provider && apiKey) {
      const systemPrompt = `You are a campaign lore checker. Given a DM chat message and wiki context, determine if the message contradicts established lore.
Return JSON: { "hasConflict": boolean, "explanation": "string or empty", "wikiReference": "string or empty" }
If no conflict, hasConflict should be false and explanation empty.`;

      const loreResult = await performAiCall(
        provider, apiKey, ollamaUrl, activeModel,
        systemPrompt,
        `DM says: "${text}"\n\nWiki context:\n${wikiContext}`,
        [],
        "copilot-lore-check"
      ).catch(() => null);

      if (loreResult) {
        try {
          const cleanJson = loreResult.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
          const loreParsed = JSON.parse(cleanJson);
          if (loreParsed.hasConflict) {
            suggestions.push({
              type: "lore",
              priority: "medium",
              title: "📜 Lore Check",
              text: loreParsed.explanation || "Possible lore inconsistency detected.",
              wikiRef: loreParsed.wikiReference || "",
            });
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // 3. Forgotten effects (if encounter is active)
    if (encounterContext && encounterContext.includes("Round")) {
      suggestions.push({
        type: "effect",
        priority: "low",
        title: "⏱️ Round Tracker",
        text: encounterContext,
      });
    }

    res.json({
      cooldown: false,
      suggestions: suggestions.slice(0, 3), // Max 3 suggestions
    });
  } catch (err) {
    logger.error("ai:copilot", "Copilot check failed", { error: err.message });
    res.json({ cooldown: false, suggestions: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /copilot/status — Quick health check
// ---------------------------------------------------------------------------
router.get("/copilot/status", (req, res) => {
  res.json({ ok: true, rateLimitedSessions: rateLimitMap.size });
});

module.exports = router;
