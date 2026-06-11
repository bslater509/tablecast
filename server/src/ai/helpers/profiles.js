// =============================================================================
// Tablecast — AI Shared Helpers: Profiles
// NPC profile context builders and roleplay prompt helpers
// =============================================================================
"use strict";

// ---------------------------------------------------------------------------
// AI Assist & NPC Profile Helpers
// ---------------------------------------------------------------------------
const ASSIST_ACTIONS_REQUIRING_TEXT = new Set([
  "expand", "summarize", "clarify", "make_dramatic", "style_5e", "read_aloud",
]);

function buildNpcProfileContext(npc, excludeField = null) {
  if (!npc) return "";
  const lines = [
    `- Name: ${npc.name}`,
    `- Race: ${npc.race || "unknown"}`,
    `- Class/Occupation: ${npc.class || "NPC"}`,
    `- Level: ${npc.level}`,
    `- Alignment: ${npc.alignment || "unknown"}`,
    `- AC: ${npc.ac} | HP: ${npc.hp}/${npc.maxHp} | CR: ${npc.cr}`,
    `- Stats: STR:${npc.strength} DEX:${npc.dexterity} CON:${npc.constitution} INT:${npc.intelligence} WIS:${npc.wisdom} CHA:${npc.charisma}`,
  ];
  if (npc.appearance && excludeField !== "appearance") lines.push(`- Appearance: ${npc.appearance}`);
  if (npc.personality && excludeField !== "personality") lines.push(`- Personality: ${npc.personality}`);
  if (npc.history && excludeField !== "history") lines.push(`- History: ${npc.history}`);
  if (npc.partyRelationship && excludeField !== "partyRelationship") lines.push(`- Party Relationship: ${npc.partyRelationship}`);
  if (npc.description) lines.push(`- Summary: ${npc.description}`);
  if (npc.actions) lines.push(`- Actions: ${npc.actions}`);
  if (npc.inventory) lines.push(`- Inventory: ${npc.inventory}`);
  return lines.join("\n");
}

function buildNpcRoleplaySystemPrompt(npc, referenceContext) {
  return `You are roleplaying as the D&D NPC named "${npc.name}".
Stay in character AT ALL TIMES. Respond in character, using fantasy-themed tone and speech patterns appropriate for "${npc.name}".

NPC PROFILE:
${buildNpcProfileContext(npc)}

Local campaign context (if any rules are mentioned):
${referenceContext}

Respond to the user's message as "${npc.name}". Keep it immersive, flavorful, and relatively short.`;
}

module.exports = {
  buildNpcProfileContext,
  buildNpcRoleplaySystemPrompt,
  ASSIST_ACTIONS_REQUIRING_TEXT,
};
