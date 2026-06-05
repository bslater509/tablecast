// =============================================================================
// Tablecast — Socket.io Event Handlers
// Centralised module for all real-time WebSocket logic.
// =============================================================================
"use strict";

const prisma = require("./prisma");

/**
 * Registers all Socket.io event listeners on the given `io` instance.
 *
 * Current events (Phase 2 – chat verification):
 *   • chat:send   — client emits a message → server broadcasts to all clients
 *   • chat:typing  — client signals typing → server relays to others
 *
 * Future phases will add:
 *   • dice:roll, token:move, fog:update, etc.
 *
 * @param {import("socket.io").Server} io
 */
function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    const clientId = socket.id;
    console.log(`[Socket] ✅ Client connected: ${clientId}`);

    // ── Announce new connection to everyone ──────────────────────────────────
    io.emit("chat:message", {
      id: generateId(),
      sender: "⚙️ System",
      text: `A new adventurer has joined the session.`,
      timestamp: Date.now(),
      type: "system",
    });

    // ── Chat: incoming message ──────────────────────────────────────────────
    socket.on("chat:send", (payload) => {
      if (!payload || typeof payload.text !== "string" || !payload.text.trim()) {
        return; // silently ignore empty messages
      }

      const message = {
        id: generateId(),
        sender: payload.sender || "Anonymous",
        text: payload.text.trim(),
        timestamp: Date.now(),
        type: payload.type || "user",
        rollDetails: payload.rollDetails || null,
      };

      console.log(`[Socket] 💬 ${message.sender}: ${message.text} (${message.type})`);

      // Broadcast to *all* clients, including the sender
      io.emit("chat:message", message);
    });

    // ── Chat: typing indicator ──────────────────────────────────────────────
    socket.on("chat:typing", (payload) => {
      // Relay to everyone *except* the sender
      socket.broadcast.emit("chat:typing", {
        sender: payload?.sender || "Someone",
      });
    });

    // ── Disconnect ──────────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log(`[Socket] ❎ Client disconnected: ${clientId} (${reason})`);

      io.emit("chat:message", {
        id: generateId(),
        sender: "⚙️ System",
        text: `An adventurer has left the session.`,
        timestamp: Date.now(),
        type: "system",
      });
    });

    // ── VTT: Token Move ─────────────────────────────────────────────────────
    socket.on("token:move", async (payload) => {
      const { id, x, y } = payload;
      try {
        const updatedToken = await prisma.token.update({
          where: { id: Number(id) },
          data: { x: Number(x), y: Number(y) },
          include: { character: true },
        });
        io.emit("token:moved", updatedToken);
      } catch (err) {
        console.error(`[Socket] Error updating token position:`, err.message);
      }
    });

    // ── VTT: Token Create ───────────────────────────────────────────────────
    socket.on("token:create", async (payload) => {
      const { mapId, characterId, label, imageUrl, x, y } = payload;
      try {
        const data = {
          mapId: Number(mapId),
          label: label || "",
          imageUrl: imageUrl || "",
          x: Number(x || 0),
          y: Number(y || 0),
        };
        if (characterId) {
          data.characterId = Number(characterId);
        }

        const newToken = await prisma.token.create({
          data,
          include: { character: true },
        });
        io.emit("token:created", newToken);
      } catch (err) {
        console.error(`[Socket] Error creating token:`, err.message);
      }
    });

    // ── VTT: Token Delete ───────────────────────────────────────────────────
    socket.on("token:delete", async (payload) => {
      const { id } = payload;
      try {
        await prisma.token.delete({
          where: { id: Number(id) },
        });
        io.emit("token:deleted", { id: Number(id) });
      } catch (err) {
        console.error(`[Socket] Error deleting token:`, err.message);
      }
    });

    // ── VTT: Fog of War Update ──────────────────────────────────────────────
    socket.on("fog:update", async (payload) => {
      const { mapId, fogState } = payload;
      try {
        const updatedMap = await prisma.map.update({
          where: { id: Number(mapId) },
          data: {
            fogState: typeof fogState === "string" ? fogState : JSON.stringify(fogState),
          },
        });
        io.emit("fog:updated", {
          mapId: updatedMap.id,
          fogState: updatedMap.fogState,
        });
      } catch (err) {
        console.error(`[Socket] Error updating fog state:`, err.message);
      }
    });

    // ── VTT: Map Select ─────────────────────────────────────────────────────
    socket.on("map:select", (payload) => {
      const { mapId } = payload;
      io.emit("map:selected", { mapId: Number(mapId) });
    });

    // ── Error handling ──────────────────────────────────────────────────────
    socket.on("error", (err) => {
      console.error(`[Socket] Error on ${clientId}:`, err.message);
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple unique-ish ID generator (good enough for chat messages). */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = { registerSocketHandlers };
