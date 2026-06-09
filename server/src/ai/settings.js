// =============================================================================
// Tablecast — AI Settings Routes
// Provider CRUD, model listing, connection test
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const logger = require("../utils/logger");
const { requireDm } = require("../auth");
const { loadAiSettings, performAiCall } = require("./helpers");

const router = Router();

// ---------------------------------------------------------------------------
// GET /models - Get available models from local Ollama/LM Studio
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
    logger.error("ai:models", "Models fetch error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /zen-models - Fetch available models from OpenCode Zen
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
    logger.error("ai:models", "Zen models fetch failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /settings - Load AI settings (masked API keys)
// ---------------------------------------------------------------------------
router.get("/settings", requireDm, async (req, res) => {
  try {
    const settings = await prisma.appSetting.findMany({
      where: {
        key: { in: ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel", "ai.model", "ai.imagePromptStyle"] }
      }
    });

    const config = {
      provider: "gemini",
      apiKey: "",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "llama3",
      model: "gpt-5-nano",
      imagePromptStyle: "",
      hasKey: false
    };

    for (const s of settings) {
      if (s.key === "ai.provider") config.provider = s.value;
      if (s.key === "ai.ollamaUrl") config.ollamaUrl = s.value;
      if (s.key === "ai.ollamaModel") config.ollamaModel = s.value;
      if (s.key === "ai.model") config.model = s.value;
      if (s.key === "ai.imagePromptStyle") config.imagePromptStyle = s.value;
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
    logger.error("ai:settings", "Settings fetch failed", { error: err.message });
    res.status(500).json({ error: "Failed to load AI settings." });
  }
});

// ---------------------------------------------------------------------------
// PUT /settings - Update AI settings
// ---------------------------------------------------------------------------
router.put("/settings", requireDm, async (req, res) => {
  try {
    const { provider, apiKey, ollamaUrl, ollamaModel, model, imagePromptStyle } = req.body;

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

    if (imagePromptStyle !== undefined) {
      await prisma.appSetting.upsert({
        where: { key: "ai.imagePromptStyle" },
        update: { value: imagePromptStyle },
        create: { key: "ai.imagePromptStyle", value: imagePromptStyle }
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
    logger.error("ai:settings", "Settings save failed", { error: err.message });
    res.status(500).json({ error: "Failed to update AI settings." });
  }
});

// ---------------------------------------------------------------------------
// POST /test - Test credentials
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
      testPrompt,
      [],
      "test"
    );

    res.json({ success: true, reply: response.trim() });
  } catch (err) {
    logger.error("ai:test", "Connection test failed", { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /image-style - Get the DM's configured image prompt style
// Public endpoint (no auth) so anyone copying an NPC image prompt can use it.
// ---------------------------------------------------------------------------
router.get("/image-style", async (req, res) => {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "ai.imagePromptStyle" }
    });
    res.json({ style: setting?.value || "" });
  } catch (err) {
    logger.error("ai:image", "Fetch failed", { error: err.message });
    res.json({ style: "" });
  }
});

module.exports = router;
