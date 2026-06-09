// =============================================================================
// Tablecast — AI Shared Helpers
// Shared utility functions: AI provider calls, SSE streaming, RAG, prompts
// =============================================================================
"use strict";

const prisma = require("../prisma");
const referenceSearch = require("../utils/referenceSearch");
const generateTokenSvg = require("../utils/generateTokenSvg");
const logger = require("../utils/logger");

// ---------------------------------------------------------------------------
// AI Response Audit Logger
// ---------------------------------------------------------------------------
async function logAiResponse(operation, prompt, rawReply, parsedOk, errorMsg, durationMs) {
  try {
    await prisma.aiResponseLog.create({
      data: {
        operation,
        prompt: String(prompt).slice(0, 5000),
        rawReply: String(rawReply).slice(0, 10000),
        parsedOk,
        errorMsg: errorMsg ? String(errorMsg).slice(0, 500) : null,
        durationMs: durationMs || null,
      },
    });
  } catch (logErr) {
    logger.error("ai:log", "Failed to persist AI response log", { error: logErr.message });
  }
}

// ---------------------------------------------------------------------------
// Prompt Formatting Helpers
// ---------------------------------------------------------------------------
function formatCreaturePromptList(items, kind) {
  return items.map((item) => {
    if (kind === "monster") {
      return `- ${item.name} | type: ${item.race || "unknown"} | class: ${item.class || "monster"} | CR: ${item.cr || "0"} | ${item.description || ""}`;
    }
    return `- ${item.name} | race: ${item.race || "unknown"} | class: ${item.class || "unknown"} | level: ${item.level || 1} | ${item.description || ""}`;
  }).join("\n");
}

function formatEntityList(items, formatter) {
  return items.map(formatter).filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Text Cleaning Helpers
// ---------------------------------------------------------------------------
function cleanText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\{@spell ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@dice ([^}|]+)[^}]*\}/g, "($1)")
    .replace(/\{@item ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@creature ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@condition ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@filter ([^|]+)\|[^}]+\}/g, "$1")
    .replace(/\{@table ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@style ([^}|]+)[^}]*\}/g, "$1")
    .replace(/\{@[a-z]+ ([^}|]+)[^}]*\}/g, "$1");
}

function stringifyEntries(entries) {
  if (!entries) return "";
  if (typeof entries === "string") return cleanText(entries);
  if (Array.isArray(entries)) {
    return entries.map(e => {
      if (typeof e === "string") return cleanText(e);
      if (e && typeof e === "object") {
        if (e.name && e.entries) return `${e.name}: ${stringifyEntries(e.entries)}`;
        if (e.entry) return cleanText(e.entry);
        if (e.items) return e.items.map(it => typeof it === "string" ? cleanText(it) : stringifyEntries(it.entries || it)).join(", ");
      }
      return "";
    }).join("\n");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Keyword-based RAG Rules Querying
// ---------------------------------------------------------------------------
async function findRelevantRules(message, user) {
  if (!message) return "";

  const excludedWords = new Set([
    "what", "with", "that", "your", "about", "the", "and", "for", "are", "but",
    "not", "you", "was", "out", "him", "her", "his", "who", "its", "can",
    "use", "has", "how", "why", "get", "set", "one", "two", "new", "old",
    "our", "any", "all", "she", "they", "them", "this", "from", "their", "there",
    "will", "would", "shall", "should", "some", "more", "most", "than", "then", "into"
  ]);

  const words = message.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => {
      if (excludedWords.has(w)) return false;
      return w.length > 2 || w === "ac" || w === "hp" || w === "cr";
    });

  if (words.length === 0) return "";

  const isDm = user?.role === "DM";

  // 1. Search Wiki Articles
  const matchedWiki = [];
  for (const word of words.slice(0, 5)) {
    try {
      const articles = await prisma.wikiArticle.findMany({
        where: {
          OR: [
            { title: { contains: word } },
            { content: { contains: word } },
            { tags: { contains: word } }
          ],
          ...(isDm ? {} : { isVisibleToPlayers: true })
        },
        take: 2
      });
      for (const art of articles) {
        if (!matchedWiki.some(a => a.id === art.id)) {
          matchedWiki.push(art);
        }
      }
    } catch (err) {
      logger.error("ai:rag", "Wiki search error", { error: err.message });
    }
  }

  // 2. Search Campaign NPCs
  const matchedNpcs = [];
  for (const word of words.slice(0, 5)) {
    try {
      const npcs = await prisma.npc.findMany({
        where: {
          OR: [
            { name: { contains: word } },
            { race: { contains: word } },
            { class: { contains: word } },
            { description: { contains: word } }
          ],
          ...(isDm ? {} : { isVisibleToPlayers: true })
        },
        take: 2
      });
      for (const npc of npcs) {
        if (!matchedNpcs.some(n => n.id === npc.id)) {
          matchedNpcs.push(npc);
        }
      }
    } catch (err) {
      logger.error("ai:rag", "NPC search error", { error: err.message });
    }
  }

  // 3. Search Core Rules
  const allowedSetting = await prisma.appSetting.findUnique({ where: { key: "reference.allowedSources" } });
  let allowedSources = [];
  if (allowedSetting?.value) {
    try {
      allowedSources = JSON.parse(allowedSetting.value);
    } catch (e) {}
  }

  const matches = [];
  const categories = ["rules", "spells", "monsters", "items"];

  for (const cat of categories) {
    for (const word of words.slice(0, 5)) {
      const results = referenceSearch.search(cat, word, 1, { sources: allowedSources, summary: false });
      if (results.length > 0) {
        matches.push({ category: cat, item: results[0] });
      }
    }
  }

  // Format matches into context
  let context = "";

  if (matchedWiki.length > 0) {
    context += "\n=== CAMPAIGN LORE & WIKI ===\n";
    for (const art of matchedWiki.slice(0, 3)) {
      context += `Title: ${art.title} | Category: ${art.category}\n`;
      context += `Content: ${art.content}\n\n`;
    }
  }

  if (matchedNpcs.length > 0) {
    context += "\n=== CAMPAIGN NPCs ===\n";
    for (const npc of matchedNpcs.slice(0, 3)) {
      context += `Name: ${npc.name} | Race: ${npc.race || "unknown"} | Class: ${npc.class || "NPC"}\n`;
      context += `- Description: ${npc.description}\n`;
      context += `- Personality: ${npc.personality}\n`;
      context += `- History: ${npc.history}\n\n`;
    }
  }

  if (matches.length > 0) {
    context += "\n=== D&D 5e REFERENCE DATA (LOCAL DATABASE) ===\n";
    const uniqueNames = new Set();

    for (const match of matches) {
      const item = match.item;
      if (uniqueNames.has(item.name)) continue;
      uniqueNames.add(item.name);

      context += `Category: ${match.category.toUpperCase()} | Name: ${item.name} | Source: ${item.source || "Unknown"}\n`;

      if (match.category === "spells") {
        context += `- Level: ${item.level === 0 ? "Cantrip" : item.level} spell | School: ${item.school || ""}\n`;
        context += `- Range: ${item.range?.type || ""} | Duration: ${item.duration?.[0]?.type || ""}\n`;
        context += `- Description: ${stringifyEntries(item.entries)}\n\n`;
      } else if (match.category === "monsters") {
        context += `- CR: ${item.cr || "0"} | AC: ${item.ac?.[0]?.ac || item.ac?.[0] || "10"} | HP: ${item.hp?.average || "10"}\n`;
        context += `- Stats: STR ${item.str} DEX ${item.dex} CON ${item.con} INT ${item.int} WIS ${item.wis} CHA ${item.cha}\n`;
        if (item.action) {
          context += `- Actions: ${item.action.map(a => `${a.name}: ${stringifyEntries(a.entries)}`).join("; ")}\n`;
        }
        context += "\n";
      } else if (match.category === "items") {
        context += `- Rarity: ${item.rarity || "Common"} | Weight: ${item.weight || 0} lbs | Value: ${item.value || "0 gp"}\n`;
        context += `- Description: ${stringifyEntries(item.entries)}\n\n`;
      } else {
        context += `- Details: ${stringifyEntries(item.entries || item.entry || item.description)}\n\n`;
      }
    }
  }

  if (context) {
    context = "\n=== RELEVANT CONTEXT ===\n" + context + "========================\n";
  }

  return context;
}

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

function cleanAiFieldOutput(text, field) {
  if (typeof text !== "string") return "";
  let out = text.trim();
  out = out.replace(/^```(?:markdown|md|json)?\n?([\s\S]*?)```$/m, "$1").trim();
  out = out.replace(/^(here('s| is) (an |the )?(expanded|rewritten|generated|updated)[^:]*:\s*)/i, "");
  out = out.replace(/^["']([\s\S]*)["']$/, "$1").trim();
  if (field === "alignment") {
    const firstLine = out.split("\n").map((l) => l.trim()).find(Boolean);
    out = (firstLine || out).slice(0, 120);
  }
  return out.trim();
}

async function fetchCampaignWikiSnippet(queryText, limit = 5) {
  const words = (queryText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  const articles = [];
  for (const word of words) {
    try {
      const found = await prisma.wikiArticle.findMany({
        where: {
          OR: [
            { title: { contains: word } },
            { content: { contains: word } },
            { tags: { contains: word } },
          ],
        },
        take: 2,
        orderBy: { updatedAt: "desc" },
      });
      for (const art of found) {
        if (!articles.some((a) => a.id === art.id)) articles.push(art);
      }
    } catch (err) {
      logger.error("ai:assist", "Wiki context lookup failed", { error: err.message });
    }
  }

  return articles.slice(0, limit).map((a) => {
    const snippet = (a.content || "").replace(/\s+/g, " ").slice(0, 220);
    return `- ${a.title} (${a.category}): ${snippet}${a.content?.length > 220 ? "…" : ""}`;
  }).join("\n");
}

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

function stripAiJsonCodeFences(text) {
  let out = typeof text === "string" ? text.trim() : "";
  if (out.startsWith("```")) {
    const match = out.match(/```(?:json)?([\s\S]+?)```/);
    if (match) {
      out = match[1].trim();
    }
  }
  return out;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Settings Loader
// ---------------------------------------------------------------------------
async function loadAiSettings() {
  const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel", "ai.model", "ai.imagePromptStyle"];
  const records = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

  let provider = "";
  let apiKey = "";
  let ollamaUrl = "http://localhost:11434";
  let ollamaModel = "llama3";
  let model = "gpt-5-nano";
  let imagePromptStyle = "";

  for (const r of records) {
    if (r.key === "ai.provider") provider = r.value;
    if (r.key === "ai.apiKey") apiKey = r.value;
    if (r.key === "ai.ollamaUrl") ollamaUrl = r.value;
    if (r.key === "ai.ollamaModel") ollamaModel = r.value;
    if (r.key === "ai.model") model = r.value;
    if (r.key === "ai.imagePromptStyle") imagePromptStyle = r.value;
  }

  return { provider, apiKey, ollamaUrl, ollamaModel, model, imagePromptStyle };
}

// ---------------------------------------------------------------------------
// Message Builders
// ---------------------------------------------------------------------------
function formatHistoryOpenAi(history = []) {
  return history.map(h => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.text
  }));
}

function buildChatMessages(systemPrompt, userMessage, history = []) {
  return [
    { role: "system", content: systemPrompt },
    ...formatHistoryOpenAi(history),
    { role: "user", content: userMessage }
  ];
}

// ---------------------------------------------------------------------------
// SSE Helpers
// ---------------------------------------------------------------------------
function beginSseResponse(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

function writeSseEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Stream Pump Helpers
// ---------------------------------------------------------------------------
async function pumpOpenAiCompatibleStream(upstream, res) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Upstream responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Upstream returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        logger.warn("ai", "Failed to parse SSE data line", { payload });
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }

      const token = parsed.choices?.[0]?.delta?.content;
      if (token) {
        receivedContent = true;
        writeSseEvent(res, { type: "token", text: token });
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty streaming response from upstream.");
  }
}

async function pumpOllamaStream(upstream, res) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Ollama responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Ollama returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        logger.warn("ai", "Failed to parse Ollama stream line", { line: trimmed });
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error || "Ollama streaming error.");
      }

      const token = parsed.message?.content;
      if (token) {
        receivedContent = true;
        writeSseEvent(res, { type: "token", text: token });
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty response from Ollama server.");
  }
}

/**
 * Pump a streaming OpenAI-compatible response to an onToken callback.
 */
async function pumpOpenAiCompatibleStreamToCallback(upstream, onToken) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Upstream responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Upstream returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }

      const choice = parsed.choices?.[0];
      const content = choice?.delta?.content || choice?.text || "";
      if (content) {
        receivedContent = true;
        onToken(content);
      }
    }
  }

  if (!receivedContent) {
    throw new Error("AI returned an empty response.");
  }
}

/**
 * Pump a streaming Ollama response to an onToken callback.
 */
async function pumpOllamaStreamToCallback(upstream, onToken) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Upstream responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Ollama returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (parsed.done) {
        if (!receivedContent && parsed.message?.content) {
          onToken(parsed.message.content);
          receivedContent = true;
        }
        break;
      }

      const content = parsed.message?.content || "";
      if (content) {
        receivedContent = true;
        onToken(content);
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty response from Ollama server.");
  }
}

/**
 * Pump a streaming Gemini SSE response to an onToken callback.
 * Gemini uses SSE format: data: {"candidates":[{"content":{"parts":[{"text":"token"}]}}]}
 */
async function pumpGeminiStreamToCallback(upstream, onToken) {
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Gemini responded with status: ${upstream.status}${errText ? ` - ${errText}` : ""}`);
  }
  if (!upstream.body) {
    throw new Error("Gemini returned no response body.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      // Gemini sometimes sends bare JSON arrays as end markers
      if (payload.startsWith("[")) continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }

      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        receivedContent = true;
        onToken(text);
      }
    }
  }

  if (!receivedContent) {
    throw new Error("Empty response from Gemini API.");
  }
}

// ---------------------------------------------------------------------------
// Streaming AI call that yields tokens via onToken callback
// ---------------------------------------------------------------------------
async function performAiStreamTokens(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history, onToken, signal) {
  if (!provider) {
    throw new Error("No AI Provider configured.");
  }

  const messages = buildChatMessages(systemPrompt, userMessage, history);

  switch (provider) {
    case "lmstudio": {
      let baseUrl = ollamaUrl || "http://localhost:1234";
      if (!baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
        baseUrl = baseUrl.replace(/\/+$/, "") + "/v1";
      }
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "",
          messages,
          stream: true
        }),
        signal
      });
      await pumpOpenAiCompatibleStreamToCallback(response, onToken);
      return;
    }

    case "ollama": {
      const response = await fetch(`${ollamaUrl || "http://localhost:11434"}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "llama3",
          messages,
          stream: true
        }),
        signal
      });
      await pumpOllamaStreamToCallback(response, onToken);
      return;
    }

    case "opencode": {
      if (!apiKey) throw new Error("Missing OpenCode Zen API Key.");
      const model = ollamaModel || "gpt-5-nano";
      const response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true
        }),
        signal
      });
      await pumpOpenAiCompatibleStreamToCallback(response, onToken);
      return;
    }

    case "openai": {
      if (!apiKey) throw new Error("Missing OpenAI API Key.");
      const url = "https://api.openai.com/v1/chat/completions";
      const messages = buildChatMessages(systemPrompt, userMessage, history);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, stream: true }),
        signal
      });
      await pumpOpenAiCompatibleStreamToCallback(response, onToken);
      return;
    }

    case "gemini": {
      if (!apiKey) throw new Error("Missing Gemini API Key.");
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse";

      const contents = [];
      contents.push({
        role: "user",
        parts: [{ text: `System Instruction: ${systemPrompt}` }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood. I will roleplay and provide information according to these instructions." }]
      });
      for (const h of history) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.text }]
        });
      }
      contents.push({ role: "user", parts: [{ text: userMessage }] });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({ contents }),
        signal
      });
      await pumpGeminiStreamToCallback(response, onToken);
      return;
    }

    case "anthropic":
    case "openrouter": {
      throw new Error(
        `Streaming not supported for provider "${provider}". Use stream: false or switch to Ollama/LM Studio/OpenCode for streaming support.`
      );
    }

    default: {
      const reply = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history);
      onToken(reply);
    }
  }
}

async function performAiStream(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history, res, signal) {
  const onToken = (text) => writeSseEvent(res, { type: "token", text });
  await performAiStreamTokens(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history, onToken, signal);
}

/** Safely parse an HTTP response as JSON, with a human-readable error on failure */
async function safeParseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    const snippet = text.substring(0, 200).replace(/\n/g, " ").replace(/\r/g, "");
    throw new Error(`AI service returned an unexpected response (${snippet}${text.length > 200 ? "..." : ""}). Check your AI provider settings or try again.`);
  }
}

// ---------------------------------------------------------------------------
// HTTP AI Call Core Function
// ---------------------------------------------------------------------------
async function performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history = [], operation = "unknown") {
  if (!provider) {
    throw new Error("No AI Provider configured.");
  }

  const startTime = Date.now();

  const exec = async () => {
    switch (provider) {
    case "gemini": {
      if (!apiKey) throw new Error("Missing Gemini API Key.");
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

      const contents = [];
      contents.push({
        role: "user",
        parts: [{ text: `System Instruction: ${systemPrompt}` }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood. I will roleplay and provide information according to these instructions." }]
      });

      for (const h of history) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.text }]
        });
      }

      contents.push({
        role: "user",
        parts: [{ text: userMessage }]
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({ contents })
      });

      const data = await safeParseJsonResponse(response);
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) throw new Error("Empty response from Gemini API.");
      return reply;
    }

    case "openai": {
      if (!apiKey) throw new Error("Missing OpenAI API Key.");
      const url = "https://api.openai.com/v1/chat/completions";

      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages
        })
      });

      const data = await safeParseJsonResponse(response);
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response from OpenAI API.");
      return reply;
    }

    case "anthropic": {
      if (!apiKey) throw new Error("Missing Anthropic API Key.");
      const url = "https://api.anthropic.com/v1/messages";

      const messages = [
        ...formatHistoryOpenAi(history),
        { role: "user", content: userMessage }
      ];

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          system: systemPrompt,
          messages
        })
      });

      const data = await safeParseJsonResponse(response);
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      const reply = data.content?.[0]?.text;
      if (!reply) throw new Error("Empty response from Anthropic API.");
      return reply;
    }

    case "ollama": {
      const url = `${ollamaUrl || "http://localhost:11434"}/api/chat`;
      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "llama3",
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama responded with status: ${response.status}`);
      }

      const data = await safeParseJsonResponse(response);
      const reply = data.message?.content;
      if (!reply) throw new Error("Empty response from Ollama server.");
      return reply;
    }

    case "lmstudio": {
      let baseUrl = ollamaUrl || "http://localhost:1234";
      if (!baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
        baseUrl = baseUrl.replace(/\/+$/, "") + "/v1";
      }
      const url = `${baseUrl}/chat/completions`;
      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "",
          messages
        })
      });

      if (!response.ok) {
        throw new Error(`LM Studio responded with status: ${response.status}`);
      }

      const data = await safeParseJsonResponse(response);
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response from LM Studio.");
      return reply;
    }

    case "opencode": {
      if (!apiKey) throw new Error("Missing OpenCode Zen API Key.");
      const model = ollamaModel || "gpt-5-nano";
      const url = "https://opencode.ai/zen/v1/chat/completions";
      const messages = buildChatMessages(systemPrompt, userMessage, history);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`OpenCode Zen responded with status: ${response.status}${errText ? ` - ${errText}` : ""}`);
      }

      const data = await safeParseJsonResponse(response);
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response from OpenCode Zen API.");
      return reply;
    }

    default:
      throw new Error(`Unknown AI Provider: ${provider}`);
  }
    };

    try {
      const reply = await exec();
      logAiResponse(operation, userMessage, reply, true, null, Date.now() - startTime).catch(() => {});
      return reply;
    } catch (err) {
      logAiResponse(operation, userMessage, `Error: ${err.message}`, false, err.message, Date.now() - startTime).catch(() => {});
      throw err;
    }
}

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

// ---------------------------------------------------------------------------
// streamGenerate — shared pattern for SSE generation endpoints
// ---------------------------------------------------------------------------
async function streamGenerate(res, { operation, systemPrompt, userMessage, parser, contextBuilder }) {
  beginSseResponse(res);
  try {
    const context = contextBuilder ? await contextBuilder() : "";
    writeSseEvent(res, { type: "status", text: "Generating..." });
    const aiSettings = await loadAiSettings();
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;
    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (!provider) {
      writeSseEvent(res, { type: "error", message: "AI is not configured. Please set up API keys in Settings." });
      writeSseEvent(res, { type: "done" });
      res.end();
      return;
    }

    // Inject context into system prompt
    const fullSystemPrompt = context ? `${systemPrompt}\n\n${context}` : systemPrompt;
    const result = await performAiCall(provider, apiKey, ollamaUrl, activeModel, fullSystemPrompt, userMessage, [], operation);
    const parsed = parser(result);
    writeSseEvent(res, { type: "result", data: parsed });
    writeSseEvent(res, { type: "done" });
  } catch (err) {
    writeSseEvent(res, { type: "error", message: err.message });
    logger.error(`ai:${operation}`, "Generation failed", { error: err.message });
  } finally {
    res.end();
  }
}

module.exports = {
  logAiResponse,
  formatCreaturePromptList,
  formatEntityList,
  cleanText,
  stringifyEntries,
  findRelevantRules,
  buildNpcProfileContext,
  buildNpcRoleplaySystemPrompt,
  cleanAiFieldOutput,
  fetchCampaignWikiSnippet,
  buildAssistSystemPrompt,
  buildAssistUserMessage,
  stripAiJsonCodeFences,
  parseJsonArray,
  loadAiSettings,
  formatHistoryOpenAi,
  buildChatMessages,
  beginSseResponse,
  writeSseEvent,
  pumpOpenAiCompatibleStream,
  pumpOllamaStream,
  pumpOpenAiCompatibleStreamToCallback,
  pumpOllamaStreamToCallback,
  performAiStreamTokens,
  performAiStream,
  safeParseJsonResponse,
  performAiCall,
  loadSessionAiContext,
  ASSIST_ACTIONS_REQUIRING_TEXT,
  streamGenerate,
};
