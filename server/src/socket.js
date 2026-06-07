"use strict";

const prisma = require("./prisma");
const { isDmUser } = require("./auth");

const MAX_COORDINATE = 10000;
const MAX_FOG_POLYGONS = 200;
const MAX_FOG_POINTS = 500;

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    const clientId = socket.id;
    console.log(`[Socket] Client connected: ${clientId}`);

    io.emit("chat:message", {
      id: generateId(),
      sender: "System",
      text: "A new adventurer has joined the session.",
      timestamp: Date.now(),
      type: "system",
    });

    socket.on("chat:send", async (payload) => {
      if (!payload || typeof payload.text !== "string" || !payload.text.trim()) {
        return;
      }

      const rawText = payload.text.trim();
      let message = {
        id: generateId(),
        userId: sanitizeUserId(payload.userId),
        sender: sanitizeShortText(payload.sender, "Anonymous"),
        text: rawText.slice(0, 2000),
        timestamp: Date.now(),
        type: sanitizeShortText(payload.type, "user"),
        rollDetails: payload.rollDetails || null,
      };

      console.log(`[Socket] ${message.sender}: ${message.text} (${message.type})`);

      if (message.type === "roll" && message.rollDetails) {
        try {
          const rd = message.rollDetails;
          await prisma.roll.create({
            data: {
              sender: message.sender,
              rollName: rd.rollName || "Dice Roll",
              formula: rd.formula || "",
              rolls: JSON.stringify(rd.rolls || []),
              modifier: rd.modifier || 0,
              total: rd.total || 0,
              diceTheme: rd.diceTheme || "default",
              diceColor: rd.diceColor || "#7c3aed",
            }
          });
        } catch (dbErr) {
          console.error("[Socket] Failed to save roll to DB:", dbErr);
        }
      }

      message = await persistChatMessage(message);
      io.emit("chat:message", message);

      // --- Intercept AI Assistant Commands ---
      try {
        const { performAiCall, findRelevantRules, buildNpcRoleplaySystemPrompt } = require("./routes/ai");

        // Fetch user from DB to evaluate role and permissions
        let userObj = null;
        if (message.userId) {
          userObj = await prisma.user.findUnique({
            where: { id: message.userId },
            select: { role: true }
          });
        }

        // 1. /ai [query] -> General AI rules/concepts assistant
        if (rawText.startsWith("/ai ")) {
          const query = rawText.slice(4).trim();
          if (!query) return;

          // Load AI settings from Database
          const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel"];
          const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

          let provider = "";
          let apiKey = "";
          let ollamaUrl = "http://localhost:11434";
          let ollamaModel = "llama3";

          for (const s of settings) {
            if (s.key === "ai.provider") provider = s.value;
            if (s.key === "ai.apiKey") apiKey = s.value;
            if (s.key === "ai.ollamaUrl") ollamaUrl = s.value;
            if (s.key === "ai.ollamaModel") ollamaModel = s.value;
          }

          if (!provider) {
            return emitPersistedChatMessage(io, {
              sender: "D&D AI Assistant",
              text: "AI is not configured. The DM must set up API keys in settings.",
              type: "system"
            });
          }

          // Fetch relevant rules with user role restrictions
          const ruleContext = await findRelevantRules(query, userObj);
          const systemPrompt = `You are a helpful D&D 5e assistant, DM companion, and rules expert.
Answer the question accurately. Rely on the local database context below if applicable.
${ruleContext}
Keep your answer clear, concise, and formatted in Markdown.`;

          const reply = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, query);
          await emitPersistedChatMessage(io, {
            sender: "D&D AI Assistant",
            text: reply,
            type: "system"
          });
        }

        // 2. /roleplay [NPC Name]: [message] OR /roleplay [NPC Name] [message]
        else if (rawText.startsWith("/roleplay ")) {
          const commandText = rawText.slice(10).trim();
          let npcName = "";
          let messageText = "";

          const colonMatch = commandText.match(/^([^:]+):\s*(.+)$/);
          if (colonMatch) {
            npcName = colonMatch[1].trim();
            messageText = colonMatch[2].trim();
          } else {
            const spaceIdx = commandText.indexOf(" ");
            if (spaceIdx !== -1) {
              npcName = commandText.slice(0, spaceIdx).trim();
              messageText = commandText.slice(spaceIdx).trim();
            }
          }

          if (!npcName || !messageText) {
            return emitPersistedChatMessage(io, {
              sender: "System",
              text: "Usage: `/roleplay [NPC Name]: [message]` or `/roleplay [NPC Name] [message]`",
              type: "system"
            });
          }

          // Fetch NPC details
          const npc = await prisma.npc.findFirst({
            where: { name: { contains: npcName } }
          });

          if (!npc) {
            return emitPersistedChatMessage(io, {
              sender: "System",
              text: `NPC template matching '${npcName}' not found. Create them in the NPCs panel first.`,
              type: "system"
            });
          }

          // Load AI settings
          const keys = ["ai.provider", "ai.apiKey", "ai.ollamaUrl", "ai.ollamaModel"];
          const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } } });

          let provider = "";
          let apiKey = "";
          let ollamaUrl = "http://localhost:11434";
          let ollamaModel = "llama3";

          for (const s of settings) {
            if (s.key === "ai.provider") provider = s.value;
            if (s.key === "ai.apiKey") apiKey = s.value;
            if (s.key === "ai.ollamaUrl") ollamaUrl = s.value;
            if (s.key === "ai.ollamaModel") ollamaModel = s.value;
          }

          if (!provider) {
            return emitPersistedChatMessage(io, {
              sender: npc.name,
              text: "*The NPC remains silent. (AI is not configured. The DM must set up API keys in settings.)*",
              type: "system"
            });
          }

          const ruleContext = await findRelevantRules(messageText, userObj);
          const systemPrompt = buildNpcRoleplaySystemPrompt(npc, ruleContext);

          const reply = await performAiCall(provider, apiKey, ollamaUrl, ollamaModel, systemPrompt, messageText);
          await emitPersistedChatMessage(io, {
            sender: npc.name,
            text: reply,
            type: "npc" // Flag this message as NPC response
          });
        }
      } catch (err) {
        console.error("[Socket AI Error]", err.message);
        await emitPersistedChatMessage(io, {
          sender: "System",
          text: `AI error: ${err.message}`,
          type: "system"
        });
      }
    });

    socket.on("chat:typing", (payload) => {
      socket.broadcast.emit("chat:typing", {
        sender: sanitizeShortText(payload?.sender, "Someone"),
      });
    });

    socket.on("token:move", async (payload) => {
      try {
        const parsed = validateTokenMovePayload(payload);
        if (!parsed.ok) return emitSocketError(socket, "token:move", parsed.error);

        const token = await prisma.token.findUnique({
          where: { id: parsed.value.id },
          include: { character: { select: { userId: true } } },
        });
        if (!token) return emitSocketError(socket, "token:move", "Token not found.");

        const isDm = await isDmUser(parsed.value.userId);
        const isOwner = token.character?.userId === parsed.value.userId;
        if (!isDm && !isOwner) {
          return emitSocketError(socket, "token:move", "You do not have permission to move this token.");
        }

        const updatedToken = await prisma.token.update({
          where: { id: parsed.value.id },
          data: { x: parsed.value.x, y: parsed.value.y },
          include: { character: true, npc: true, monster: true },
        });
        io.emit("token:moved", updatedToken);
      } catch (err) {
        console.error("[Socket] Error updating token position:", err.message);
      }
    });

    socket.on("token:create", async (payload) => {
      try {
        if (payload?.id) {
          const parsed = validateIdPayload(payload, "id");
          if (!parsed.ok) return emitSocketError(socket, "token:create", parsed.error);
          if (!(await isDmUser(parsed.value.userId))) {
            return emitSocketError(socket, "token:create", "DM privileges are required.");
          }

          const token = await prisma.token.findUnique({
            where: { id: parsed.value.id },
            include: { character: true, npc: true, monster: true },
          });
          if (!token) return emitSocketError(socket, "token:create", "Token not found.");
          io.emit("token:created", token);
          return;
        }

        const parsed = validateTokenCreatePayload(payload);
        if (!parsed.ok) return emitSocketError(socket, "token:create", parsed.error);
        if (!(await isDmUser(parsed.value.userId))) {
          return emitSocketError(socket, "token:create", "DM privileges are required.");
        }

        const data = {
          mapId: parsed.value.mapId,
          label: parsed.value.label,
          imageUrl: parsed.value.imageUrl,
          x: parsed.value.x,
          y: parsed.value.y,
          stats: parsed.value.stats,
        };
        if (parsed.value.characterId) {
          data.characterId = parsed.value.characterId;
        }
        if (parsed.value.npcId) {
          data.npcId = parsed.value.npcId;
        }
        if (parsed.value.monsterId) {
          data.monsterId = parsed.value.monsterId;
        }

        const newToken = await prisma.token.create({
          data,
          include: { character: true, npc: true, monster: true },
        });
        io.emit("token:created", newToken);
      } catch (err) {
        console.error("[Socket] Error creating token:", err.message);
      }
    });

    socket.on("token:delete", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "id");
        if (!parsed.ok) return emitSocketError(socket, "token:delete", parsed.error);
        if (!(await isDmUser(parsed.value.userId))) {
          return emitSocketError(socket, "token:delete", "DM privileges are required.");
        }

        if (payload.broadcastOnly === true) {
          io.emit("token:deleted", { id: parsed.value.id });
          return;
        }

        await prisma.token.delete({
          where: { id: parsed.value.id },
        });
        io.emit("token:deleted", { id: parsed.value.id });
      } catch (err) {
        console.error("[Socket] Error deleting token:", err.message);
      }
    });

    socket.on("fog:update", async (payload) => {
      try {
        const parsed = validateFogPayload(payload);
        if (!parsed.ok) return emitSocketError(socket, "fog:update", parsed.error);
        if (!(await isDmUser(parsed.value.userId))) {
          return emitSocketError(socket, "fog:update", "DM privileges are required.");
        }

        const updatedMap = await prisma.map.update({
          where: { id: parsed.value.mapId },
          data: { fogState: JSON.stringify(parsed.value.fogState) },
        });
        io.emit("fog:updated", {
          mapId: updatedMap.id,
          fogState: updatedMap.fogState,
        });
      } catch (err) {
        console.error("[Socket] Error updating fog state:", err.message);
      }
    });

    socket.on("map:select", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "mapId");
        if (!parsed.ok) return emitSocketError(socket, "map:select", parsed.error);
        if (!(await isDmUser(parsed.value.userId))) {
          return emitSocketError(socket, "map:select", "DM privileges are required.");
        }
        io.emit("map:selected", { mapId: parsed.value.mapId });
      } catch (err) {
        console.error("[Socket] Error selecting map:", err.message);
      }
    });

    socket.on("map:delete", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "mapId");
        if (!parsed.ok) return emitSocketError(socket, "map:delete", parsed.error);
        if (!(await isDmUser(parsed.value.userId))) {
          return emitSocketError(socket, "map:delete", "DM privileges are required.");
        }
        io.emit("map:deleted", { mapId: parsed.value.mapId });
      } catch (err) {
        console.error("[Socket] Error broadcasting map deletion:", err.message);
      }
    });

    socket.on("encounter:refresh", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "encounterId");
        if (!parsed.ok) return emitSocketError(socket, "encounter:refresh", parsed.error);

        const encounter = await prisma.encounter.findUnique({
          where: { id: parsed.value.encounterId },
          select: { id: true, mapId: true, round: true, turnIndex: true, status: true },
        });
        if (!encounter) return emitSocketError(socket, "encounter:refresh", "Encounter not found.");

        io.emit("encounter:updated", {
          encounterId: encounter.id,
          mapId: encounter.mapId,
          status: encounter.status,
          round: encounter.round,
          turnIndex: encounter.turnIndex,
        });
      } catch (err) {
        console.error("[Socket] Error broadcasting encounter refresh:", err.message);
      }
    });

    socket.on("encounter:turn", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "encounterId");
        if (!parsed.ok) return emitSocketError(socket, "encounter:turn", parsed.error);

        const encounter = await prisma.encounter.findUnique({
          where: { id: parsed.value.encounterId },
          select: { id: true, mapId: true, round: true, turnIndex: true, status: true },
        });
        if (!encounter) return emitSocketError(socket, "encounter:turn", "Encounter not found.");

        io.emit("encounter:turnChanged", {
          encounterId: encounter.id,
          mapId: encounter.mapId,
          round: encounter.round,
          turnIndex: encounter.turnIndex,
          status: encounter.status,
        });
      } catch (err) {
        console.error("[Socket] Error broadcasting encounter turn:", err.message);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Client disconnected: ${clientId} (${reason})`);

      io.emit("chat:message", {
        id: generateId(),
        sender: "System",
        text: "An adventurer has left the session.",
        timestamp: Date.now(),
        type: "system",
      });
    });

    socket.on("error", (err) => {
      console.error(`[Socket] Error on ${clientId}:`, err.message);
    });
  });
}

async function emitPersistedChatMessage(io, partial) {
  const message = await persistChatMessage({
    id: generateId(),
    userId: sanitizeUserId(partial.userId),
    sender: sanitizeShortText(partial.sender, "System"),
    text: typeof partial.text === "string" ? partial.text.slice(0, 2000) : "",
    timestamp: Date.now(),
    type: sanitizeShortText(partial.type, "system"),
    rollDetails: partial.rollDetails || null,
  });
  io.emit("chat:message", message);
}

async function persistChatMessage(message) {
  if (!message.text.trim()) return message;

  try {
    const saved = await prisma.chatMessage.create({
      data: {
        id: message.id,
        userId: message.userId,
        sender: message.sender,
        text: message.text,
        type: message.type,
        rollDetails: serializeRollDetails(message.rollDetails),
      },
    });

    return {
      ...message,
      timestamp: saved.createdAt.getTime(),
      createdAt: saved.createdAt,
    };
  } catch (dbErr) {
    console.error("[Socket] Failed to save chat message to DB:", dbErr.message);
    return message;
  }
}

function sanitizeUserId(value) {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function serializeRollDetails(rollDetails) {
  if (!rollDetails) return null;
  const storedRollDetails = {
    ...rollDetails,
    status: "done",
  };
  return JSON.stringify(storedRollDetails);
}

function validateTokenMovePayload(payload) {
  const idResult = validateIdPayload(payload, "id");
  if (!idResult.ok) return idResult;

  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!isValidCoordinate(x) || !isValidCoordinate(y)) {
    return { ok: false, error: "Token coordinates must be finite numbers in range." };
  }

  return { ok: true, value: { ...idResult.value, x, y } };
}

function validateTokenCreatePayload(payload) {
  const mapResult = validateIdPayload(payload, "mapId");
  if (!mapResult.ok) return mapResult;

  const x = payload.x === undefined ? 0 : Number(payload.x);
  const y = payload.y === undefined ? 0 : Number(payload.y);
  if (!isValidCoordinate(x) || !isValidCoordinate(y)) {
    return { ok: false, error: "Token coordinates must be finite numbers in range." };
  }

  const characterId = payload.characterId ? Number(payload.characterId) : null;
  if (characterId !== null && (!Number.isInteger(characterId) || characterId <= 0)) {
    return { ok: false, error: "characterId must be a positive integer." };
  }

  const npcId = payload.npcId ? Number(payload.npcId) : null;
  if (npcId !== null && (!Number.isInteger(npcId) || npcId <= 0)) {
    return { ok: false, error: "npcId must be a positive integer." };
  }

  const monsterId = payload.monsterId ? Number(payload.monsterId) : null;
  if (monsterId !== null && (!Number.isInteger(monsterId) || monsterId <= 0)) {
    return { ok: false, error: "monsterId must be a positive integer." };
  }

  return {
    ok: true,
    value: {
      ...mapResult.value,
      label: sanitizeShortText(payload.label, ""),
      imageUrl: sanitizeShortText(payload.imageUrl, ""),
      stats: typeof payload.stats === "string" ? payload.stats : null,
      characterId,
      npcId,
      monsterId,
      x,
      y,
    },
  };
}

function validateFogPayload(payload) {
  const mapResult = validateIdPayload(payload, "mapId");
  if (!mapResult.ok) return mapResult;

  let fogState = payload.fogState;
  if (typeof fogState === "string") {
    try {
      fogState = JSON.parse(fogState);
    } catch {
      return { ok: false, error: "fogState must be valid JSON." };
    }
  }

  if (!Array.isArray(fogState) || fogState.length > MAX_FOG_POLYGONS) {
    return { ok: false, error: "fogState must be an array within the polygon limit." };
  }

  for (const polygon of fogState) {
    if (!polygon || !["hide", "reveal"].includes(polygon.type) || !Array.isArray(polygon.points)) {
      return { ok: false, error: "Each fog polygon needs a type and points array." };
    }
    if (polygon.points.length > MAX_FOG_POINTS) {
      return { ok: false, error: "Fog polygon has too many points." };
    }
    for (const point of polygon.points) {
      if (!point || !isValidCoordinate(Number(point.x)) || !isValidCoordinate(Number(point.y))) {
        return { ok: false, error: "Fog polygon points must have valid x and y coordinates." };
      }
    }
  }

  return { ok: true, value: { ...mapResult.value, fogState } };
}

function validateIdPayload(payload, idField) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Payload must be an object." };
  }

  const id = Number(payload[idField]);
  const userId = Number(payload.userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: `${idField} must be a positive integer.` };
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, error: "userId must be a positive integer." };
  }

  return { ok: true, value: { [idField]: id, userId } };
}

function isValidCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= MAX_COORDINATE;
}

function sanitizeShortText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 240) : fallback;
}

function emitSocketError(socket, event, message) {
  socket.emit("action:error", { event, message });
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = { registerSocketHandlers };
