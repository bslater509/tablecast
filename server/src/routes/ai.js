// =============================================================================
// Tablecast — AI & MCP Router
// Endpoints:  GET  /api/ai/mcp          - SSE connection stream
//             POST /api/ai/mcp/message  - JSON-RPC message target
//             POST /api/ai/chat         - Built-in AI Chat (RAG & Roleplay)
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

  // Split into keywords longer than 3 chars
  const words = message.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && w !== "what" && w !== "with" && w !== "that" && w !== "your" && w !== "about");

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
// HTTP AI Call Core Function
// ---------------------------------------------------------------------------
async function performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, userMessage, history = []) {
  if (!provider) {
    throw new Error("No AI Provider configured.");
  }

  // Support historical messages mapping
  const formatHistoryOpenAi = () => {
    return history.map(h => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.text
    }));
  };

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
      
      const messages = [
        { role: "system", content: systemPrompt },
        ...formatHistoryOpenAi(),
        { role: "user", content: userMessage }
      ];

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
        ...formatHistoryOpenAi(),
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
      const messages = [
        { role: "system", content: systemPrompt },
        ...formatHistoryOpenAi(),
        { role: "user", content: userMessage }
      ];

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
      const messages = [
        { role: "system", content: systemPrompt },
        ...formatHistoryOpenAi(),
        { role: "user", content: userMessage }
      ];

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
// GET /api/ai/settings - Load AI settings (masked API keys)
// ---------------------------------------------------------------------------
router.get("/settings", requireDm, async (req, res) => {
  try {
    const settings = await prisma.appSetting.findMany({
      where: {
        key: { in: ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel"] }
      }
    });

    const config = {
      provider: "gemini",
      apiKey: "",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "llama3",
      hasKey: false
    };

    for (const s of settings) {
      if (s.key === "ai.provider") config.provider = s.value;
      if (s.key === "ai.ollamaUrl") config.ollamaUrl = s.value;
      if (s.key === "ai.ollamaModel") config.ollamaModel = s.value;
      if (s.key === "ai.apiKey" && s.value) {
        config.hasKey = true;
        // Return masked key
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
    const { provider, apiKey, ollamaUrl, ollamaModel } = req.body;

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
    const { provider, apiKey, ollamaUrl, ollamaModel } = req.body;

    let testKey = apiKey;
    if (apiKey && apiKey.includes("...")) {
      // Load actual key from DB if user passed the masked key placeholder
      const saved = await prisma.appSetting.findUnique({ where: { key: "ai.apiKey" } });
      testKey = saved?.value || "";
    }

    const testPrompt = "Reply with exactly 'OK' and nothing else.";
    const response = await performAiCall(
      provider,
      testKey,
      ollamaUrl,
      ollamaModel,
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
// POST /api/ai/generate-npc - AI NPC Creator (DM only)
// ---------------------------------------------------------------------------
router.post("/generate-npc", requireDm, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "NPC prompt description is required." });
    }

    const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel"];
    const records = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

    let provider = "";
    let apiKey = "";
    let ollamaUrl = "http://localhost:11434";
    let ollamaModel = "llama3";

    for (const r of records) {
      if (r.key === "ai.provider") provider = r.value;
      if (r.key === "ai.apiKey") apiKey = r.value;
      if (r.key === "ai.ollamaUrl") ollamaUrl = r.value;
      if (r.key === "ai.ollamaModel") ollamaModel = r.value;
    }

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    const systemPrompt = `You are a D&D 5e NPC and monster statblock generator. 
Given a description of an NPC, generate a complete NPC profile.
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

    const rawResponse = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, `Create NPC: ${prompt}`);

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

    res.json(npcData);
  } catch (err) {
    console.error("[AI NPC Gen] Failed:", err.message);
    res.status(500).json({ error: err.message || "Failed to generate NPC." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/expand-text - AI Text Enhancer (DM only)
// ---------------------------------------------------------------------------
router.post("/expand-text", requireDm, async (req, res) => {
  try {
    const { text, action } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text content is required." });
    }

    const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel"];
    const records = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

    let provider = "";
    let apiKey = "";
    let ollamaUrl = "http://localhost:11434";
    let ollamaModel = "llama3";

    for (const r of records) {
      if (r.key === "ai.provider") provider = r.value;
      if (r.key === "ai.apiKey") apiKey = r.value;
      if (r.key === "ai.ollamaUrl") ollamaUrl = r.value;
      if (r.key === "ai.ollamaModel") ollamaModel = r.value;
    }

    if (!provider) {
      return res.status(400).json({ error: "AI is not configured. Please set up API keys in Settings." });
    }

    let systemPrompt = "You are a D&D campaign helper assisting a Dungeon Master. Rewrite or generate the text as requested.";
    if (action === "expand") {
      systemPrompt = "Expand on the provided D&D lore description, adding flavor, sensory details, and worldbuilding depth in markdown.";
    } else if (action === "summarize") {
      systemPrompt = "Provide a clean, bulleted summary of the provided text, capturing all key points for a DM's quick reference.";
    } else if (action === "make_dramatic") {
      systemPrompt = "Rewrite the text to be dramatic, dark, and filled with classic D&D fantasy descriptions.";
    } else if (action === "style_5e") {
      systemPrompt = "Format and rewrite the text to sound like an official D&D 5e sourcebook page, using terms and layout conventions from the core books.";
    }

    const reply = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, text);
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
    const { message, npcId, history } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message content is required." });
    }

    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required to use AI Chat." });
    }

    // Load actual configurations from DB
    const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel"];
    const records = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

    let provider = "";
    let apiKey = "";
    let ollamaUrl = "http://localhost:11434";
    let ollamaModel = "llama3";

    for (const r of records) {
      if (r.key === "ai.provider") provider = r.value;
      if (r.key === "ai.apiKey") apiKey = r.value;
      if (r.key === "ai.ollamaUrl") ollamaUrl = r.value;
      if (r.key === "ai.ollamaModel") ollamaModel = r.value;
    }

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
        systemPrompt = `You are roleplaying as the D&D NPC named "${npc.name}".
Stay in character AT ALL TIMES. Respond in character, using fantasy-themed tone and speech patterns appropriate for "${npc.name}".

NPC PROFILE:
- Name: ${npc.name}
- Race: ${npc.race || "unknown"}
- Class/Description: ${npc.class || "NPC"}
- Level: ${npc.level}
- AC: ${npc.ac} | HP: ${npc.hp}/${npc.maxHp} | CR: ${npc.cr}
- Stats: STR:${npc.strength} DEX:${npc.dexterity} CON:${npc.constitution} INT:${npc.intelligence} WIS:${npc.wisdom} CHA:${npc.charisma}
- Actions: ${npc.actions}
- Inventory: ${npc.inventory}
- Biography/Description: ${npc.description || ""}

Local campaign context (if any rules are mentioned):
${referenceContext}

Respond to the user's message as "${npc.name}". Keep it immersive and engaging!`;
      }
    }

    // 3. Make the API call to the configured LLM provider
    const reply = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, message, history);

    res.json({ reply });
  } catch (err) {
    console.error("[AI Chat] Chat operation failed:", err.message);
    res.status(500).json({ error: err.message || "Failed to query AI assistant." });
  }
});

router.performAiCall = performAiCall;
router.findRelevantRules = findRelevantRules;

module.exports = router;
