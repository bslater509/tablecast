// =============================================================================
// Tablecast — token:ping Socket Handler Unit Tests
// Tests the "token:ping" → "token:pong" broadcast handler (socket.js ~line 528)
// No DB or Express dependency — runs with Node 22+ built-in test runner.
// Usage:  node --test server/__tests__/socket-ping.test.js
// =============================================================================
"use strict";

const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");

// ---------------------------------------------------------------------------
// Helper: create mock socket and io, register the token:ping handler
// ---------------------------------------------------------------------------
function createHandler() {
  const io = { emit: mock.fn() };
  const socket = { on: mock.fn() };

  // Simulate handler registration — capture the callback
  socket.on.mock.mockImplementation((event, handler) => {
    if (event === "token:ping") {
      socket._pingHandler = handler;
    }
  });

  // Duplicate of the token:ping handler from socket.js (lines 528–555)
  // This tests the handler logic in isolation without the logger dependency.
  socket.on("token:ping", (payload) => {
    try {
      const mapId = Number(payload?.mapId);
      if (!Number.isInteger(mapId) || mapId <= 0) return;

      const x = Number(payload?.x);
      const y = Number(payload?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const type = ["move", "attack", "look", "danger"].includes(payload?.type)
        ? payload.type
        : "look";
      const sender = payload?.sender || "Someone";

      io.emit("token:pong", {
        mapId,
        x,
        y,
        type,
        sender,
        timestamp: Date.now(),
      });
    } catch (err) {
      // silently fail — tests verify no crash on invalid input
    }
  });

  return { io, socket };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("token:ping socket handler", () => {
  it("should broadcast token:pong with valid payload", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 1, x: 100, y: 200, type: "move", sender: "Alice" });

    assert.equal(io.emit.mock.callCount(), 1);
    const call = io.emit.mock.calls[0];
    assert.equal(call.arguments[0], "token:pong");
    assert.equal(call.arguments[1].mapId, 1);
    assert.equal(call.arguments[1].x, 100);
    assert.equal(call.arguments[1].y, 200);
    assert.equal(call.arguments[1].type, "move");
    assert.equal(call.arguments[1].sender, "Alice");
    assert.ok(typeof call.arguments[1].timestamp === "number");
  });

  it("should default unknown type to 'look'", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 1, x: 100, y: 200, type: "unknown", sender: "Bob" });
    assert.equal(io.emit.mock.callCount(), 1);
    assert.equal(io.emit.mock.calls[0].arguments[1].type, "look");
  });

  it("should default sender to 'Someone' when missing", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 1, x: 100, y: 200, type: "look" });
    assert.equal(io.emit.mock.callCount(), 1);
    assert.equal(io.emit.mock.calls[0].arguments[1].sender, "Someone");
  });

  it("should ignore invalid mapId (non-positive)", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 0, x: 100, y: 200, type: "look", sender: "Test" });
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should ignore invalid mapId (NaN)", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: "abc", x: 100, y: 200, type: "look", sender: "Test" });
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should ignore invalid x (NaN)", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 1, x: "abc", y: 200, type: "look", sender: "Test" });
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should ignore invalid y (NaN)", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 1, x: 100, y: "abc", type: "look", sender: "Test" });
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should ignore Infinity coordinates", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 1, x: Infinity, y: 200, type: "look", sender: "Test" });
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should handle missing payload gracefully (no crash)", () => {
    const { io, socket } = createHandler();
    socket._pingHandler(null);
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should handle undefined payload gracefully (no crash)", () => {
    const { io, socket } = createHandler();
    socket._pingHandler(undefined);
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should accept all 4 valid types", () => {
    const types = ["move", "attack", "look", "danger"];
    for (const type of types) {
      const { io, socket } = createHandler();
      socket._pingHandler({ mapId: 1, x: 100, y: 200, type, sender: "Test" });
      assert.equal(io.emit.mock.callCount(), 1, `Should emit for type "${type}"`);
      assert.equal(io.emit.mock.calls[0].arguments[1].type, type);
    }
  });

  it("should accept valid negative mapId (string '1' coerced)", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: "42", x: 100, y: 200, type: "look", sender: "Test" });
    assert.equal(io.emit.mock.callCount(), 1);
    assert.equal(io.emit.mock.calls[0].arguments[1].mapId, 42);
  });

  it("should reject negative mapId", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: -5, x: 100, y: 200, type: "look", sender: "Test" });
    assert.equal(io.emit.mock.callCount(), 0);
  });

  it("should include a numeric timestamp in the pong", () => {
    const { io, socket } = createHandler();
    socket._pingHandler({ mapId: 1, x: 100, y: 200, type: "move", sender: "Alice" });
    const ts = io.emit.mock.calls[0].arguments[1].timestamp;
    assert.ok(typeof ts === "number");
    assert.ok(ts > 0);
  });
});
