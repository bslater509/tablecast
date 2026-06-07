// =============================================================================
// Tablecast — AI & MCP Router
// Endpoints:  GET  /api/ai/mcp          - SSE connection stream
//             POST /api/ai/mcp/message  - JSON-RPC message target
//             POST /api/ai/chat         - Built-in AI Chat (RAG & Roleplay, SSE stream optional)
//             GET  /api/ai/settings     - Get AI settings (masked keys)
//             PUT  /api/ai/settings     - Update AI settings
//             POST /api/ai/test         - Test connection settings
// =============================================================================
"use strict";

const { Router } = require("express");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { server: mcpServer, createMcpServer } = require("../mcp-server");
const prisma = require("../prisma");
const { requireDm, getRequestUser } = require("../auth");
const referenceSearch = require("../utils/referenceSearch");

const router = Router();

// Track active SSE transports by sessionId
const activeTransports = new Map();

// ---------------------------------------------------------------------------
// MCP SSE Transport Routes
// ---------------------------------------------------------------------------

router.get("/mcp", async (req, res) => {
  try {
    // Instantiate SSE transport directing POST messages to /api/ai/mcp/message
    const transport = new SSEServerTransport("/api/ai/mcp/message", res);
    
    // Connect MCP server to this transport. This calls transport.start() internally.
    const connectionServer = createMcpServer();
    await connectionServer.connect(transport);

    const sessionId = transport.sessionId;
    activeTransports.set(sessionId, transport);
    console.error(`[MCP SSE] New connection established. Session: ${sessionId}`);

    req.on("close", () => {
      console.error(`[MCP SSE] Connection closed. Cleaning session: ${sessionId}`);
      activeTransports.delete(sessionId);
    });
  } catch (err) {
    console.error("[MCP SSE] Error setting up transport:", err.message);
    if (!res.headersSent) {
      res.status(500).send("Failed to initiate MCP connection");
    }
  }
});

router.post("/mcp/message", async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).send("Missing sessionId query parameter");
  }

  const transport = activeTransports.get(sessionId);
  if (!transport) {
    return res.status(404).send(`Session '${sessionId}' not found or closed`);
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error(`[MCP SSE] Error handling post message for session ${sessionId}:`, err.message);
    if (!res.headersSent) {
      res.status(500).send("Error processing message");
    }
  }
});

// ---------------------------------------------------------------------------
// Helper: Keyword-based RAG Rules Querying
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

async function findRelevantRules(message, user) {
  if (!message) return "";

  const excludedWords = new Set([
    "what", "with", "that", "your", "about", "the", "and", "for", "are", "but", 
    "not", "you", "was", "out", "him", "her", "his", "who", "its", "can", 
    "use", "has", "how", "why", "get", "set", "one", "two", "new", "old", 
    "our", "any", "all", "she", "they", "them", "this", "from", "their", "there",
    "will", "would", "shall", "should", "some", "more", "most", "than", "then", "into"
  ]);

  // Split into keywords, allowing 3+ characters and key 2-character D&D terms
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
      console.error("[RAG Wiki Search Error]", err.message);
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
      console.error("[RAG NPC Search Error]", err.message);
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

  // Search each category for matches
  for (const cat of categories) {
    for (const word of words.slice(0, 5)) { // limit keywords searched
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
      console.error("[AI Assist] Wiki context lookup failed:", err.message);
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
    partyRelationship: {
      generate: `Describe how this NPC feels about and interacts with the player party (attitude, trust, goals, potential conflict). ${outputRule} 40–100 words.`,
      expand: `Expand the party relationship with specific attitudes, rumors, and roleplay hooks. Preserve existing facts. ${outputRule}`,
      friendly: `Rewrite the relationship so the NPC is broadly friendly or helpful toward the party while staying in character. ${outputRule}`,
      hostile: `Rewrite the relationship so the NPC is suspicious, antagonistic, or opposed to the party while staying plausible. ${outputRule}`,
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

async function loadAiSettings() {
  const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel", "ai.model"];
  const records = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

  let provider = "";
  let apiKey = "";
  let ollamaUrl = "http://localhost:11434";
  let ollamaModel = "llama3";
  let model = "gpt-5-nano";

  for (const r of records) {
    if (r.key === "ai.provider") provider = r.value;
    if (r.key === "ai.apiKey") apiKey = r.value;
    if (r.key === "ai.ollamaUrl") ollamaUrl = r.value;
    if (r.key === "ai.ollamaModel") ollamaModel = r.value;
    if (r.key === "ai.model") model = r.value;
  }

  return { provider, apiKey, ollamaUrl, ollamaModel, model };
}

// ---------------------------------------------------------------------------
// HTTP AI Call Core Function
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
        console.warn("[AI] Failed to parse SSE data line:", payload);
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
        console.warn("[AI] Failed to parse Ollama stream line:", trimmed);
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

async function performAiStream(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history, res, signal) {
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
      await pumpOpenAiCompatibleStream(response, res);
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
      await pumpOllamaStream(response, res);
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
      await pumpOpenAiCompatibleStream(response, res);
      return;
    }

    default: {
      const reply = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history);
      writeSseEvent(res, { type: "token", text: reply });
      writeSseEvent(res, { type: "done" });
    }
  }
}

async function performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history = []) {
  if (!provider) {
    throw new Error("No AI Provider configured.");
  }

  switch (provider) {
    case "gemini": {
      if (!apiKey) throw new Error("Missing Gemini API Key.");
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
      
      const contents = [];
      // Combine systemPrompt + message in a clean instruction structure
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

      const data = await response.json();
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

      const data = await response.json();
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

      const data = await response.json();
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

      const data = await response.json();
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

      const data = await response.json();
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

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response from OpenCode Zen API.");
      return reply;
    }

    default:
      throw new Error(`Unknown AI Provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// GET /api/ai/models - Get available models from local Ollama/LM Studio
// ---------------------------------------------------------------------------
router.get("/models", requireDm, async (req, res) => {
  const { provider, url } = req.query;
  if (!provider || !url) {
    return res.status(400).json({ error: "Missing provider or url query parameter" });
  }

  try {
    if (provider === "lmstudio") {
      let baseUrl = url;
      if (!baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
        baseUrl = baseUrl.replace(/\/+$/, "") + "/v1";
      }
      const response = await fetch(`${baseUrl}/models`);
      if (!response.ok) {
        throw new Error(`LM Studio returned status ${response.status}`);
      }
      const data = await response.json();
      const models = (data.data || []).map(m => m.id);
      res.json({ models });
    } else if (provider === "ollama") {
      const response = await fetch(`${url}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }
      const data = await response.json();
      const models = (data.models || []).map(m => m.name);
      res.json({ models });
    } else {
      res.json({ models: [] });
    }
  } catch (err) {
    console.error("[AI Models Fetch Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai/zen-models - Fetch available models from OpenCode Zen
// ---------------------------------------------------------------------------
router.get("/zen-models", requireDm, async (req, res) => {
  try {
    const savedKey = await prisma.appSetting.findUnique({ where: { key: "ai.apiKey" } });
    const apiKey = savedKey?.value || "";

    if (!apiKey) {
      return res.status(400).json({ error: "No API key configured. Save your OpenCode Zen API key first." });
    }

    const response = await fetch("https://opencode.ai/zen/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Zen API returned status ${response.status}${errText ? ` - ${errText}` : ""}`);
    }

    const data = await response.json();
    const models = (data.data || []).map(m => m.id).sort();
    res.json({ models });
  } catch (err) {
    console.error("[AI Zen Models] Fetch failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai/settings - Load AI settings (masked API keys)
// ---------------------------------------------------------------------------
router.get("/settings", requireDm, async (req, res) => {
  try {
    const settings = await prisma.appSetting.findMany({
      where: {
        key: { in: ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel", "ai.model"] }
      }
    });

    const config = {
      provider: "gemini",
      apiKey: "",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "llama3",
      model: "gpt-5-nano",
      hasKey: false
    };

    for (const s of settings) {
      if (s.key === "ai.provider") config.provider = s.value;
      if (s.key === "ai.ollamaUrl") config.ollamaUrl = s.value;
      if (s.key === "ai.ollamaModel") config.ollamaModel = s.value;
      if (s.key === "ai.model") config.model = s.value;
      if (s.key === "ai.apiKey" && s.value) {
        config.hasKey = true;
        const len = s.value.length;
        if (len > 8) {
          config.apiKey = s.value.substring(0, 4) + "..." + s.value.substring(len - 4);
        } else {
          config.apiKey = "****";
        }
      }
    }

    res.json(config);
  } catch (err) {
    console.error("[AI Settings] Fetch failed:", err.message);
    res.status(500).json({ error: "Failed to load AI settings." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/ai/settings - Update AI settings
// ---------------------------------------------------------------------------
router.put("/settings", requireDm, async (req, res) => {
  try {
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = req.body;

    if (provider) {
      await prisma.appSetting.upsert({
        where: { key: "ai.provider" },
        update: { value: provider },
        create: { key: "ai.provider", value: provider }
      });
    }

    if (ollamaUrl !== undefined) {
      await prisma.appSetting.upsert({
        where: { key: "ai.ollamaUrl" },
        update: { value: ollamaUrl },
        create: { key: "ai.ollamaUrl", value: ollamaUrl }
      });
    }

    if (ollamaModel !== undefined) {
      await prisma.appSetting.upsert({
        where: { key: "ai.ollamaModel" },
        update: { value: ollamaModel },
        create: { key: "ai.ollamaModel", value: ollamaModel }
      });
    }

    if (model !== undefined) {
      await prisma.appSetting.upsert({
        where: { key: "ai.model" },
        update: { value: model },
        create: { key: "ai.model", value: model }
      });
    }

    // Only update API Key if it's not the masked fallback placeholder
    if (apiKey !== undefined && apiKey !== "" && !apiKey.includes("...")) {
      await prisma.appSetting.upsert({
        where: { key: "ai.apiKey" },
        update: { value: apiKey },
        create: { key: "ai.apiKey", value: apiKey }
      });
    }

    res.json({ success: true, message: "AI settings saved successfully" });
  } catch (err) {
    console.error("[AI Settings] Save failed:", err.message);
    res.status(500).json({ error: "Failed to update AI settings." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/test - Test credentials
// ---------------------------------------------------------------------------
router.post("/test", requireDm, async (req, res) => {
  try {
    const { provider, apiKey, ollamaUrl, ollamaModel, model } = req.body;

    let testKey = apiKey;
    if (apiKey && apiKey.includes("...")) {
      const saved = await prisma.appSetting.findUnique({ where: { key: "ai.apiKey" } });
      testKey = saved?.value || "";
    }

    const activeModel = model || ollamaModel || "gpt-5-nano";
    const testPrompt = "Reply with exactly 'OK' and nothing else.";
    const response = await performAiCall(
      provider,
      testKey,
      ollamaUrl,
      activeModel,
      "You are a test helper.",
      testPrompt
    );

    res.json({ success: true, reply: response.trim() });
  } catch (err) {
    console.error("[AI Test] Connection test failed:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/generate-npc-options - Generate multiple NPC concepts (DM only)
// ---------------------------------------------------------------------------
router.post("/generate-npc-options", requireDm, async (req, res) => {
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

    // Begin SSE response for progress streaming
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

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, `Generate NPC options for: ${prompt.trim()}`);

    writeSseEvent(res, { type: "status", message: "Parsing results..." });

    // Parse JSON safely
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
      console.error("[AI NPC Options] JSON parse failed on text:", rawResponse);
      throw new Error("Failed to generate valid NPC options from the AI response.");
    }

    if (!optionsData.options || !Array.isArray(optionsData.options) || optionsData.options.length === 0) {
      throw new Error("AI returned an empty options list.");
    }

    writeSseEvent(res, { type: "result", data: { options: optionsData.options } });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    console.error("[AI NPC Options] Failed:", err.message);
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate NPC options." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate NPC options." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/generate-npc - AI NPC Creator (DM only)
// ---------------------------------------------------------------------------
router.post("/generate-npc", requireDm, async (req, res) => {
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

    // Begin SSE response for progress streaming
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

    // Build user message with selected option context if available
    let userMessage = `Create NPC: ${prompt.trim()}`;
    if (selectedOption) {
      userMessage = `Create the full NPC statblock for "${selectedOption.name}" (${selectedOption.race} ${selectedOption.class}). Original request: ${prompt.trim()}`;
    }

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage);

    writeSseEvent(res, { type: "status", message: "Parsing and validating statblock..." });

    // Parse JSON safely
    let cleanJsonStr = rawResponse.trim();
    // Strip markdown codeblock if present
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
      console.error("[AI NPC Gen] JSON parse failed on text:", rawResponse);
      throw new Error("Failed to generate a valid NPC JSON structure from the AI response.");
    }

    writeSseEvent(res, { type: "result", data: npcData });
    writeSseEvent(res, { type: "done" });
    res.end();
  } catch (err) {
    console.error("[AI NPC Gen] Failed:", err.message);
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to generate NPC." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate NPC." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/expand-text - AI Text Enhancer (DM only)
// ---------------------------------------------------------------------------
router.post("/expand-text", requireDm, async (req, res) => {
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
    const rawReply = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, userMessage);
    const reply = cleanAiFieldOutput(rawReply, fieldName);

    if (!reply) {
      throw new Error("AI returned empty content.");
    }

    res.json({ reply });
  } catch (err) {
    console.error("[AI Expand] Failed:", err.message);
    res.status(500).json({ error: err.message || "Failed to process text." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/chat - Process built-in D&D assistant chat
// ---------------------------------------------------------------------------
router.post("/chat", async (req, res) => {
  try {
    const { message, npcId, history, stream: wantsStream } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message content is required." });
    }

    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required to use AI Chat." });
    }

    const { provider, apiKey, ollamaUrl, ollamaModel, model } = await loadAiSettings();

    if (!provider) {
      return res.status(400).json({ error: "AI assistant is not configured. Please ask the DM to set up API keys in Settings." });
    }

    // 1. Fetch relevant local reference material (enforces visibility constraints)
    const referenceContext = await findRelevantRules(message, user);

    // 2. Build system instructions
    let systemPrompt = `You are a helpful D&D 5e assistant, dungeon master helper, and rules scholar.
You have access to a local D&D database. Whenever relevant, rely on the rules matches provided in the prompt context to answer questions accurately and authoritatively.

${referenceContext}

Keep your responses concise, readable, and structured in Markdown.`;

    if (npcId) {
      const npc = await prisma.npc.findUnique({ where: { id: Number(npcId) } });
      if (npc) {
        systemPrompt = buildNpcRoleplaySystemPrompt(npc, referenceContext);
      }
    }

    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (wantsStream) {
      beginSseResponse(res);
      const controller = new AbortController();
      req.on("close", () => controller.abort());

      writeSseEvent(res, { type: "context", text: referenceContext });

      try {
        await performAiStream(
          provider,
          apiKey,
          ollamaUrl,
          activeModel,
          systemPrompt,
          message,
          history,
          res,
          controller.signal
        );
        writeSseEvent(res, { type: "done" });
      } catch (streamErr) {
        if (streamErr.name === "AbortError") {
          return;
        }
        console.error("[AI Chat] Streaming failed:", streamErr.message);
        writeSseEvent(res, { type: "error", message: streamErr.message || "Failed to query AI assistant." });
      }

      res.end();
      return;
    }

    // 3. Make the API call to the configured LLM provider
    const reply = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, message, history);

    res.json({ reply, context: referenceContext });
  } catch (err) {
    console.error("[AI Chat] Chat operation failed:", err.message);
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to query AI assistant." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to query AI assistant." });
  }
});

module.exports = {
  router,
  performAiCall,
  performAiStream,
  findRelevantRules,
  buildNpcProfileContext,
  buildNpcRoleplaySystemPrompt,
  loadAiSettings,
};
