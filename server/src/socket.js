"use strict";

const prisma = require("./prisma");
const { performAiCall, performAiStream, performAiStreamTokens, findRelevantRules, buildNpcRoleplaySystemPrompt, loadAiSettings } = require("./routes/ai");
const { sanitizeText, sanitizeShortText } = require("./utils/sanitize");

const debug = require("./utils/debug");
const logger = require("./utils/logger");
const log = debug("tablecast:socket");

const MAX_COORDINATE = 10000;
const MAX_FOG_POLYGONS = 200;
const MAX_FOG_POINTS = 500;

// In-memory sound state for multi-client sync
let currentSoundState = {
  trackId: null,
  action: "stop",
  position: 0,
  volume: 0.5,
  timestamp: Date.now(),
};

function registerSocketHandlers(io) {
  // Auth middleware: authenticate via socket handshake
  // Supports two modes:
  //   1) characterId (players) — looks up Character; sets socket.data.characterId + socket.data.identity
  //   2) userId (DM)          — looks up User; sets socket.data.user + socket.data.identity
  io.use(async (socket, next) => {
    try {
      // 1) Try character auth (players)
      const rawCharId = socket.handshake.auth?.characterId || socket.handshake.query?.characterId;
      if (rawCharId) {
        const charId = Number(rawCharId);
        if (Number.isInteger(charId) && charId > 0) {
          const character = await prisma.character.findUnique({ where: { id: charId } });
          if (character) {
            socket.data.characterId = charId;
            socket.data.identity = {
              id: character.id,
              username: character.name,
              role: "PLAYER",
              diceTheme: character.diceTheme,
              diceColor: character.diceColor,
              isCharacter: true,
              type: "character",
            };
            logger.info("socket:auth", "Socket authenticated as character", { characterId: charId });
          }
        }
        return next();
      }

      // 2) Try user auth (DM)
      const rawUserId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
      if (rawUserId) {
        const userId = Number(rawUserId);
        if (Number.isInteger(userId) && userId > 0) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, role: true, diceTheme: true, diceColor: true },
          });
          if (user) {
            socket.data.user = user;
            socket.data.identity = {
              id: user.id,
              username: user.username,
              role: user.role,
              diceTheme: user.diceTheme,
              diceColor: user.diceColor,
              isCharacter: false,
              type: "user",
            };
            logger.info("socket:auth", "Socket authenticated as user", { userId: user.id, role: user.role });
          }
        }
      }
      next();
    } catch (err) {
      logger.error("socket:auth", "Auth middleware error", { error: err.message });
      next(err);
    }
  });

  io.on("connection", (socket) => {
    const clientId = socket.id;
    logger.info("socket", "Client connected", { clientId });
    log("connection — clientId=%s transport=%s", clientId, socket.conn.transport.name);

    io.emit("chat:message", {
      id: generateId(),
      sender: "System",
      text: "A new adventurer has joined the session.",
      timestamp: Date.now(),
      type: "system",
    });

    socket.on("chat:send", async (payload, ackCallback) => {
      if (!payload || typeof payload.text !== "string" || !payload.text.trim()) {
        log("chat:send — rejected (invalid payload from %s)", clientId);
        return;
      }
      log("chat:send — sender=%s type=%s text_len=%d", payload.sender, payload.type, payload.text?.length);

      const rawText = payload.text.trim();
      let message = {
        id: generateId(),
        userId: socket.data.user?.id ?? sanitizeUserId(payload.userId),
        characterId: socket.data.characterId || null,
        sender: sanitizeShortText(payload.sender, "Anonymous"),
        text: sanitizeText(rawText.slice(0, 2000)),
        timestamp: Date.now(),
        type: sanitizeShortText(payload.type, "user"),
        rollDetails: payload.rollDetails || null,
      };

      logger.info("socket", "Chat message", { sender: message.sender, text: message.text?.slice(0, 100), type: message.type });

      if (message.type === "roll" && message.rollDetails) {
        try {
          const rd = message.rollDetails;
          log("chat:send — persisting roll formula=%s total=%d", rd.formula, rd.total);
          await prisma.roll.create({
            data: {
              sender: message.sender,
              characterId: socket.data.characterId || null,
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
          logger.error("socket:db", "Failed to save roll to DB", { error: dbErr?.message || String(dbErr) });
        }
      }

      message = await persistChatMessage(message);
      io.emit("chat:message", message);

      // Send ACK back to the sender for status indicator
      if (typeof ackCallback === "function") {
        ackCallback({ id: message.id, timestamp: message.timestamp });
      }

      // --- Intercept AI Assistant Commands ---
      try {
        // Use authenticated user from socket middleware
        const userObj = socket.data.user || null;

        // Load AI settings once for all AI commands
        const aiSettings = await loadAiSettings();
        const { provider, apiKey, ollamaUrl, ollamaModel, model } = aiSettings;

        // Enforce max query length for AI commands to prevent cost abuse
        const MAX_AI_QUERY_LENGTH = 2000;
        if (rawText.startsWith("/ai ") && rawText.length > MAX_AI_QUERY_LENGTH) {
          return emitPersistedChatMessage(io, {
            sender: "System",
            text: `AI query too long (${rawText.length} chars). Maximum is ${MAX_AI_QUERY_LENGTH} characters.`,
            type: "system"
          });
        }
        if (rawText.startsWith("/roleplay ") && rawText.length > MAX_AI_QUERY_LENGTH) {
          return emitPersistedChatMessage(io, {
            sender: "System",
            text: `Roleplay message too long (${rawText.length} chars). Maximum is ${MAX_AI_QUERY_LENGTH} characters.`,
            type: "system"
          });
        }

        // 1. /ai [query] -> General AI rules/concepts assistant (streamed)
        if (rawText.startsWith("/ai ")) {
          const query = rawText.slice(4).trim();
          if (!query) return;

          const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

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

          const placeholderMsg = {
            id: generateId(),
            sender: "D&D AI Assistant",
            text: "_Thinking…_",
            timestamp: Date.now(),
            type: "system",
          };
          io.emit("chat:message", placeholderMsg);

          try {
            let fullText = "";
            const msgId = placeholderMsg.id;

            await performAiStreamTokens(
              provider, apiKey, ollamaUrl, activeModel,
              systemPrompt, query, [],
              (token) => {
                fullText += token;
                io.emit("chat:message:update", { id: msgId, text: fullText });
              },
              null
            );

            const finalMsg = {
              id: msgId,
              userId: sanitizeUserId(payload.userId),
              sender: "D&D AI Assistant",
              text: fullText,
              timestamp: Date.now(),
              type: "system",
            };
            await persistChatMessage(finalMsg);
            // No second emit needed — placeholder was already emitted as chat:message
            // and updated via chat:message:update streaming events above
          } catch (streamErr) {
            logger.error("socket:ai", "AI stream error", { error: streamErr.message });
            io.emit("chat:message:update", {
              id: placeholderMsg.id,
              text: `*AI Error: ${streamErr.message || "Unknown error"}*`,
            });
            await emitPersistedChatMessage(io, {
              sender: "System",
              text: `AI stream error: ${streamErr instanceof Error ? streamErr.message : "Unknown error"}`,
              type: "system",
            });
          }
        }

        // 2. /roleplay [NPC Name]: [message]
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

          // NPC visibility check: non-DM users can't roleplay hidden NPCs
          if (!npc.isVisibleToPlayers && socket.data.user?.role !== "DM") {
            return emitPersistedChatMessage(io, {
              sender: "System",
              text: `NPC '${npcName}' exists but is hidden from players.`,
              type: "system"
            });
          }

          const activeModel = provider === "opencode" ? (model || "gpt-5-nano") : ollamaModel;

          if (!provider) {
            return emitPersistedChatMessage(io, {
              sender: npc.name,
              text: "*The NPC remains silent. (AI is not configured. The DM must set up API keys in settings.)*",
              type: "system"
            });
          }

          const ruleContext = await findRelevantRules(messageText, userObj);
          const systemPrompt = buildNpcRoleplaySystemPrompt(npc, ruleContext);

          const placeholderMsg = {
            id: generateId(),
            sender: npc.name,
            text: "*" + npc.name + " is thinking…*",
            timestamp: Date.now(),
            type: "npc",
          };
          io.emit("chat:message", placeholderMsg);

          try {
            let fullText = "";
            const msgId = placeholderMsg.id;

            await performAiStreamTokens(
              provider, apiKey, ollamaUrl, activeModel,
              systemPrompt, messageText, [],
              (token) => {
                fullText += token;
                io.emit("chat:message:update", { id: msgId, text: fullText });
              },
              null
            );

            const finalMsg = {
              id: msgId,
              userId: sanitizeUserId(payload.userId),
              sender: npc.name,
              text: fullText,
              timestamp: Date.now(),
              type: "npc",
            };
            await persistChatMessage(finalMsg);
            // No second emit needed — placeholder was already emitted as chat:message
            // and updated via chat:message:update streaming events above
          } catch (streamErr) {
            logger.error("socket:ai", "NPC stream error", { error: streamErr.message });
            io.emit("chat:message:update", {
              id: placeholderMsg.id,
              text: `*${npc.name} is unable to respond. (${streamErr.message || "Unknown error"})*`,
            });
            await emitPersistedChatMessage(io, {
              sender: "System",
              text: `NPC stream error: ${streamErr instanceof Error ? streamErr.message : "Unknown error"}`,
              type: "system",
            });
          }
        }

        // 3. /help — Show command reference
        else if (rawText === "/help") {
          const helpText = `**📖 Available Commands**

**/roll** \`<formula>\` or **/r** \`<formula>\`
Roll dice with 3D animation. Examples: \`/roll 1d20\`, \`/r 2d6+3\`

**/ai** \`<question>\`
Ask the D&D AI Assistant about rules, lore, or get DM help.

**/roleplay** \`<NPC Name>: <message>\`
Roleplay with an NPC. Example: \`/roleplay Elminster: Tell me about the weave\`

**/help**
Show this command reference.`;

          return emitPersistedChatMessage(io, {
            sender: "System",
            text: helpText,
            type: "system",
          });
        }
      } catch (err) {
        logger.error("socket:ai", "AI chat error", { error: err instanceof Error ? err.message : String(err) });
        await emitPersistedChatMessage(io, {
          sender: "System",
          text: `AI error: ${err instanceof Error ? err.message : "Unknown error"}`,
          type: "system"
        });
      }
    });

    socket.on("chat:typing", (payload) => {
      log("chat:typing — sender=%s", payload?.sender);
      socket.broadcast.emit("chat:typing", {
        sender: sanitizeShortText(payload?.sender, "Someone"),
      });
    });

    socket.on("token:move", async (payload) => {
      try {
        const parsed = validateTokenMovePayload(payload);
        if (!parsed.ok) {
          log("token:move — validation failed: %s", parsed.error);
          return emitSocketError(socket, "token:move", parsed.error);
        }
        log("token:move — id=%d x=%d y=%d userId=%d", parsed.value.id, payload.x, payload.y, parsed.value.userId);

        const token = await prisma.token.findUnique({
          where: { id: parsed.value.id },
          include: { character: { select: { userId: true } } },
        });
        if (!token) return emitSocketError(socket, "token:move", "Token not found.");

        const isDm = socket.data.user?.role === "DM";
        const isOwner = token.characterId === socket.data.characterId;
        if (!isDm && !isOwner) {
          return emitSocketError(socket, "token:move", "You do not have permission to move this token.");
        }

        const moveData = { x: parsed.value.x, y: parsed.value.y };
        // If VTT feature fields are provided, update them too
        if (payload.conditions !== undefined) moveData.conditions = payload.conditions;
        if (payload.visionRadius !== undefined) moveData.visionRadius = Number(payload.visionRadius) || 0;
        if (payload.darkvisionRadius !== undefined) moveData.darkvisionRadius = Number(payload.darkvisionRadius) || 0;
        if (payload.auraRadius !== undefined) moveData.auraRadius = Number(payload.auraRadius) || 0;
        if (payload.auraColor !== undefined) moveData.auraColor = String(payload.auraColor || "");

        const updatedToken = await prisma.token.update({
          where: { id: parsed.value.id },
          data: moveData,
          include: { character: true, npc: true, monster: true },
        });
        io.emit("token:moved", updatedToken);
      } catch (err) {
        logger.error("socket:token", "Error updating token position", { error: err.message });
      }
    });

    socket.on("token:create", async (payload) => {
      try {
        if (payload?.id) {
          const parsed = validateIdPayload(payload, "id");
          if (!parsed.ok) {
            log("token:create — validation failed: %s", parsed.error);
            return emitSocketError(socket, "token:create", parsed.error);
          }
          if (socket.data.user?.role !== "DM") {
            log("token:create — rejected (not DM) userId=%d", socket.data.user?.id);
            return emitSocketError(socket, "token:create", "DM privileges are required.");
          }

          const token = await prisma.token.findUnique({
            where: { id: parsed.value.id },
            include: { character: true, npc: true, monster: true },
          });
          if (!token) return emitSocketError(socket, "token:create", "Token not found.");
          log("token:create — broadcasting existing token id=%d", token.id);
          io.emit("token:created", token);
          return;
        }

        const parsed = validateTokenCreatePayload(payload);
        if (!parsed.ok) {
          log("token:create — validation failed: %s", parsed.error);
          return emitSocketError(socket, "token:create", parsed.error);
        }
        if (socket.data.user?.role !== "DM") {
          log("token:create — rejected (not DM) userId=%d", socket.data.user?.id);
          return emitSocketError(socket, "token:create", "DM privileges are required.");
        }
        log("token:create — creating label=%s mapId=%d", parsed.value.label, parsed.value.mapId);

        const data = {
          mapId: parsed.value.mapId,
          label: parsed.value.label,
          imageUrl: parsed.value.imageUrl,
          x: parsed.value.x,
          y: parsed.value.y,
          stats: parsed.value.stats,
          conditions: payload.conditions || "[]",
          visionRadius: Number(payload.visionRadius) || 0,
          darkvisionRadius: Number(payload.darkvisionRadius) || 0,
          auraRadius: Number(payload.auraRadius) || 0,
          auraColor: String(payload.auraColor || ""),
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
        logger.error("socket:token", "Error creating token", { error: err.message });
      }
    });

    socket.on("token:delete", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "id");
        if (!parsed.ok) {
          log("token:delete — validation failed: %s", parsed.error);
          return emitSocketError(socket, "token:delete", parsed.error);
        }
        if (socket.data.user?.role !== "DM") {
          log("token:delete — rejected (not DM) userId=%d", socket.data.user?.id);
          return emitSocketError(socket, "token:delete", "DM privileges are required.");
        }

        if (payload.broadcastOnly === true) {
          log("token:delete — broadcast only id=%d", parsed.value.id);
          io.emit("token:deleted", { id: parsed.value.id });
          return;
        }

        log("token:delete — removing id=%d", parsed.value.id);
        await prisma.token.delete({
          where: { id: parsed.value.id },
        });
        io.emit("token:deleted", { id: parsed.value.id });
      } catch (err) {
        logger.error("socket:token", "Error deleting token", { error: err.message });
      }
    });

    socket.on("token:ping", (payload) => {
      try {
        // payload: { mapId, x, y, type: "move"|"attack"|"look"|"danger", sender: string }
        const mapId = Number(payload?.mapId);
        if (!Number.isInteger(mapId) || mapId <= 0) return;

        const x = Number(payload?.x);
        const y = Number(payload?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        const type = ["move", "attack", "look", "danger"].includes(payload?.type) ? payload.type : "look";
        const sender = payload?.sender || "Someone";

        logger.info("socket:ping", "Map ping", { mapId, x, y, type, sender });

        // Broadcast to all clients (including sender for confirmation)
        io.emit("token:pong", {
          mapId,
          x,
          y,
          type,
          sender,
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error("socket:ping", "Error handling ping", { error: err.message });
      }
    });

    socket.on("fog:update", async (payload) => {
      try {
        const parsed = validateFogPayload(payload);
        if (!parsed.ok) {
          log("fog:update — validation failed: %s", parsed.error);
          return emitSocketError(socket, "fog:update", parsed.error);
        }
        if (socket.data.user?.role !== "DM") {
          log("fog:update — rejected (not DM) userId=%d", socket.data.user?.id);
          return emitSocketError(socket, "fog:update", "DM privileges are required.");
        }
        log("fog:update — mapId=%d polygons=%d", parsed.value.mapId, parsed.value.fogState?.length);

        const updatedMap = await prisma.map.update({
          where: { id: parsed.value.mapId },
          data: { fogState: JSON.stringify(parsed.value.fogState) },
        });
        io.emit("fog:updated", {
          mapId: updatedMap.id,
          fogState: updatedMap.fogState,
        });
      } catch (err) {
        logger.error("socket:fog", "Error updating fog state", { error: err.message });
      }
    });

    socket.on("map:select", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "mapId");
        if (!parsed.ok) {
          log("map:select — validation failed: %s", parsed.error);
          return emitSocketError(socket, "map:select", parsed.error);
        }
        if (socket.data.user?.role !== "DM") {
          log("map:select — rejected (not DM) userId=%d", socket.data.user?.id);
          return emitSocketError(socket, "map:select", "DM privileges are required.");
        }
        log("map:select — mapId=%d", parsed.value.mapId);
        io.emit("map:selected", { mapId: parsed.value.mapId });
      } catch (err) {
        logger.error("socket:map", "Error selecting map", { error: err.message });
      }
    });

    socket.on("map:delete", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "mapId");
        if (!parsed.ok) {
          log("map:delete — validation failed: %s", parsed.error);
          return emitSocketError(socket, "map:delete", parsed.error);
        }
        if (socket.data.user?.role !== "DM") {
          log("map:delete — rejected (not DM) userId=%d", socket.data.user?.id);
          return emitSocketError(socket, "map:delete", "DM privileges are required.");
        }
        log("map:delete — deleting map id=%d", parsed.value.mapId);
        await prisma.map.delete({
          where: { id: parsed.value.mapId },
        });
        io.emit("map:deleted", { mapId: parsed.value.mapId });
      } catch (err) {
        logger.error("socket:map", "Error broadcasting map deletion", { error: err.message });
      }
    });

    // Soundboard events — DM broadcasts play/stop/seek to all clients
    socket.on("sound:play", (payload) => {
      if (socket.data.user?.role !== "DM") {
        return emitSocketError(socket, "sound:play", "DM privileges are required.");
      }
      const { trackId, action, position, volume } = payload || {};
      currentSoundState = {
        trackId: trackId || null,
        action: action || "stop",
        position: typeof position === "number" ? position : 0,
        volume: typeof volume === "number" ? volume : 0.5,
        timestamp: Date.now(),
      };
      logger.info("socket:sound", "Sound state updated", {
        trackId: currentSoundState.trackId,
        action: currentSoundState.action,
      });
      io.emit("sound:state", currentSoundState);
    });

    // Reconnecting client requests current sound state
    socket.on("sound:sync", () => {
      socket.emit("sound:state", currentSoundState);
    });

    // Reconnection sync protocol — client sends last known state, server responds with diffs
    socket.on("reconnect:sync", async (payload) => {
      try {
        const clientState = payload?.lastKnownState || {};
        const diffs = {};

        // Compare token positions
        if (clientState.tokenPositions) {
          const tokens = await prisma.token.findMany({
            select: { id: true, x: true, y: true },
          });
          const serverPositions = {};
          for (const t of tokens) {
            serverPositions[t.id] = { x: t.x, y: t.y };
          }
          // Only send back tokens that differ
          diffs.tokenPositions = {};
          for (const [id, pos] of Object.entries(serverPositions)) {
            const clientPos = clientState.tokenPositions[id];
            if (!clientPos || clientPos.x !== pos.x || clientPos.y !== pos.y) {
              diffs.tokenPositions[id] = pos;
            }
          }
        }

        // Compare fog state
        if (clientState.fogState && clientState.fogState.mapId) {
          const map = await prisma.map.findUnique({
            where: { id: clientState.fogState.mapId },
            select: { id: true, fogState: true },
          });
          if (map && map.fogState !== clientState.fogState.state) {
            diffs.fogState = { mapId: map.id, state: map.fogState };
          }
        }

        // Send current encounter state
        if (clientState.activeEncounterId) {
          const encounter = await prisma.encounter.findUnique({
            where: { id: clientState.activeEncounterId },
            select: { id: true, round: true, turnIndex: true, status: true },
          });
          if (encounter) {
            diffs.encounter = encounter;
          }
        }

        logger.info("socket:reconnect", "Reconnect sync sent", { clientId: socket.id, diffCount: Object.keys(diffs).length });
        socket.emit("reconnect:state", diffs);
      } catch (err) {
        logger.error("socket:reconnect", "Reconnect sync error", { error: err.message });
      }
    });

    // Calendar — client requests current calendar config + weather
    socket.on("calendar:request", async () => {
      try {
        const prisma_local = require("./prisma");
        const setting = await prisma_local.appSetting.findUnique({
          where: { key: "calendar.config" },
        });
        if (setting) {
          try {
            const config = JSON.parse(setting.value);
            socket.emit("calendar:data", config);
          } catch {
            // Parse error — send nothing
          }
        }
      } catch (err) {
        logger.error("socket:calendar", "Error handling calendar:request", { error: err.message });
      }
    });

    // Handout events — client requests handouts for a specific character
    socket.on("handout:request", async (payload) => {
      try {
        const characterId = payload?.characterId
          ? Number(payload.characterId)
          : socket.data.characterId;
        if (!characterId || !Number.isInteger(characterId) || characterId <= 0) return;

        const handouts = await prisma.handout.findMany({
          orderBy: { createdAt: "desc" },
        });

        // Filter handouts where targetCharacterIds is empty or contains this character
        const filtered = handouts.filter((h) => {
          let targets;
          try { targets = JSON.parse(h.targetCharacterIds || "[]"); } catch { targets = []; }
          return targets.length === 0 || targets.includes(characterId);
        });

        socket.emit("handout:data", { handouts: filtered, characterId });
        logger.info("socket:handout", "Handouts requested", { characterId, count: filtered.length });
      } catch (err) {
        logger.error("socket:handout", "Error fetching handouts", { error: err.message });
      }
    });

    socket.on("encounter:refresh", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "encounterId");
        if (!parsed.ok) {
          log("encounter:refresh — validation failed: %s", parsed.error);
          return emitSocketError(socket, "encounter:refresh", parsed.error);
        }
        if (socket.data.user?.role !== "DM") {
          return emitSocketError(socket, "encounter:refresh", "DM privileges are required.");
        }
        log("encounter:refresh — encounterId=%d", parsed.value.encounterId);

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
        logger.error("socket:encounter", "Error broadcasting encounter refresh", { error: err.message });
      }
    });

    socket.on("encounter:turn", async (payload) => {
      try {
        const parsed = validateIdPayload(payload, "encounterId");
        if (!parsed.ok) {
          log("encounter:turn — validation failed: %s", parsed.error);
          return emitSocketError(socket, "encounter:turn", parsed.error);
        }
        if (socket.data.user?.role !== "DM") {
          return emitSocketError(socket, "encounter:turn", "DM privileges are required.");
        }
        log("encounter:turn — encounterId=%d", parsed.value.encounterId);

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
        logger.error("socket:encounter", "Error broadcasting encounter turn", { error: err.message });
      }
    });

    // —— Ping system (player map markers) ——
    socket.on("token:ping", (payload) => {
      try {
        const { userId, mapId, x, y, type } = payload || {};
        if (!userId || !mapId || typeof x !== "number" || typeof y !== "number") {
          log("token:ping — invalid payload: %j", payload);
          return;
        }

        // Clamp coordinates
        const clampedX = Math.max(-MAX_COORDINATE, Math.min(x, MAX_COORDINATE));
        const clampedY = Math.max(-MAX_COORDINATE, Math.min(y, MAX_COORDINATE));

        const pingId = Math.random().toString(16).slice(2, 6);
        const pingTypes = ["move", "attack", "look", "danger"];
        const pingType = pingTypes.includes(type) ? type : "look";

        // Look up user for sender name
        prisma.user.findUnique({ where: { id: Number(userId) } }).then(user => {
          const senderName = user?.username || "Unknown";

          io.emit("token:pong", {
            pingId,
            userId: Number(userId),
            senderName,
            mapId,
            x: clampedX,
            y: clampedY,
            type: pingType,
            timestamp: Date.now(),
          });
          logger.info("socket", "token:ping — userId=%d mapId=%s type=%s", Number(userId), mapId, pingType);
        }).catch(err => {
          logger.error("socket:ping", "Error looking up user", { error: err.message });
        });
      } catch (err) {
        logger.error("socket:ping", "Error handling token:ping", { error: err.message });
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info("socket", "Client disconnected", { clientId, reason });
      log("disconnect — clientId=%s reason=%s", clientId, reason);

      io.emit("chat:message", {
        id: generateId(),
        sender: "System",
        text: "An adventurer has left the session.",
        timestamp: Date.now(),
        type: "system",
      });
    });

    socket.on("error", (err) => {
      logger.error("socket", "Client socket error", { error: typeof err === "string" ? err : err?.message || "Unknown" });
      log("error — clientId=%s error=%s", clientId, typeof err === "string" ? err : err?.message || "Unknown error");
    });
  });
}

async function emitPersistedChatMessage(io, partial) {
  const message = await persistChatMessage({
    id: generateId(),
    userId: sanitizeUserId(partial.userId),
    characterId: partial.characterId || null,
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
        characterId: message.characterId || null,
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
    logger.error("socket:db", "Failed to save chat message to DB", { error: dbErr.message });
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

function emitSocketError(socket, event, message) {
  socket.emit("action:error", { event, message });
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = { registerSocketHandlers };
