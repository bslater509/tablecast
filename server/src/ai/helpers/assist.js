// =============================================================================
// Tablecast — AI Shared Helpers: Assist
// AI Assist system prompt and user message builders
// =============================================================================
"use strict";

// eslint-disable-next-line unused-imports/no-unused-vars
const { buildNpcProfileContext, buildNpcRoleplaySystemPrompt } = require("./profiles");

function buildAssistSystemPrompt(field, action) {
  const outputRule = "Return ONLY the final field content. No labels, no preamble, no quotes around the whole answer.";

  const prompts = {
    alignment: {
      generate: `Suggest a D&D 5e alignment that fits this NPC based on their profile. Optionally add one brief sentence explaining why. ${outputRule} Max 40 words.`,
      clarify: `Clarify or refine the alignment text for this NPC. Keep it concise and grounded in their personality and history. ${outputRule} Max 40 words.`,
    },
    appearance: {
      generate: `Write a physical appearance description for this NPC (2–4 sentences). Include distinctive visual details suitable for read-aloud at the table. Use light markdown if helpful. ${outputRule} 50–120 words.`,
      expand: `Expand the appearance description with sensory details and distinctive visual traits. Preserve existing facts. ${outputRule}`,
      read_aloud: `Rewrite the appearance as a DM read-aloud box in markdown blockquote format (> ...). ${outputRule}`,
      make_dramatic: `Rewrite the appearance with dramatic, evocative fantasy prose while preserving facts. ${outputRule}`,
    },
    personality: {
      generate: `Write personality traits for this NPC: traits, mannerisms, ideals, bonds, or flaws in a short paragraph or bullet list. ${outputRule} 40–100 words.`,
      expand: `Expand the personality section with traits, speech patterns, and roleplay hooks. Preserve existing facts. ${outputRule}`,
      summarize: `Summarize the personality into a tight bulleted list for quick DM reference. ${outputRule}`,
      add_flaw: `Add a compelling flaw, secret, or contradiction to this NPC's personality. Integrate with existing traits if present. ${outputRule}`,
    },
    history: {
      generate: `Write a brief backstory for this NPC (goals, past events, motivations). ${outputRule} 60–150 words.`,
      expand: `Expand the backstory with hooks, secrets, and connections. Preserve existing facts. ${outputRule}`,
      summarize: `Summarize the history into key bullet points for quick DM reference. ${outputRule}`,
      campaign_tie: `Connect this NPC's history to the campaign lore provided in context. Add plausible ties without contradicting existing facts. ${outputRule}`,
    },
    backstory: {
      generate: `Write a compelling D&D character backstory (2-3 paragraphs). Include origins, motivations, key life events, and what drives them to adventure. ${outputRule} 80-200 words.`,
      expand: `Expand this character backstory with more detail, life events, and motivations. Preserve existing facts. ${outputRule}`,
      summarize: `Summarize this backstory into key bullet points for quick reference. ${outputRule}`,
      campaign_tie: `Connect this character's backstory to the campaign lore provided in context. Add plausible ties without contradicting existing facts. ${outputRule}`,
    },
    partyRelationship: {
      generate: `Describe how this NPC feels about and interacts with the player party (attitude, trust, goals, potential conflict). ${outputRule} 40–100 words.`,
      expand: `Expand the party relationship with specific attitudes, rumors, and roleplay hooks. Preserve existing facts. ${outputRule}`,
      friendly: `Rewrite the relationship so the NPC is broadly friendly or helpful toward the party while staying in character. ${outputRule}`,
      hostile: `Rewrite the relationship so the NPC is suspicious, antagonistic, or opposed to the party while staying plausible. ${outputRule}`,
    },
    agenda: {
      generate: `Generate a D&D session agenda with scene beats, NPC interactions, encounter prep, and plot hooks to advance. ${outputRule} 60–150 words.`,
      expand: `Expand this session agenda with more detail and specific beats. Preserve existing content. ${outputRule}`,
      summarize: `Summarize this agenda into key bullet points. ${outputRule}`,
    },
    recap: {
      generate: `Write a narrative D&D session recap covering key events, roleplay moments, combat outcomes, loot awarded, and hooks for next session. ${outputRule} 100–250 words.`,
      expand: `Expand this session recap with more detail and narrative flair. Preserve existing facts. ${outputRule}`,
      summarize: `Summarize this session recap into key bullet points. ${outputRule}`,
      make_dramatic: `Rewrite this session recap with dramatic, evocative fantasy prose while preserving facts. ${outputRule}`,
    },
    markdown: {
      generate: `Draft campaign wiki content in markdown based on the article title, category, and tags in context. Include useful DM details and hooks. ${outputRule}`,
      expand: `Expand this campaign wiki entry. Preserve facts; add sensory detail, lore depth, and DM hooks. ${outputRule}`,
      summarize: `Provide a clean bulleted summary capturing all key points for quick DM reference. ${outputRule}`,
      make_dramatic: `Rewrite with dramatic, classic D&D fantasy tone while preserving facts. ${outputRule}`,
      style_5e: `Rewrite to sound like an official D&D 5e sourcebook entry using core-book conventions. ${outputRule}`,
    },
  };

  const fieldPrompts = prompts[field] || prompts.markdown;
  return fieldPrompts[action] || `You are a D&D campaign helper assisting a Dungeon Master. Rewrite or generate the requested field content. ${outputRule}`;
}

function buildAssistUserMessage(field, action, text, context = {}) {
  const parts = [`TASK: ${action}`, `FIELD: ${field}`];

  if (context.entityType === "npc" && context.npc) {
    parts.push("\nNPC CONTEXT:");
    parts.push(buildNpcProfileContext(context.npc, field !== "markdown" ? field : null));
    if (field !== "markdown") {
      parts.push("\nNOTE: Write only for the requested field. Do not repeat other fields verbatim.");
    }
  }

  if (context.entityType === "article" && context.article) {
    parts.push("\nARTICLE CONTEXT:");
    parts.push(`- Title: ${context.article.title || "Untitled"}`);
    parts.push(`- Category: ${context.article.category || "LORE"}`);
    if (context.article.tags?.length) {
      parts.push(`- Tags: ${context.article.tags.join(", ")}`);
    }
  }

  if (context.entityType === "character" && context.character) {
    parts.push("\nCHARACTER CONTEXT:");
    parts.push(`- Name: ${context.character.name || "Unknown"}`);
    parts.push(`- Race: ${context.character.race || "Unknown"}`);
    parts.push(`- Class: ${context.character.class || "Unknown"}`);
    parts.push(`- Level: ${context.character.level || 1}`);
    if (context.character.appearance && field !== "appearance") parts.push(`- Appearance: ${context.character.appearance}`);
    if (context.character.personality && field !== "personality") parts.push(`- Personality: ${context.character.personality}`);
    if (context.character.backstory && field !== "backstory") parts.push(`- Backstory: ${context.character.backstory}`);
    parts.push("\nNOTE: Write only for the requested field. Do not repeat other fields verbatim.");
  }

  if (context.entityType === "session" && context.session) {
    parts.push("\nSESSION CONTEXT:");
    parts.push(`- Title: ${context.session.title || "Untitled"}`);
    parts.push(`- Status: ${context.session.status || "PLANNED"}`);
    if (context.session.agenda) parts.push(`- Current Agenda: ${context.session.agenda}`);
  }

  if (context.campaignWiki) {
    parts.push("\nCAMPAIGN LORE (for reference):");
    parts.push(context.campaignWiki);
  }

  const trimmed = (text || "").trim();
  if (trimmed) {
    parts.push("\nCURRENT TEXT:");
    parts.push(trimmed);
  } else {
    parts.push("\nCURRENT TEXT: (empty — generate fresh content from context above)");
  }

  return parts.join("\n");
}

module.exports = {
  buildAssistSystemPrompt,
  buildAssistUserMessage,
};
