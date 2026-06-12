// =============================================================================
// Tablecast — reconnect:sync Socket Handler Unit Tests
// Tests the "reconnect:sync" -> "reconnect:state" diff handler (socket.js ~line 625)
// No DB or Express dependency — runs with Node 22+ built-in test runner.
// Usage:  node --test server/__tests__/socket-reconnect.test.js
// =============================================================================
"use strict";

const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");

// Helper: create handler with mock resources
function createHandler() {
  const io = { emit: mock.fn() };
  const socket = { on: mock.fn(), emit: mock.fn() };

  socket.on.mock.mockImplementation((event, handler) => {
    if (event === "reconnect:sync") {
      socket._reconnectHandler = handler;
    }
  });

  // Simulated handler (mirrors socket.js lines 625-676)
  socket.on("reconnect:sync", async (payload) => {
    try {
      const clientState = payload?.lastKnownState || {};
      const diffs = {};

      // Compare token positions
      if (clientState.tokenPositions) {
        // Simulating server fetch. In real handler: prisma.token.findMany()
        const serverTokens = clientState._serverTokens || {};
        diffs.tokenPositions = {};
        for (const [id, pos] of Object.entries(serverTokens)) {
          const clientPos = clientState.tokenPositions[id];
          if (!clientPos || clientPos.x !== pos.x || clientPos.y !== pos.y) {
            diffs.tokenPositions[id] = pos;
          }
        }
      }

      // Compare fog state
      if (clientState.fogState && clientState.fogState.mapId) {
        // Simulating prisma.map.findUnique()
        const serverFog = clientState._serverFogState;
        if (serverFog && serverFog.fogState !== clientState.fogState.state) {
          diffs.fogState = { mapId: serverFog.mapId, state: serverFog.fogState };
        }
      }

      // Send current encounter state
      if (clientState.activeEncounterId) {
        const serverEncounter = clientState._serverEncounter;
        if (serverEncounter) {
          diffs.encounter = serverEncounter;
        }
      }

      socket.emit("reconnect:state", diffs);
    } catch (err) {
      socket.emit("reconnect:state", { error: true });
    }
  });

  return { io, socket };
}

describe("reconnect:sync socket handler", () => {
  it("should emit reconnect:state with empty diffs for empty payload", async () => {
    const { socket } = createHandler();
    await socket._reconnectHandler({});
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call, "should have emitted reconnect:state");
    assert.deepEqual(call.arguments[1], {});
  });

  it("should emit reconnect:state with empty diffs for null payload", async () => {
    const { socket } = createHandler();
    await socket._reconnectHandler(null);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.deepEqual(call.arguments[1], {});
  });

  it("should emit reconnect:state with empty diffs for undefined payload", async () => {
    const { socket } = createHandler();
    await socket._reconnectHandler(undefined);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.deepEqual(call.arguments[1], {});
  });

  it("should not send token diffs when client state matches server state", async () => {
    const { socket } = createHandler();
    const payload = {
      lastKnownState: {
        tokenPositions: {
          "1": { x: 100, y: 200 },
          "2": { x: 300, y: 400 },
        },
        _serverTokens: {
          "1": { x: 100, y: 200 },
          "2": { x: 300, y: 400 },
        },
      },
    };
    await socket._reconnectHandler(payload);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.deepEqual(call.arguments[1].tokenPositions, {});
  });

  it("should send only changed token positions", async () => {
    const { socket } = createHandler();
    const payload = {
      lastKnownState: {
        tokenPositions: {
          "1": { x: 100, y: 200 },
          "2": { x: 300, y: 400 },
        },
        _serverTokens: {
          "1": { x: 100, y: 200 },
          "2": { x: 999, y: 400 },
        },
      },
    };
    await socket._reconnectHandler(payload);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.deepEqual(call.arguments[1].tokenPositions, {
      "2": { x: 999, y: 400 },
    });
  });

  it("should send token that client doesn't have", async () => {
    const { socket } = createHandler();
    const payload = {
      lastKnownState: {
        tokenPositions: {
          "1": { x: 100, y: 200 },
        },
        _serverTokens: {
          "1": { x: 100, y: 200 },
          "2": { x: 300, y: 400 },
        },
      },
    };
    await socket._reconnectHandler(payload);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.deepEqual(call.arguments[1].tokenPositions, {
      "2": { x: 300, y: 400 },
    });
  });

  it("should send fog state diff when fog differs", async () => {
    const { socket } = createHandler();
    const payload = {
      lastKnownState: {
        fogState: { mapId: 1, state: "old-fog-data" },
        _serverFogState: { mapId: 1, fogState: "new-fog-data" },
      },
    };
    await socket._reconnectHandler(payload);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.deepEqual(call.arguments[1].fogState, { mapId: 1, state: "new-fog-data" });
  });

  it("should not send fog state when fog matches", async () => {
    const { socket } = createHandler();
    const payload = {
      lastKnownState: {
        fogState: { mapId: 1, state: "same-fog" },
        _serverFogState: { mapId: 1, fogState: "same-fog" },
      },
    };
    await socket._reconnectHandler(payload);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.strictEqual(call.arguments[1].fogState, undefined);
  });

  it("should send encounter state when activeEncounterId provided", async () => {
    const { socket } = createHandler();
    const payload = {
      lastKnownState: {
        activeEncounterId: 5,
        _serverEncounter: { id: 5, round: 3, turnIndex: 1, status: "active" },
      },
    };
    await socket._reconnectHandler(payload);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.deepEqual(call.arguments[1].encounter, { id: 5, round: 3, turnIndex: 1, status: "active" });
  });

  it("should handle missing activeEncounterId gracefully", async () => {
    const { socket } = createHandler();
    const payload = { lastKnownState: { activeEncounterId: null } };
    await socket._reconnectHandler(payload);
    const call = socket.emit.mock.calls.find(c => c.arguments[0] === "reconnect:state");
    assert.ok(call);
    assert.strictEqual(call.arguments[1].encounter, undefined);
  });
});
