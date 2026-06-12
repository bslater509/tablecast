// =============================================================================
// Tablecast — AI Chat & Conversation Routes
// Chat with AI assistant, NPC roleplay, conversation management
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const logger = require("../utils/logger");
const { getRequestUser } = require("../auth");
const {
  // eslint-disable-next-line unused-imports/no-unused-vars
  loadAiSettings, performAiCall, performAiStreamTokens, performAiStream,
  findRelevantRules, buildNpcRoleplaySystemPrompt,
  beginSseResponse, writeSseEvent
} = require("./helpers");
const { scanTextForRollChips } = require("../utils/diceRollDetection");

const router = Router();

// ---------------------------------------------------------------------------
// POST /chat - Process built-in D&D assistant chat
// ---------------------------------------------------------------------------
router.post("/chat", async (req, res) => {
  try {
    const { message, npcId, history, stream: wantsStream, conversationId, characterId } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message content is required." });
    }
    if (message.length > 10000) {
      return res.status(400).json({ error: "Message too long. Maximum 10,000 characters." });
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
        if (user.role !== "DM" && !npc.isVisibleToPlayers) {
          return res.status(403).json({ error: "This NPC is not available for roleplay." });
        }
        systemPrompt = buildNpcRoleplaySystemPrompt(npc, referenceContext);
      }
    }

    // Inject character context if characterId provided
    if (characterId) {
      try {
        const character = await prisma.character.findUnique({
          where: { id: Number(characterId) },
          select: { userId: true, name: true, race: true, class: true, level: true, hp: true, maxHp: true, strength: true, dexterity: true, constitution: true, intelligence: true, wisdom: true, charisma: true },
        });
        if (character) {
          if (user.role !== "DM" && character.userId !== user.id) {
            return res.status(403).json({ error: "You are not authorized to use this character." });
          }
          const charContext = `\n=== PLAYER CHARACTER CONTEXT ===\nName: ${character.name}\nRace: ${character.race || "unknown"}\nClass: ${character.class || "unknown"}\nLevel: ${character.level}\nHP: ${character.hp}/${character.maxHp}\nStats: STR ${character.strength} DEX ${character.dexterity} CON ${character.constitution} INT ${character.intelligence} WIS ${character.wisdom} CHA ${character.charisma}\n================================\n`;
          if (npcId) {
            systemPrompt += `\nThe player's character speaking to you is:\n${charContext}`;
          } else {
            systemPrompt += `\nThe player's character (for context):\n${charContext}`;
          }
        }
      } catch (charErr) {
        logger.error("ai:chat", "Failed to fetch character context", { error: charErr.message });
      }
    }

    const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

    if (wantsStream) {
      beginSseResponse(res);
      const controller = new AbortController();
      req.on("close", () => controller.abort());

      writeSseEvent(res, { type: "context", text: referenceContext });

      let fullResponse = "";

      try {
        await performAiStreamTokens(
          provider,
          apiKey,
          ollamaUrl,
          activeModel,
          systemPrompt,
          message,
          history,
          (token) => {
            fullResponse += token;
            writeSseEvent(res, { type: "token", text: token });
          },
          controller.signal
        );

        if (conversationId) {
          try {
            const convId = Number(conversationId);
            const conv = await prisma.aiConversation.findUnique({
              where: { id: convId },
              select: { userId: true },
            });
            if (conv && conv.userId === user.id) {
              await prisma.aiMessage.createMany({
                data: [
                  { conversationId: convId, role: "user", text: message },
                  { conversationId: convId, role: "assistant", text: fullResponse },
                ],
              });
              await prisma.aiConversation.update({
                where: { id: convId },
                data: { updatedAt: new Date() },
              });
            }
          } catch (saveErr) {
            logger.error("ai:chat", "Failed to auto-save conversation", { error: saveErr.message });
          }
        }

        // Scan for dice roll chips in the completed response
        const rollChips = scanTextForRollChips(fullResponse);
        if (rollChips.length > 0) {
          writeSseEvent(res, { type: "rollChips", chips: rollChips });
        }

        writeSseEvent(res, { type: "done" });
      } catch (streamErr) {
        if (streamErr.name === "AbortError") {
          return;
        }
        logger.error("ai:chat", "Streaming failed", { error: streamErr.message });
        writeSseEvent(res, { type: "error", message: streamErr.message || "Failed to query AI assistant." });
      }

      res.end();
      return;
    }

    // Non-streaming response
    const reply = await performAiCall(provider, apiKey, ollamaUrl, activeModel, systemPrompt, message, history, "chat");

    if (conversationId) {
      try {
        const convId = Number(conversationId);
        const conv = await prisma.aiConversation.findUnique({
          where: { id: convId },
          select: { userId: true },
        });
        if (conv && conv.userId === user.id) {
          await prisma.aiMessage.createMany({
            data: [
              { conversationId: convId, role: "user", text: message },
              { conversationId: convId, role: "assistant", text: reply },
            ],
          });
          await prisma.aiConversation.update({
            where: { id: convId },
            data: { updatedAt: new Date() },
          });
        }
      } catch (saveErr) {
        logger.error("ai:chat", "Failed to auto-save conversation", { error: saveErr.message });
      }
    }

    const rollChips = scanTextForRollChips(reply);

    res.json({ reply, context: referenceContext, conversationId: conversationId || null, rollChips: rollChips.length > 0 ? rollChips : undefined });
  } catch (err) {
    logger.error("ai:chat", "Chat operation failed", { error: err.message });
    if (res.headersSent) {
      writeSseEvent(res, { type: "error", message: err.message || "Failed to query AI assistant." });
      res.end();
      return;
    }
    res.status(500).json({ error: err.message || "Failed to query AI assistant." });
  }
});

// ---------------------------------------------------------------------------
// AI Conversation Management
// ---------------------------------------------------------------------------

// GET /conversations — List user's conversations
router.get("/conversations", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const conversations = await prisma.aiConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
    res.json(conversations);
  } catch (err) {
    logger.error("ai:conversations", "List failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /conversations — Create new conversation
router.post("/conversations", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const { type, npcId, title } = req.body;
    const conversation = await prisma.aiConversation.create({
      data: {
        userId: user.id,
        type: type || "rules",
        npcId: npcId || null,
        title: title || "",
      },
    });
    res.status(201).json(conversation);
  } catch (err) {
    logger.error("ai:conversations", "Create failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /conversations/:id — Get conversation with messages
router.get("/conversations/:id", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const conversation = await prisma.aiConversation.findFirst({
      where: { id: Number(req.params.id), userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json(conversation);
  } catch (err) {
    logger.error("ai:conversations", "Get failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /conversations/:id — Update conversation title
router.patch("/conversations/:id", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const { title } = req.body;
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: Number(req.params.id), userId: user.id },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const updated = await prisma.aiConversation.update({
      where: { id: Number(req.params.id) },
      data: { title: title || "" },
    });
    res.json(updated);
  } catch (err) {
    logger.error("ai:conversations", "Update failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /conversations/:id — Delete conversation
router.delete("/conversations/:id", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const conversation = await prisma.aiConversation.findFirst({
      where: { id: Number(req.params.id), userId: user.id },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    await prisma.aiConversation.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    logger.error("ai:conversations", "Delete failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /conversations/:id/messages — Batch-save messages to a conversation
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required." });
    }
    if (messages.length > 50) {
      return res.status(400).json({ error: "Maximum 50 messages per batch." });
    }

    const conversation = await prisma.aiConversation.findFirst({
      where: { id: Number(req.params.id), userId: user.id },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const VALID_ROLES = new Set(["user", "assistant"]);
    const created = await prisma.$transaction(
      messages.map((msg) => {
        const role = VALID_ROLES.has(msg.role) ? msg.role : "user";
        const text = (msg.text || "").slice(0, 10000);
        return prisma.aiMessage.create({
          data: {
            conversationId: Number(req.params.id),
            role,
            text,
          },
        });
      })
    );

    // Auto-generate title from first exchange if empty
    if (!conversation.title && messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === "user");
      const generatedTitle = firstUserMsg
        ? firstUserMsg.text.slice(0, 80) + (firstUserMsg.text.length > 80 ? "…" : "")
        : "";
      if (generatedTitle) {
        await prisma.aiConversation.update({
          where: { id: Number(req.params.id) },
          data: { title: generatedTitle },
        });
      }
    }

    res.status(201).json(created);
  } catch (err) {
    logger.error("ai:conversations", "Save messages failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
