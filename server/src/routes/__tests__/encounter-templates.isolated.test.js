// =============================================================================
// ISOLATED Unit Test for encounter-templates.js
// Target: server/src/routes/encounter-templates.js
// Session: ses_T5_T9
//
// **WARNING**: THIS FILE WILL BE DELETED AFTER TEST PASSES
// =============================================================================
"use strict";

const assert = require("assert");

// ---------------------------------------------------------------------------
// Mock prisma BEFORE loading the module under test
// ---------------------------------------------------------------------------
const mockNpcs = {
  1: { id: 1, name: "Goblin", hp: 7, ac: 15, imageUrl: "/img/goblin.png" },
  2: { id: 2, name: "Goblin Boss", hp: 12, ac: 17, imageUrl: "/img/goblin_boss.png" },
};
const mockMonsters = { 10: { id: 10, name: "Wolf", hp: 11, ac: 13, imageUrl: "/img/wolf.png" } };
const mockMaps = { 1: { id: 1, name: "Forest Clearing", imageUrl: "/map.png", gridSize: 50, gridType: "SQUARE" }, 2: { id: 2, name: "Dungeon", imageUrl: "/dungeon.png", gridSize: 50, gridType: "SQUARE" } };
let templatesStore = [];
const encountersStore = [];
const participantsStore = [];
let nextId = 1;
let nextEncounterId = 100;
let nextParticipantId = 500;

const mockPrisma = {
  encounterTemplate: {
    findMany: async ({ where } = {}) => {
      let results = [...templatesStore];
      if (where && where.difficulty !== undefined) results = results.filter((t) => t.difficulty === where.difficulty);
      return results;
    },
    findUnique: async ({ where: { id } }) => templatesStore.find((t) => t.id === id) || null,
    create: async ({ data }) => {
      const now = new Date();
      const entry = { id: nextId++, ...data, createdAt: now, updatedAt: now };
      templatesStore.push(entry);
      return entry;
    },
    update: async ({ where: { id }, data }) => {
      const idx = templatesStore.findIndex((t) => t.id === id);
      if (idx === -1) { const e = new Error("Not found"); e.code = "P2025"; throw e; }
      templatesStore[idx] = { ...templatesStore[idx], ...data, updatedAt: new Date() };
      return templatesStore[idx];
    },
    delete: async ({ where: { id } }) => {
      const idx = templatesStore.findIndex((t) => t.id === id);
      if (idx === -1) { const e = new Error("Not found"); e.code = "P2025"; throw e; }
      templatesStore.splice(idx, 1);
      return { id };
    },
  },
  encounter: {
    create: async ({ data }) => {
      const now = new Date();
      const entry = { id: nextEncounterId++, ...data, status: "DRAFT", round: 1, turnIndex: 0, createdAt: now, updatedAt: now };
      encountersStore.push(entry);
      return entry;
    },
    findUnique: async ({ where: { id } }) => {
      const enc = encountersStore.find((e) => e.id === id);
      if (!enc) return null;
      const parts = participantsStore
        .filter((p) => p.encounterId === id)
        .map((p) => ({ ...p, token: null, npc: p.npcId ? mockNpcs[p.npcId] || null : null, character: null, monster: p.monsterId ? mockMonsters[p.monsterId] || null : null }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return { ...enc, participants: parts, map: mockMaps[enc.mapId] || null };
    },
  },
  encounterParticipant: { createMany: async ({ data }) => { for (const d of data) participantsStore.push({ id: nextParticipantId++, ...d }); } },
  npc: { findUnique: async ({ where: { id } }) => mockNpcs[id] || null },
  monster: { findUnique: async ({ where: { id } }) => mockMonsters[id] || null },
  character: { findUnique: async () => null },
  map: { findUnique: async ({ where: { id } }) => mockMaps[id] || null },
};

// ---------------------------------------------------------------------------
// Setup module mocking — intercept prisma, auth, logger requires
// ---------------------------------------------------------------------------
const Module = require("module");
const path = require("path");
const origLoad = Module._load;

Module._load = function(request, parent) {
  const resolved = path.resolve(path.dirname(parent ? parent.filename : __filename), request);
  if (resolved.endsWith("prisma.js") || resolved.endsWith("prisma/index.js")) return mockPrisma;
  if (resolved.endsWith("auth.js")) return { requireDm: (req, res, next) => next(), getRequestUser: () => ({ id: 1, role: "DM" }) };
  if (resolved.endsWith("logger.js")) return { error: () => {}, info: () => {}, warn: () => {}, debug: () => {} };
  return origLoad.apply(this, arguments);
};

// Load the module under test
const router = require("../encounter-templates.js");
Module._load = origLoad; // Restore

// ---------------------------------------------------------------------------
// Mock Express response with proper chaining
// ---------------------------------------------------------------------------
function makeRes() {
  let statusCode = 200;
  let body = null;
  const self = {
    status: (code) => { statusCode = code; return self; },
    json: (data) => { body = data; return self; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return self;
}

// Properly chain through Express route handlers like Express does internally
function runRouteHandlers(handlers, req, res) {
  let idx = 0;
  const next = () => {
    if (idx < handlers.length) {
      const handler = handlers[idx++];
      // Express wraps handlers: if 4 args -> error handler, else normal
      if (handler.length <= 3) {
        return handler(req, res, next);
      }
      return next();
    }
  };
  return next();
}

async function callRoute(method, pathPattern, params, query, body) {
  const req = { params: params || {}, query: query || {}, body: body || {}, get: () => "1" };
  const res = makeRes();

  for (const layer of router.stack) {
    const r = layer.route;
    if (!r) continue;
    const methods = Object.keys(r.methods);
    if (!methods.includes(method.toLowerCase())) continue;
    if (r.path !== pathPattern) continue;

    // Collect all handlers from the route's stack
    const handlers = r.stack.map((h) => h.handle || h);
    await runRouteHandlers(handlers, req, res);
    return res;
  }

  // Route not found in our router
  const nf = makeRes();
  nf.status(404).json({ error: "Route not found" });
  return nf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${name}: ${err.message}`);
    }
  }

  console.log("\n=== Encounter Templates Route Isolated Tests ===\n");

  // --- CREATE ---
  await test("POST / creates a template", async () => {
    const res = await callRoute("POST", "/", {}, {}, {
      name: "Goblin Ambush", difficulty: "easy", tags: ["forest", "low-level"],
      participants: [{ sourceType: "npc", sourceId: 1, name: "Goblin", count: 4 }], mapId: 1,
    });
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getBody().id > 0);
    assert.strictEqual(res.getBody().name, "Goblin Ambush");
    assert.strictEqual(res.getBody().difficulty, "easy");
    assert.deepStrictEqual(res.getBody().tags, ["forest", "low-level"]);
  });

  await test("POST / rejects missing name", async () => {
    const res = await callRoute("POST", "/", {}, {}, { difficulty: "easy" });
    assert.strictEqual(res.getStatus(), 400);
    assert.ok(res.getBody().error.includes("name"));
  });

  await test("POST / rejects invalid difficulty", async () => {
    const res = await callRoute("POST", "/", {}, {}, { name: "Test", difficulty: "impossible" });
    assert.strictEqual(res.getStatus(), 400);
    assert.ok(res.getBody().error.includes("difficulty"));
  });

  // --- LIST ---
  await test("GET / lists all templates", async () => {
    const res = await callRoute("GET", "/", {}, {}, {});
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(Array.isArray(res.getBody()));
    assert.ok(res.getBody().length >= 1);
  });

  await test("GET / filters by difficulty", async () => {
    const res = await callRoute("GET", "/", {}, { difficulty: "hard" }, {});
    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getBody().length, 0);
  });

  // --- GET BY ID ---
  await test("GET /:id returns a template", async () => {
    const res = await callRoute("GET", "/:id", { id: "1" }, {}, {});
    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getBody().id, 1);
    assert.strictEqual(res.getBody().name, "Goblin Ambush");
  });

  await test("GET /:id returns 404 for missing", async () => {
    const res = await callRoute("GET", "/:id", { id: "999" }, {}, {});
    assert.strictEqual(res.getStatus(), 404);
  });

  // --- UPDATE ---
  await test("PUT /:id updates a template", async () => {
    const res = await callRoute("PUT", "/:id", { id: "1" }, {}, { name: "Goblin Ambush Updated", difficulty: "medium" });
    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getBody().name, "Goblin Ambush Updated");
    assert.strictEqual(res.getBody().difficulty, "medium");
  });

  await test("PUT /:id returns 404 for missing", async () => {
    const res = await callRoute("PUT", "/:id", { id: "999" }, {}, { name: "Ghost" });
    assert.strictEqual(res.getStatus(), 404);
  });

  // --- DELETE ---
  await test("DELETE /:id deletes a template", async () => {
    const res = await callRoute("DELETE", "/:id", { id: "1" }, {}, {});
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getBody().message);
    // Verify gone
    const getRes = await callRoute("GET", "/:id", { id: "1" }, {}, {});
    assert.strictEqual(getRes.getStatus(), 404);
  });

  await test("DELETE /:id returns 404 for missing", async () => {
    const res = await callRoute("DELETE", "/:id", { id: "999" }, {}, {});
    assert.strictEqual(res.getStatus(), 404);
  });

  // --- APPLY ---
  // Add a template to use for apply testing
  templatesStore.push({
    id: 50, name: "Wolf Pack", description: "A pack of hungry wolves",
    difficulty: "medium", recommendedLevel: 2,
    tags: JSON.stringify(["forest", "beast"]),
    participants: JSON.stringify([
      { sourceType: "monster", sourceId: 10, name: "Wolf", count: 3 },
      { sourceType: "placeholder", name: "Dire Wolf", count: 1 },
    ]),
    mapId: 1, createdAt: new Date(), updatedAt: new Date(),
  });
  nextId++;

  await test("POST /:id/apply creates encounter from template", async () => {
    const res = await callRoute("POST", "/:id/apply", { id: "50" }, {}, {});
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getBody().id > 0);
    assert.strictEqual(res.getBody().name, "Wolf Pack");
    assert.ok(Array.isArray(res.getBody().participants));
    assert.strictEqual(res.getBody().participants.length, 4);
    const wolfPart = res.getBody().participants.find((p) => p.name === "Wolf 1");
    assert.ok(wolfPart);
    assert.strictEqual(wolfPart.currentHp, 11);
    assert.strictEqual(wolfPart.ac, 13);
    assert.strictEqual(wolfPart.source, "monster");
    const direWolf = res.getBody().participants.find((p) => p.name === "Dire Wolf");
    assert.ok(direWolf);
    assert.strictEqual(direWolf.source, "placeholder");
  });

  await test("POST /:id/apply returns 404 for missing template", async () => {
    const res = await callRoute("POST", "/:id/apply", { id: "999" }, {}, {});
    assert.strictEqual(res.getStatus(), 404);
  });

  await test("POST /:id/apply accepts name and mapId overrides", async () => {
    const res = await callRoute("POST", "/:id/apply", { id: "50" }, {}, { name: "Override Encounter", mapId: 2 });
    assert.strictEqual(res.getStatus(), 201);
    assert.strictEqual(res.getBody().name, "Override Encounter");
    assert.strictEqual(res.getBody().mapId, 2);
  });

  // Template without mapId
  templatesStore.push({
    id: 60, name: "No Map Template", description: "", difficulty: "easy",
    recommendedLevel: 1, tags: "[]", participants: "[]", mapId: null,
    createdAt: new Date(), updatedAt: new Date(),
  });
  nextId++;

  await test("POST /:id/apply returns 400 if no mapId available", async () => {
    const res = await callRoute("POST", "/:id/apply", { id: "60" }, {}, {});
    assert.strictEqual(res.getStatus(), 400);
    assert.ok(res.getBody().error.includes("mapId"));
  });

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
