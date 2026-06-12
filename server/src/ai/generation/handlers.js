// =============================================================================
// Tablecast — AI Generation Route Handlers
// Extracted handler functions for NPC, character, monster generation,
// session tools, text expansion, and interview routes (v2).
// =============================================================================
"use strict";

const prisma = require("../../prisma");
const logger = require("../../utils/logger");
const generateTokenSvg = require("../../utils/generateTokenSvg");
const {
  loadAiSettings, performAiCall, streamGenerate,
  beginSseResponse, writeSseEvent,
  fetchCampaignWikiSnippet, cleanAiFieldOutput, stripAiJsonCodeFences,
  buildAssistSystemPrompt, buildAssistUserMessage,
  formatCreaturePromptList, formatEntityList, parseJsonArray,
  ASSIST_ACTIONS_REQUIRING_TEXT, loadSessionAiContext
} = require("../helpers");
const { scanTextForRollChips } = require("../../utils/diceRollDetection");

// DEBUG: Verify deployment version
async function handleDeployTest(req, res) {
  res.json({ version: "v2-handlers-2026-06-12", deployed: true, newRoutes: true });
}

// ---------------------------------------------------------------------------
// POST /generate-npc-options - Generate multiple NPC concepts (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateNpcOptions(req, res) {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "NPC prompt description is required." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);

    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Generating NPC concepts..." });

    const systemPrompt = `You are a D&D 5e NPC concept generator for a Tabletop RPG.
Given a DM's description, generate exactly 4 distinct, creative NPC concepts (options) that the DM can choose from.
Each option should be a different take on the prompt — vary races, classes, alignments, and personalities across options.
${campaignBlock}
You MUST respond with a single JSON object containing an "options" array (and NO other text). Do not wrap in codeblocks.
{
  "options": [
    {
      "name": "NPC full name",
      "race": "NPC race",
      "class": "NPC class or occupation",
      "cr": "challenge rating as string e.g. '1/2', '3'",
      "briefDescription": "One or two sentences describing this NPC concept and their role/personality"
    }
  ]
}
Generate exactly 4 options. Make each one feel distinct and interesting.`;

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, `Generate NPC options for: ${prompt.trim()}`, [], "generate-npc-options");

    writeSseEvent(res, { type: "status", message: "Parsing results..." });

    let cleanJsonStr = rawResponse.trim();
    if (cleanJsonStr.startsWith("```")) {
      const match = cleanJsonStr.match(/```(?:json)?([\s\S]+?)```/);
      if (match) {
        cleanJsonStr = match[1].trim();
      }
    }

    let optionsData;
    try {
      optionsData = JSON.parse(cleanJsonStr);
    } catch (e) {
      logger.error("ai:npc", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate valid NPC options from the AI response.");
    }

    if (!optionsData.options || !Array.isArray(optionsData.options) || optionsData.options.length === 0) {
      throw new Error("AI returned an empty options list.");
    }

    writeSseEvent(res, { type: "result", data: { options: optionsData.options } });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:npc", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate NPC options." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate NPC options." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-npc - AI NPC Creator (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateNpc(req, res) {
  try {
    const { prompt, selectedOption } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "NPC prompt description is required." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);

    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    const selectedBlock = selectedOption
      ? `\nThe DM has selected this specific concept to flesh out into a full NPC:\n${JSON.stringify(selectedOption, null, 2)}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Generating NPC statblock (stats, abilities, narrative fields)..." });

    const systemPrompt = `You are a D&D 5e NPC and monster statblock generator. 
Given a description of an NPC, generate a complete NPC profile.
Match the requested difficulty/CR to the prompt. Narrative fields (appearance, personality, history, partyRelationship) should complement each other without repeating the same sentences.
${campaignBlock}
${selectedBlock}
You MUST respond with a single JSON object (and NO other text). Do not wrap the JSON in codeblocks unless you are using Markdown, but it is preferred to output raw JSON. If you output code blocks, use \`\`\`json.
The JSON must strictly conform to these fields:
{
  "name": "NPC name",
  "race": "NPC race",
  "class": "NPC class or occupation",
  "level": 1,
  "hp": 10,
  "maxHp": 10,
  "ac": 10,
  "cr": "0",
  "strength": 10,
  "dexterity": 10,
  "constitution": 10,
  "intelligence": 10,
  "wisdom": 10,
  "charisma": 10,
  "alignment": "NPC alignment (e.g. Lawful Good, Chaotic Evil, Neutral)",
  "appearance": "Physical appearance description",
  "personality": "Personality traits, ideals, bonds, or flaws",
  "history": "Brief background story",
  "partyRelationship": "How they feel about or interact with the player party",
  "description": "General bio/description summary",
  "actions": [
    {
      "name": "Action Name",
      "description": "Description of the combat action, attack, or ability"
    }
  ]
}`;

    let userMessage = `Create NPC: ${prompt.trim()}`;
    if (selectedOption) {
      userMessage = `Create the full NPC statblock for "${selectedOption.name}" (${selectedOption.race} ${selectedOption.class}). Original request: ${prompt.trim()}`;
    }

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-npc");

    writeSseEvent(res, { type: "status", message: "Parsing and validating statblock..." });

    let cleanJsonStr = rawResponse.trim();
    if (cleanJsonStr.startsWith("```")) {
      const match = cleanJsonStr.match(/```(?:json)?([\s\S]+?)```/);
      if (match) {
        cleanJsonStr = match[1].trim();
      }
    }

    let npcData;
    try {
      npcData = JSON.parse(cleanJsonStr);
    } catch (e) {
      logger.error("ai:npc", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid NPC JSON structure from the AI response.");
    }

    if (!npcData.imageUrl) {
      npcData.imageUrl = generateTokenSvg(npcData.name, npcData.race);
    }

    writeSseEvent(res, { type: "result", data: npcData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:npc", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate NPC." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate NPC." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-character-options - Generate multiple character concepts (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateCharacterOptions(req, res) {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Character prompt description is required." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);
    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Generating character concepts..." });

    const systemPrompt = `You are a D&D 5e character concept generator for a Tabletop RPG.
Given a DM's description, generate exactly 4 distinct, creative character concepts the DM can choose from.
Each option should vary in race, class, background, and tone where appropriate.
${campaignBlock}
You MUST respond with a single JSON object containing an "options" array (and NO other text). Do not wrap in codeblocks.
{
  "options": [
    {
      "name": "Character name",
      "race": "Character race",
      "class": "Character class",
      "level": 1,
      "briefDescription": "One-sentence concept describing the character and their role/personality"
    }
  ]
}
Generate exactly 4 options. Levels should generally range from 1 to 5 based on the prompt. Make each one feel distinct and interesting.`;

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, `Generate character options for: ${prompt.trim()}`, [], "generate-character-options");

    writeSseEvent(res, { type: "status", message: "Parsing results..." });

    let optionsData;
    try {
      optionsData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:character", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate valid character options from the AI response.");
    }

    if (!optionsData.options || !Array.isArray(optionsData.options) || optionsData.options.length === 0) {
      throw new Error("AI returned an empty options list.");
    }

    writeSseEvent(res, { type: "result", data: { options: optionsData.options } });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:character", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate character options." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate character options." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-character - Full character generation (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateCharacter(req, res) {
  try {
    const { prompt, selectedOption } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Character prompt description is required." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);
    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    const selectedBlock = selectedOption
      ? `\nThe DM has selected this specific concept to flesh out into a full character:\n${JSON.stringify(selectedOption, null, 2)}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Generating character sheet..." });

    const systemPrompt = `You are a D&D 5e character generator.
Given a character concept, generate a complete playable character sheet.
Choose a level between 1 and 5 that fits the prompt and concept.
${campaignBlock}
${selectedBlock}
You MUST respond with a single JSON object (and NO other text). Do not wrap the JSON in codeblocks unless you are using Markdown, but it is preferred to output raw JSON. If you output code blocks, use \`\`\`json.
The JSON must strictly conform to these fields:
{
  "name": "Character name",
  "race": "Character race",
  "class": "Character class",
  "level": 1,
  "hp": 10,
  "maxHp": 10,
  "strength": 10,
  "dexterity": 10,
  "constitution": 10,
  "intelligence": 10,
  "wisdom": 10,
  "charisma": 10,
  "backstory": "2-3 paragraphs of backstory",
  "personality": "Traits, ideals, bonds, flaws",
  "appearance": "Physical appearance description",
  "inventory": [
    { "name": "Item name", "quantity": 1, "weight": 1 }
  ]
}`;

    const userMessage = selectedOption
      ? `Create the full character for "${selectedOption.name}" (${selectedOption.race} ${selectedOption.class}). Original request: ${prompt.trim()}`
      : `Create a full character based on this concept: ${prompt.trim()}`;

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-character");

    writeSseEvent(res, { type: "status", message: "Parsing and validating character sheet..." });

    let characterData;
    try {
      characterData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:character", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid character JSON structure from the AI response.");
    }

    writeSseEvent(res, { type: "result", data: characterData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:character", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate character." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate character." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-monster-options - Generate multiple monster concepts (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateMonsterOptions(req, res) {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Monster prompt description is required." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);
    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, creature naming, lair ideas, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Generating monster concepts..." });

    const systemPrompt = `You are a D&D 5e monster concept generator for a Tabletop RPG.
Given a DM's description, generate exactly 4 distinct, creative monster concepts.
Focus on creature type, lair, tactics, and CR-appropriate threat.
${campaignBlock}
You MUST respond with a single JSON object containing an "options" array (and NO other text). Do not wrap in codeblocks.
{
  "options": [
    {
      "name": "Monster name",
      "type": "Creature type",
      "cr": "Challenge rating as a string",
      "briefDescription": "One-sentence concept describing the monster, its lair, and combat style"
    }
  ]
}
Generate exactly 4 options. Make each one feel distinct and dangerous.`;

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, `Generate monster options for: ${prompt.trim()}`, [], "generate-monster-options");

    writeSseEvent(res, { type: "status", message: "Parsing results..." });

    let optionsData;
    try {
      optionsData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:monster", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate valid monster options from the AI response.");
    }

    if (!optionsData.options || !Array.isArray(optionsData.options) || optionsData.options.length === 0) {
      throw new Error("AI returned an empty options list.");
    }

    writeSseEvent(res, { type: "result", data: { options: optionsData.options } });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:monster", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate monster options." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate monster options." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-monster - Full monster generation (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateMonster(req, res) {
  try {
    const { prompt, selectedOption } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Monster prompt description is required." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);
    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    const selectedBlock = selectedOption
      ? `\nThe DM has selected this specific concept to flesh out into a full monster:\n${JSON.stringify(selectedOption, null, 2)}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Generating monster statblock..." });

    const systemPrompt = `You are a D&D 5e monster and NPC statblock generator.
Given a description of a monster, generate a complete monster profile.
Match the requested difficulty/CR to the prompt. Narrative fields (appearance, personality, history, description) should complement each other without repeating the same sentences.
${campaignBlock}
${selectedBlock}
You MUST respond with a single JSON object (and NO other text). Do not wrap the JSON in codeblocks unless you are using Markdown, but it is preferred to output raw JSON. If you output code blocks, use \`\`\`json.
The JSON must strictly conform to these fields:
{
  "name": "Monster name",
  "race": "Creature type",
  "class": "Creature category",
  "level": 1,
  "hp": 10,
  "maxHp": 10,
  "ac": 10,
  "cr": "0",
  "strength": 10,
  "dexterity": 10,
  "constitution": 10,
  "intelligence": 10,
  "wisdom": 10,
  "charisma": 10,
  "alignment": "Alignment",
  "appearance": "Physical appearance description",
  "personality": "Personality traits, habits, instincts, or flaws",
  "history": "Brief background story",
  "partyRelationship": "How it regards or interacts with the player party",
  "description": "General bio/description summary",
  "actions": [
    {
      "name": "Action Name",
      "description": "Description of the combat action, attack, or ability"
    }
  ]
}`;

    const userMessage = selectedOption
      ? `Create the full monster statblock for "${selectedOption.name}" (${selectedOption.type} CR ${selectedOption.cr}). Original request: ${prompt.trim()}`
      : `Create a full monster based on this concept: ${prompt.trim()}`;

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-monster");

    writeSseEvent(res, { type: "status", message: "Parsing and validating statblock..." });

    let monsterData;
    try {
      monsterData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:monster", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid monster JSON structure from the AI response.");
    }

    writeSseEvent(res, { type: "result", data: monsterData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:monster", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate monster." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate monster." });
  }
}

// ---------------------------------------------------------------------------
// POST /build-encounter - Build a balanced encounter (DM only)
// ---------------------------------------------------------------------------
async function handleBuildEncounter(req, res) {
  try {
    const { partyLevels, difficulty, context } = req.body;
    const levels = Array.isArray(partyLevels)
      ? partyLevels.map((level) => Number(level)).filter((level) => Number.isInteger(level) && level > 0)
      : [];

    if (!levels.length) {
      return res.status(400).json({ error: "partyLevels must be a non-empty array of positive integers." });
    }

    if (!["easy", "medium", "hard", "deadly"].includes(String(difficulty || "").toLowerCase())) {
      return res.status(400).json({ error: "difficulty must be easy, medium, hard, or deadly." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    const [existingMonsters, existingNpcs] = await Promise.all([
      prisma.monster.findMany({
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: { name: true, race: true, class: true, cr: true, description: true },
      }),
      prisma.npc.findMany({
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: { name: true, race: true, class: true, level: true, description: true },
      }),
    ]);

    const avgLevel = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    const monsterContext = formatCreaturePromptList(existingMonsters, "monster");
    const npcContext = formatCreaturePromptList(existingNpcs, "npc");

    const systemPrompt = `You are a D&D 5e encounter builder.
Given the party levels and desired difficulty, suggest a balanced encounter composition.
Use the provided existing monsters and NPCs in the database as primary options and inspiration.
Keep the final encounter tactically interesting and appropriate for the party.
You MUST respond with a single JSON object containing an "encounter" object and no other text.
{
  "encounter": {
    "name": "Encounter name",
    "description": "Short thematic encounter description",
    "participants": [
      { "name": "Name", "type": "monster", "quantity": 1, "cr": "1" }
    ]
  }
}`;

    const userMessage = [
      `Party levels: ${levels.join(", ")}`,
      `Average party level: ${avgLevel.toFixed(1)}`,
      `Difficulty: ${String(difficulty).toLowerCase()}`,
      `Additional context: ${typeof context === "string" ? context.trim() : ""}`,
      "",
      "Existing monsters in the database:",
      monsterContext || "(none)",
      "",
      "Existing NPCs in the database:",
      npcContext || "(none)",
    ].join("\n");

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "build-encounter");

    let encounterData;
    try {
      encounterData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:encounter", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid encounter JSON structure from the AI response.");
    }

    res.json(encounterData);
  } catch (err) {
    logger.error("ai:encounter", "Failed", { error: err.message });
    res.status(500).json({ error: err.message || "Failed to build encounter." });
  }
}

// ---------------------------------------------------------------------------
// POST /encounter-description - Generate encounter title/description (DM only)
// ---------------------------------------------------------------------------
async function handleEncounterDescription(req, res) {
  try {
    const participants = Array.isArray(req.body?.participants) ? req.body.participants : [];
    if (!participants.length) {
      return res.status(400).json({ error: "participants must be a non-empty array." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    const systemPrompt = `You are a D&D 5e encounter naming assistant.
Given the listed participants, generate a thematic encounter name and a short evocative description.
You MUST respond with a single JSON object and no other text.
{
  "name": "Encounter name",
  "description": "Short thematic description"
}`;

    const userMessage = `Participants:\n${formatEntityList(participants, (p) => `- ${p.name} | type: ${p.type || "unknown"} | CR: ${p.cr || "0"}`)}`;
    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "encounter-description");

    let encounterData;
    try {
      encounterData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:encounter", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid encounter description.");
    }

    res.json(encounterData);
  } catch (err) {
    logger.error("ai:encounter", "Failed", { error: err.message });
    res.status(500).json({ error: err.message || "Failed to generate encounter description." });
  }
}

// ---------------------------------------------------------------------------
// POST /session-recap - Generate a session recap from recent chat (DM only)
// ---------------------------------------------------------------------------
async function handleSessionRecap(req, res) {
  try {
    const { sessionId } = req.body;
    const { session, chatMessages, wikiArticles, encounters } = await loadSessionAiContext(sessionId);

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);
    writeSseEvent(res, { type: "status", message: "Building recap context..." });

    const systemPrompt = `Write a narrative D&D session recap in markdown covering key events, roleplay moments, combat outcomes, loot awarded, and hooks for next session.
Use the provided session data, chat history, linked wiki articles, and linked encounters as source material.
Return plain markdown only.`;

    const userMessage = [
      `SESSION: ${session.title || "Untitled"}`,
      `STATUS: ${session.status || "PLANNED"}`,
      `AGENDA: ${session.agenda || ""}`,
      "",
      "RECENT CHAT MESSAGES:",
      chatMessages.map((msg) => `- [${msg.sender}] ${msg.text}`).join("\n") || "(none)",
      "",
      "LINKED WIKI ARTICLES:",
      wikiArticles.map((article) => `- ${article.title} (${article.category || "LORE"}): ${String(article.content || "").replace(/\s+/g, " ").slice(0, 220)}`).join("\n") || "(none)",
      "",
      "LINKED ENCOUNTERS:",
      encounters.map((encounter) => `- ${encounter.name} | status: ${encounter.status || "DRAFT"} | participants: ${Array.isArray(encounter.participants) ? encounter.participants.length : 0}`).join("\n") || "(none)",
    ].join("\n");

    writeSseEvent(res, { type: "status", message: "Writing session recap..." });
    const rawReply = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "session-recap");
    const recap = cleanAiFieldOutput(rawReply, "markdown");

    writeSseEvent(res, { type: "result", data: recap });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:session", "Failed", { error: err.message });
    if (err.message === "sessionId must be a valid positive number.") {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === "Session not found.") {
      return res.status(404).json({ error: err.message });
    }
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate session recap." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate session recap." });
  }
}

// ---------------------------------------------------------------------------
// POST /session-agenda - Generate session agenda/prep (DM only)
// ---------------------------------------------------------------------------
async function handleSessionAgenda(req, res) {
  try {
    const { sessionId } = req.body;
    const { session, wikiArticles } = await loadSessionAiContext(sessionId);

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    const campaignWiki = await fetchCampaignWikiSnippet([session.title, session.agenda, ...wikiArticles.map((article) => article.title)].filter(Boolean).join(" "));

    beginSseResponse(res);
    writeSseEvent(res, { type: "status", message: "Building agenda context..." });

    const systemPrompt = `Suggest a session agenda with scene beats, NPC interactions to prepare, encounter prep, and plot hooks to advance.
Use the provided session context and campaign wiki references.
Return plain markdown only.`;

    const userMessage = [
      `SESSION: ${session.title || "Untitled"}`,
      `STATUS: ${session.status || "PLANNED"}`,
      `CURRENT AGENDA: ${session.agenda || ""}`,
      "",
      "CAMPAIGN WIKI CONTEXT:",
      campaignWiki || "(none)",
      "",
      "LINKED WIKI ARTICLES:",
      wikiArticles.map((article) => `- ${article.title} (${article.category || "LORE"}): ${String(article.content || "").replace(/\s+/g, " ").slice(0, 220)}`).join("\n") || "(none)",
    ].join("\n");

    writeSseEvent(res, { type: "status", message: "Writing session agenda..." });
    const rawReply = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "session-agenda");
    const agenda = cleanAiFieldOutput(rawReply, "markdown");

    writeSseEvent(res, { type: "result", data: agenda });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:session", "Failed", { error: err.message });
    if (err.message === "sessionId must be a valid positive number.") {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === "Session not found.") {
      return res.status(404).json({ error: err.message });
    }
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate session agenda." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate session agenda." });
  }
}

// ---------------------------------------------------------------------------
// POST /expand-text - AI Text Enhancer (DM only)
// ---------------------------------------------------------------------------
async function handleExpandText(req, res) {
  try {
    const { text, action, field, context } = req.body;
    const fieldName = typeof field === "string" && field.trim() ? field.trim() : "markdown";
    const actionName = typeof action === "string" && action.trim() ? action.trim() : "expand";
    const currentText = typeof text === "string" ? text : "";

    if (ASSIST_ACTIONS_REQUIRING_TEXT.has(actionName) && !currentText.trim()) {
      return res.status(400).json({ error: "This action requires existing text in the field. Try Generate instead." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    const assistContext = context && typeof context === "object" ? { ...context } : {};
    const needsCampaign =
      actionName === "campaign_tie" ||
      actionName === "generate" ||
      fieldName === "markdown";

    if (needsCampaign) {
      const queryParts = [
        currentText,
        assistContext.npc?.name,
        assistContext.npc?.race,
        assistContext.article?.title,
        ...(assistContext.article?.tags || []),
      ].filter(Boolean);
      assistContext.campaignWiki = await fetchCampaignWikiSnippet(queryParts.join(" "));
    }

    const systemPrompt = buildAssistSystemPrompt(fieldName, actionName);
    const userMessage = buildAssistUserMessage(fieldName, actionName, currentText, assistContext);
    const rawReply = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "expand-text");
    const reply = cleanAiFieldOutput(rawReply, fieldName);

    if (!reply) {
      throw new Error("AI returned empty content.");
    }

    res.json({ reply });
  } catch (err) {
    logger.error("ai:expand", "Failed", { error: err.message });
    res.status(500).json({ error: err.message || "Failed to process text." });
  }
}

// ---------------------------------------------------------------------------
// POST /npc-interview - Interactive NPC Creation Interview (DM only)
// ---------------------------------------------------------------------------
async function handleNpcInterview(req, res) {
  try {
    const { prompt, interviewHistory, finalStep } = req.body;

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);

    let historyText = "";
    if (interviewHistory && interviewHistory.length > 0) {
      historyText = interviewHistory.map(
        (h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer.label} — ${h.answer.description || h.answer.label}`
      ).join("\n\n");
    }

    const queryWords = prompt || (interviewHistory || []).map(h => h.answer.label).join(" ");
    const campaignWiki = await fetchCampaignWikiSnippet(queryWords);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    if (finalStep) {
      writeSseEvent(res, { type: "status", message: "Reading interview notes..." });

      const interviewSummary = interviewHistory
        ? interviewHistory.map(
            (h, i) => `${h.question}: ${h.answer.label}${h.answer.description ? " — " + h.answer.description : ""}`
          ).join("\n")
        : "";

      const systemPrompt = `You are a D&D 5e NPC and monster statblock generator. 
Given an interview summary describing an NPC concept, generate a complete NPC profile.
Match the difficulty/CR to the described role.
Narrative fields (appearance, personality, history, partyRelationship) should complement each other without repeating the same sentences.
${campaignBlock}
You MUST respond with a single JSON object (and NO other text). Do not wrap the JSON in codeblocks unless you are using Markdown, but it is preferred to output raw JSON.
The JSON must strictly conform to these fields:
{
  "name": "NPC name",
  "race": "NPC race",
  "class": "NPC class or occupation",
  "level": 1,
  "hp": 10,
  "maxHp": 10,
  "ac": 10,
  "cr": "0",
  "strength": 10,
  "dexterity": 10,
  "constitution": 10,
  "intelligence": 10,
  "wisdom": 10,
  "charisma": 10,
  "alignment": "NPC alignment (e.g. Lawful Good, Chaotic Evil, Neutral)",
  "appearance": "Physical appearance description",
  "personality": "Personality traits, ideals, bonds, or flaws",
  "history": "Brief background story",
  "partyRelationship": "How they feel about or interact with the player party",
  "description": "General bio/description summary",
  "actions": [
    {
      "name": "Action Name",
      "description": "Description of the combat action, attack, or ability"
    }
  ]
}`;

      writeSseEvent(res, { type: "status", message: "Generating full NPC statblock..." });

      const userMessage = `Create a complete NPC based on this interview:\n\n${interviewSummary}\n\nOriginal context: ${prompt ? prompt.trim() : "None provided"}`;
      const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "npc-interview");

      writeSseEvent(res, { type: "status", message: "Parsing and validating statblock..." });

      let cleanJsonStr = rawResponse.trim();
      if (cleanJsonStr.startsWith("```")) {
        const match = cleanJsonStr.match(/```(?:json)?([\s\S]+?)```/);
        if (match) {
          cleanJsonStr = match[1].trim();
        }
      }

      let npcData;
      try {
        npcData = JSON.parse(cleanJsonStr);
      } catch (e) {
        logger.error("ai:npc", "JSON parse failed on text", { response: rawResponse });
        throw new Error("Failed to generate a valid NPC JSON from the interview.");
      }

      if (!npcData.imageUrl) {
        npcData.imageUrl = generateTokenSvg(npcData.name, npcData.race);
      }

      writeSseEvent(res, { type: "result", data: npcData });
      writeSseEvent(res, { type: "done" });
      res.end();
      return;
    }

    // ---- INTERVIEW STEP: Generate next question ----
    writeSseEvent(res, { type: "status", message: "Thinking of the next question..." });

    const systemPrompt = `You are a friendly D&D NPC creation assistant helping a Dungeon Master design an NPC through a quick multiple-choice interview.

You have been given the following information so far about this NPC:
${historyText || "(No answers yet — this is the very first question.)"}

${campaignBlock}

Your job: Ask the NEXT logical question to narrow down the NPC concept. Choose from these aspects in a natural, conversational order:
1. Role (what the NPC does — their occupation or function in the story)
2. Species / Race
3. Personality and general vibe/alignment
4. Appearance or a distinguishing physical trait
5. Where they are found / what they want from the party
6. Any remaining interesting detail that brings them to life

IMPORTANT RULES:
- Ask ONE question at a time. Never more.
- Provide 3-5 distinct, creative multiple-choice answers. Each answer must have a short "label" and a "description" (one sentence).
- The answers should feel like real options a DM would pick between — make them distinct and evocative.
- Build on previous answers: if the DM chose "tavern keeper", don't ask about "village elder" options.
- You need at least 3 questions answered before generating. Never ask more than 6 total.

YOU MUST RESPOND WITH VALID JSON ONLY. No markdown, no code fences, no extra text.
Respond with EXACTLY this JSON structure:

For a question:
{"action":"ask","question":"Your question here?","choices":[{"id":"short_id","label":"Option Label","description":"One-sentence description of this choice."}]}

When you have enough info (at least 3 questions answered):
{"action":"generate","npcName":"NPC Name","npcRace":"Race","npcClass":"Class/Role","summary":"A 2-3 sentence summary of the NPC concept based on all answers so far."}`;

    const userMessage = prompt && prompt.trim()
      ? `The DM's initial idea: ${prompt.trim()}\n\nPrevious interview:\n${historyText || "No answers yet."}\n\nAsk the next question.`
      : `Previous interview:\n${historyText || "No answers yet. Start with the very first question about this NPC's role."}\n\nAsk the next question.`;

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "npc-interview");

    let cleanJsonStr = rawResponse.trim();
    if (cleanJsonStr.startsWith("```")) {
      const match = cleanJsonStr.match(/```(?:json)?([\s\S]+?)```/);
      if (match) {
        cleanJsonStr = match[1].trim();
      }
    }

    let responseData;
    try {
      responseData = JSON.parse(cleanJsonStr);
    } catch (e) {
      logger.error("ai:npc", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to parse the AI response. Please try again.");
    }

    if (!responseData.action || !["ask", "generate"].includes(responseData.action)) {
      throw new Error("Unexpected response from AI. Please try again.");
    }

    if (responseData.action === "ask" && (!responseData.choices || !Array.isArray(responseData.choices) || responseData.choices.length < 2)) {
      throw new Error("AI returned an invalid question format. Please try again.");
    }

    if (responseData.action === "generate" && !responseData.summary) {
      throw new Error("AI returned an incomplete generation signal. Please try again.");
    }

    writeSseEvent(res, { type: "result", data: responseData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:npc", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed during NPC interview." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed during NPC interview." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-hooks - Quest & Story Hook Generator (6.2) (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateHooks(req, res) {
  try {
    const { partyLevel, environment, tone, constraints, includeCombat, includePuzzles, includeNpcs, includeMoralDilemma } = req.body;

    if (!partyLevel || !Array.isArray(partyLevel) || partyLevel.length === 0) {
      return res.status(400).json({ error: "partyLevel must be a non-empty array of player levels." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);

    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet([environment, tone, constraints].filter(Boolean).join(" "));
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Generating quest hooks..." });

    const includeCombatStr = includeCombat !== false ? "Include at least one combat-focused hook." : "No combat hooks needed.";
    const includePuzzlesStr = includePuzzles ? "Include at least one puzzle or investigation hook." : "";
    const includeNpcsStr = includeNpcs ? "Include social/NPC-driven hooks." : "";
    const includeMoralStr = includeMoralDilemma ? "Include at least one hook with a moral dilemma." : "";

    const systemPrompt = `You are a D&D quest and story hook generator for a Tabletop RPG.
Given the party level, environment, and tone, generate 3-4 distinct quest hooks.
Each hook should be a complete adventure seed the DM can drop into their campaign.
${campaignBlock}
${includeCombatStr}
${includePuzzlesStr}
${includeNpcsStr}
${includeMoralStr}

You MUST respond with a single JSON object containing a "hooks" array (and NO other text). Do not wrap in codeblocks.
{
  "hooks": [
    {
      "title": "Hook title",
      "pitch": "One-sentence hook that grabs attention",
      "setupScene": "Opening scene description — where and how the party gets involved",
      "conflict": "Central conflict or problem to resolve",
      "keyNpcs": "Key NPCs involved (name and brief role)",
      "complications": "Possible twists or complications",
      "rewards": "Suggested rewards (gold, magic items, story advancement)"
    }
  ]
}
Generate 3-4 hooks. Make each one feel distinct and playable.`;

    const userMessage = [
      `Party level(s): ${partyLevel.join(", ")}`,
      `Environment: ${environment || "Any"}`,
      `Tone: ${tone || "Neutral"}`,
      `Constraints: ${constraints || "None"}`,
      `Include combat: ${includeCombat !== false ? "yes" : "no"}`,
      `Include puzzles: ${includePuzzles ? "yes" : "no"}`,
      `Include NPCs: ${includeNpcs ? "yes" : "no"}`,
      `Include moral dilemma: ${includeMoralDilemma ? "yes" : "no"}`,
    ].join("\n");

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-hooks");

    writeSseEvent(res, { type: "status", message: "Parsing results..." });

    let hooksData;
    try {
      hooksData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:hooks", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate valid quest hooks from the AI response.");
    }

    if (!hooksData.hooks || !Array.isArray(hooksData.hooks) || hooksData.hooks.length === 0) {
      throw new Error("AI returned an empty hooks list.");
    }

    writeSseEvent(res, { type: "result", data: hooksData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:hooks", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate quest hooks." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate quest hooks." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-names - Name Generator (6.3) (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateNames(req, res) {
  try {
    const { category, stylePrompt } = req.body;
    let count = parseInt(req.body.count, 10) || 5;
    if (count < 1) count = 1;
    if (count > 20) count = 20;

    if (!category || typeof category !== "string" || !category.trim()) {
      return res.status(400).json({ error: "category is required. Options: NPC (Dwarf), NPC (Elf), NPC (Human), Tavern, Town, Shop, Faction, Landmark, MonsterLair" });
    }

    const validCategories = ["npc-dwarf", "npc-elf", "npc-human", "tavern", "town", "shop", "faction", "landmark", "monster-lair"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: NPC (Dwarf), NPC (Elf), NPC (Human), Tavern, Town, Shop, Faction, Landmark, MonsterLair` });
    }

    const categoryLabels = {
      "npc-dwarf": "NPC (Dwarf)", "npc-elf": "NPC (Elf)", "npc-human": "NPC (Human)",
      "tavern": "Tavern", "town": "Town/City", "shop": "Shop",
      "faction": "Faction", "landmark": "Landmark", "monster-lair": "Monster Lair",
    };
    const categoryLabel = categoryLabels[category] || category;

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    const styleText = stylePrompt ? ` Style preference: ${stylePrompt}` : "";

    const systemPrompt = `You are a fantasy name generator for D&D 5e.
Given a category and count, generate creative, fitting names.
${styleText}
You MUST respond with a single JSON object containing a "names" array (and NO other text). Do not wrap in codeblocks.
{
  "names": ["Name1", "Name2", "Name3"]
}
Generate exactly ${count} names. Make each one distinct and evocative.`;

    const userMessage = `Generate ${count} names for category: ${categoryLabel}.${styleText}`;
    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-names");

    let namesData;
    try {
      namesData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:names", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate valid names from the AI response.");
    }

    if (!namesData.names || !Array.isArray(namesData.names) || namesData.names.length === 0) {
      throw new Error("AI returned an empty names list.");
    }

    res.json({ names: namesData.names });
  } catch (err) {
    logger.error("ai:names", "Failed", { error: err.message });
    res.status(500).json({ error: err.message || "Failed to generate names." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-wiki-article - AI Wiki Article Generation (6.5) (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateWikiArticle(req, res) {
  try {
    const { prompt, category, includeSections } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required describing the article topic." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);

    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    writeSseEvent(res, { type: "status", message: "Writing wiki article..." });

    const sectionsDef = includeSections && Array.isArray(includeSections)
      ? `Include these sections: ${includeSections.join(", ")}`
      : "Include relevant sections like Description, History, Notable Locations, Inhabitants, Rumors, and Adventure Hooks.";

    const categoryStr = category ? `\nCategory: ${category}` : "";

    const systemPrompt = `You are a campaign wiki article writer for a D&D 5e Tabletop RPG.
Given a topic prompt, write a comprehensive wiki article in markdown format.
${campaignBlock}
${sectionsDef}${categoryStr}

You MUST respond with a single JSON object and no other text. Do not wrap in codeblocks.
{
  "title": "Article title",
  "content": "Full article content in markdown format with headings, paragraphs, and bullet lists as appropriate",
  "suggestedTags": ["tag1", "tag2", "tag3"]
}

Write engaging, flavorful prose that a DM can use directly at the table.`;

    const userMessage = `Write a wiki article about: ${prompt.trim()}`;
    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-wiki-article");

    writeSseEvent(res, { type: "status", message: "Parsing results..." });

    let articleData;
    try {
      articleData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:wiki", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid wiki article from the AI response.");
    }

    if (!articleData.title || !articleData.content) {
      throw new Error("AI returned an incomplete article structure.");
    }

    writeSseEvent(res, { type: "result", data: articleData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:wiki", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate wiki article." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate wiki article." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-description - Location/Room Description Generator (6.6) (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateDescription(req, res) {
  try {
    const { type, prompt, tone } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required describing the location or room." });
    }

    const validTypes = ["room", "building", "wilderness", "settlement"];
    const descType = type && validTypes.includes(type) ? type : "room";

    const validTones = ["ominous", "peaceful", "mysterious", "grand", "dilapidated"];
    const descTone = tone && validTones.includes(tone) ? tone : "mysterious";

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);

    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(prompt);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    writeSseEvent(res, { type: "status", message: `Writing ${descType} description (${descTone} tone)...` });

    const systemPrompt = `You are a D&D location and room description writer for a Tabletop RPG.
Given a prompt, type, and tone, write an immersive description for a ${descType} with a ${descTone} tone.
${campaignBlock}

You MUST respond with a single JSON object and no other text. Do not wrap in codeblocks.
{
  "description": "Full atmospheric description in markdown format covering layout, atmosphere, notable features, and points of interest",
  "sensoryDetails": {
    "sights": "What characters see — visual details, lighting, colors, movement",
    "sounds": "What characters hear — ambient sounds, echoes, silence, distant noises",
    "smells": "What characters smell — odors, scents, freshness, decay"
  },
  "hiddenDetails": "Secret features, hidden doors, traps, or clues that might be discovered with investigation"
}

Write evocative, sensory-rich prose that a DM can read aloud at the table.`;

    const userMessage = `Describe a ${descType} with ${descTone} tone: ${prompt.trim()}`;
    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-description");

    writeSseEvent(res, { type: "status", message: "Parsing results..." });

    let descriptionData;
    try {
      descriptionData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:description", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid description from the AI response.");
    }

    if (!descriptionData.description) {
      throw new Error("AI returned an empty description.");
    }

    writeSseEvent(res, { type: "result", data: descriptionData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:description", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate description." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate description." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-travel - Weather & Travel Montage Generator (6.7) (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateTravel(req, res) {
  try {
    const { route, terrain, days, season, partyLevel, dangerous } = req.body;

    let numDays = parseInt(days, 10) || 5;
    if (numDays < 3) numDays = 3;
    if (numDays > 7) numDays = 7;

    if (!route || typeof route !== "string" || !route.trim()) {
      return res.status(400).json({ error: "route is required describing the travel route." });
    }

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    beginSseResponse(res);

    writeSseEvent(res, { type: "status", message: "Consulting campaign lore..." });

    const campaignWiki = await fetchCampaignWikiSnippet(route);
    const campaignBlock = campaignWiki
      ? `\nUse this campaign lore for tone, names, and setting consistency when relevant:\n${campaignWiki}\n`
      : "";

    writeSseEvent(res, { type: "status", message: `Planning ${numDays}-day journey...` });

    const dangerText = dangerous ? "This journey is dangerous — include combat encounters and hazards." : "Keep hazards manageable; focus on atmosphere over combat.";
    const seasonText = season ? ` Season: ${season}.` : "";
    const terrainText = terrain ? ` Terrain: ${terrain}.` : "";
    const partyText = partyLevel && Array.isArray(partyLevel)
      ? ` Party level(s): ${partyLevel.join(", ")}.`
      : "";

    const systemPrompt = `You are a D&D travel montage and weather generator for a Tabletop RPG.
Given a route, generate a day-by-day travel montage. Each day should have varied weather, an evocative scene description, and optionally a hook or encounter.
${campaignBlock}
${dangerText}${seasonText}${terrainText}${partyText}

You MUST respond with a single JSON object containing a "legs" array (and NO other text). Do not wrap in codeblocks.
{
  "legs": [
    {
      "day": 1,
      "weather": "Weather description (temperature, precipitation, wind, visibility)",
      "temperature": "Temperature description (e.g. 'Bitterly cold', 'Warm and humid', 'Mild breeze')",
      "description": "Evocative scene description for this day's travel",
      "hook": "Optional encounter or discovery hook for this day (or empty string if none)"
    }
  ]
}
Generate exactly ${numDays} days. Each day should feel distinct. Descriptions should be vivid and usable at the table.`;

    const userMessage = `Generate a ${numDays}-day travel montage for route: ${route}.${terrainText}${seasonText}${dangerText}`;
    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-travel");

    writeSseEvent(res, { type: "status", message: "Parsing travel montage..." });

    let travelData;
    try {
      travelData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:travel", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate a valid travel montage from the AI response.");
    }

    if (!travelData.legs || !Array.isArray(travelData.legs) || travelData.legs.length === 0) {
      throw new Error("AI returned an empty travel legs list.");
    }

    writeSseEvent(res, { type: "result", data: travelData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    logger.error("ai:travel", "Failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate travel montage." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate travel montage." });
  }
}

// ---------------------------------------------------------------------------
// POST /generate-npc-phrases - NPC Dialogue Phrase Generator (6.8) (DM only)
// ---------------------------------------------------------------------------
async function handleGenerateNpcPhrases(req, res) {
  try {
    const { npcId, name, race, personality, phraseType, count } = req.body;

    let numCount = parseInt(count, 10) || 5;
    if (numCount < 1) numCount = 1;
    if (numCount > 15) numCount = 15;

    const npcName = name || "an NPC";
    const npcRace = race || "unknown race";
    const npcPersonality = personality || "mysterious";

    const validPhraseTypes = ["greeting", "threat", "bargain", "combat", "rumor", "farewell"];
    const phraseCat = phraseType && validPhraseTypes.includes(phraseType) ? phraseType : "greeting";

    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    // If npcId is provided, fetch the actual NPC for richer context
    let npcContext = "";
    if (npcId) {
      try {
        const npc = await prisma.npc.findUnique({ where: { id: parseInt(npcId, 10) } });
        if (npc) {
          npcContext = `\nNPC Profile:\nName: ${npc.name}\nRace: ${npc.race}\nPersonality: ${npc.personality || "Unknown"}\nAlignment: ${npc.alignment || "Unknown"}\nDescription: ${npc.description || ""}\n`;
        }
      } catch (dbErr) {
        logger.warn("ai:phrases", "Could not fetch NPC for context", { npcId, error: dbErr.message });
      }
    }

    const systemPrompt = `You are a D&D NPC dialogue phrase generator for a Tabletop RPG.
Given an NPC's profile and a phrase type, generate ${numCount} distinct, in-character phrases the NPC might say.
${npcContext}

Phrase type: ${phraseCat}
NPC name: ${npcName}
NPC race: ${npcRace}
NPC personality: ${npcPersonality}

Each phrase should feel authentic to the character's personality and the situation.
You MUST respond with a single JSON object containing a "phrases" array (and NO other text). Do not wrap in codeblocks.
{
  "phrases": ["Phrase 1", "Phrase 2", "Phrase 3"]
}
Generate exactly ${numCount} phrases. Make each one distinct and usable at the table.`;

    const userMessage = `Generate ${numCount} ${phraseCat} phrases for ${npcName} (${npcRace}, ${npcPersonality}).`;
    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage, [], "generate-npc-phrases");

    let phrasesData;
    try {
      phrasesData = JSON.parse(stripAiJsonCodeFences(rawResponse));
    } catch (e) {
      logger.error("ai:phrases", "JSON parse failed on text", { response: rawResponse });
      throw new Error("Failed to generate valid phrases from the AI response.");
    }

    if (!phrasesData.phrases || !Array.isArray(phrasesData.phrases) || phrasesData.phrases.length === 0) {
      throw new Error("AI returned an empty phrases list.");
    }

    res.json({ phrases: phrasesData.phrases });
  } catch (err) {
    logger.error("ai:phrases", "Failed", { error: err.message });
    res.status(500).json({ error: err.message || "Failed to generate phrases." });
  }
}

// ---------------------------------------------------------------------------
// POST /detect-roll-chips - Scan text for D&D roll patterns (DM only)
// ---------------------------------------------------------------------------
async function handleDetectRollChips(req, res) {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required." });
    }

    const chips = scanTextForRollChips(text);
    res.json({ chips });
  } catch (err) {
    logger.error("ai:rolls", "Failed to detect roll chips", { error: err.message });
    res.status(500).json({ error: err.message || "Failed to scan text." });
  }
}

module.exports = {
  handleGenerateNpcOptions,
  handleGenerateNpc,
  handleGenerateCharacterOptions,
  handleGenerateCharacter,
  handleGenerateMonsterOptions,
  handleGenerateMonster,
  handleBuildEncounter,
  handleEncounterDescription,
  handleSessionRecap,
  handleSessionAgenda,
  handleExpandText,
  handleNpcInterview,
  handleGenerateHooks,
  handleGenerateNames,
  handleGenerateWikiArticle,
  handleGenerateDescription,
  handleGenerateTravel,
  handleGenerateNpcPhrases,
  handleDetectRollChips,
  handleDeployTest,
};
