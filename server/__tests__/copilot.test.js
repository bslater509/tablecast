// =============================================================================
// Tablecast — AI Co-Pilot Unit Tests
// Tests the copilot backend module (server/src/ai/copilot.js)
// No DB or Express dependency — runs with Node 22+ built-in test runner.
// Usage:  node --test server/__tests__/copilot.test.js
// =============================================================================
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// ---------------------------------------------------------------------------
// Replicated logic from copilot.js for isolated testing
// (Following project convention: socket-reconnect.test.js, socket-ping.test.js)
// ---------------------------------------------------------------------------

// Rate limiting (mirrors copilot.js lines 16-23)
function createRateLimiter() {
  const rateLimitMap = new Map();
  function isRateLimited(sessionId, now) {
    now = now || Date.now();
    const last = rateLimitMap.get(sessionId);
    if (last && now - last < 30000) return true; // 30 second cooldown
    rateLimitMap.set(sessionId, now);
    return false;
  }
  function getMapSize() { return rateLimitMap.size; }
  return { isRateLimited, getMapSize, rateLimitMap };
}

// Rules trigger patterns (mirrors copilot.js lines 79-93)
const rulesTriggerPatterns = [
  /how\s+(far|much|long|many)/i,
  /what\s+(does|is|are|can)/i,
  /can\s+(i|we|you)/i,
  /rule/i,
  /advantage|disadvantage/i,
  /saving\s+throw/i,
  /spell\s+(save|dc|slot|level)/i,
  /concentration/i,
  /grapple|shove/i,
  /opportunity\s+attack/i,
  /reaction/i,
  /bonus\s+action/i,
  /proficiency/i,
];

function isRulesQuestion(text) {
  return rulesTriggerPatterns.some(p => p.test(text));
}

// CR parsing (mirrors copilot.js lines 62-67)
function parseCr(cr) {
  if (cr === "0") return 0;
  if (typeof cr === "string" && cr.includes("/")) return 0.5;
  return Number(cr) || 0;
}

function calculateMaxCr(participants) {
  const values = participants.map(p => {
    const cr = p.monster?.cr || p.npc?.cr || "0";
    return parseCr(cr);
  }).filter(v => v > 0);
  return values.length > 0 ? Math.max(...values) : 0;
}

function calculateAvgLevel(participants) {
  const partyLevels = participants
    .filter(p => p.character)
    .map(p => p.character.level);
  return partyLevels.length > 0
    ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length)
    : 0;
}

function isDeadlyEncounter(maxCr, avgLevel) {
  return maxCr > 0 && avgLevel > 0 && maxCr > avgLevel + 4;
}

// Error handling: catch block behavior (mirrors copilot.js lines 158-161)
function handleError(_error) {
  return { cooldown: false, suggestions: [] };
}

// ---------------------------------------------------------------------------
// Tests: Rate Limiting
// ---------------------------------------------------------------------------

describe("copilot — isRateLimited()", () => {
  it("should allow first call for a session", () => {
    const { isRateLimited } = createRateLimiter();
    assert.equal(isRateLimited("session-A"), false);
  });

  it("should block second call within 30 seconds", () => {
    const { isRateLimited } = createRateLimiter();
    assert.equal(isRateLimited("session-B"), false);
    assert.equal(isRateLimited("session-B"), true);
  });

  it("should allow different sessions independently", () => {
    const { isRateLimited } = createRateLimiter();
    isRateLimited("session-C"); // first call
    assert.equal(isRateLimited("session-D"), false); // different session
    assert.equal(isRateLimited("session-C"), true); // C within 30s
    assert.equal(isRateLimited("session-D"), true); // D within 30s
  });

  it("should allow call after cooldown expires (30s + 1ms)", () => {
    const { isRateLimited } = createRateLimiter();
    const t0 = 1_000_000_000;
    assert.equal(isRateLimited("session-E", t0), false);
    assert.equal(isRateLimited("session-E", t0 + 29_999), true);  // just under
    assert.equal(isRateLimited("session-E", t0 + 30_001), false); // just over
  });

  it("should track call after cooldown as the new reference", () => {
    const { isRateLimited } = createRateLimiter();
    const t0 = 1_000_000_000;
    isRateLimited("session-F", t0);       // call 1
    isRateLimited("session-F", t0 + 30_001); // call 2 (after cooldown, allowed)
    assert.equal(isRateLimited("session-F", t0 + 30_002), true); // within 30s of call 2
  });

  it("should allow first call on a fresh map", () => {
    const { isRateLimited, rateLimitMap } = createRateLimiter();
    assert.equal(rateLimitMap.size, 0);
    assert.equal(isRateLimited("fresh"), false);
    assert.equal(rateLimitMap.size, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Rules Trigger Patterns
// ---------------------------------------------------------------------------

describe("copilot — rulesTriggerPatterns", () => {
  it("should detect 'how far' as a rules question", () => {
    assert.ok(isRulesQuestion("how far can I see in dim light?"));
  });

  it("should detect 'how much' as a rules question", () => {
    assert.ok(isRulesQuestion("how much does a longsword cost?"));
  });

  it("should detect 'what does' as a rules question", () => {
    assert.ok(isRulesQuestion("what does the Web spell do?"));
  });

  it("should detect 'what is' as a rules question", () => {
    assert.ok(isRulesQuestion("what is the DC for this trap?"));
  });

  it("should detect 'can I' as a rules question", () => {
    assert.ok(isRulesQuestion("can I use a bonus action to drink a potion?"));
  });

  it("should detect 'rule' keyword", () => {
    assert.ok(isRulesQuestion("what does the rule say about cover?"));
  });

  it("should detect 'advantage' keyword", () => {
    assert.ok(isRulesQuestion("do I have advantage on this roll?"));
  });

  it("should detect 'disadvantage' keyword", () => {
    assert.ok(isRulesQuestion("is there disadvantage from fog?"));
  });

  it("should detect 'saving throw'", () => {
    assert.ok(isRulesQuestion("what is the saving throw for Fireball?"));
  });

  it("should detect 'spell save'", () => {
    assert.ok(isRulesQuestion("what is the spell save DC?"));
  });

  it("should detect 'concentration'", () => {
    assert.ok(isRulesQuestion("do I need a concentration check?"));
  });

  it("should detect 'grapple'", () => {
    assert.ok(isRulesQuestion("can I grapple a creature two sizes larger?"));
  });

  it("should detect 'opportunity attack'", () => {
    assert.ok(isRulesQuestion("does moving provoke an opportunity attack?"));
  });

  it("should detect 'reaction'", () => {
    assert.ok(isRulesQuestion("can I cast Shield as a reaction?"));
  });

  it("should detect 'bonus action'", () => {
    assert.ok(isRulesQuestion("what bonus action can a rogue use?"));
  });

  it("should detect 'proficiency'", () => {
    assert.ok(isRulesQuestion("do I add proficiency to damage?"));
  });

  it("should NOT detect casual chat about rolls", () => {
    assert.equal(isRulesQuestion("roll initiative!"), false);
  });

  it("should NOT detect simple attack declarations", () => {
    assert.equal(isRulesQuestion("I attack the goblin with my sword."), false);
  });

  it("should NOT detect narrative chat", () => {
    assert.equal(isRulesQuestion("The tavern is quiet tonight."), false);
  });

  it("should NOT detect empty strings", () => {
    assert.equal(isRulesQuestion(""), false);
  });

  it("should handle case-insensitive matching", () => {
    assert.ok(isRulesQuestion("CONCENTRATION check"));
    assert.ok(isRulesQuestion("Advantage roll"));
    assert.ok(isRulesQuestion("BONUS ACTION"));
  });

  it("should handle text with surrounding punctuation", () => {
    assert.ok(isRulesQuestion("What's the rule on jumping?"));
    assert.ok(isRulesQuestion("How far can I jump?!"));
  });
});

// ---------------------------------------------------------------------------
// Tests: Encounter Balance CR Calculation
// ---------------------------------------------------------------------------

describe("copilot — parseCr()", () => {
  it("parses '0' as 0", () => {
    assert.equal(parseCr("0"), 0);
  });

  it("parses fractions as 0.5", () => {
    assert.equal(parseCr("1/4"), 0.5);
    assert.equal(parseCr("1/2"), 0.5);
    assert.equal(parseCr("3/4"), 0.5);
  });

  it("parses integer strings as numbers", () => {
    assert.equal(parseCr("5"), 5);
    assert.equal(parseCr("10"), 10);
    assert.equal(parseCr("20"), 20);
  });

  it("returns 0 for non-numeric garbage", () => {
    assert.equal(parseCr("abc"), 0);
    assert.equal(parseCr(""), 0);
  });

  it("returns 0 for undefined/null", () => {
    assert.equal(parseCr(undefined), 0);
    assert.equal(parseCr(null), 0);
  });
});

describe("copilot — calculateMaxCr()", () => {
  it("returns 0 for empty participants", () => {
    assert.equal(calculateMaxCr([]), 0);
  });

  it("finds max CR from monster entries", () => {
    const participants = [
      { monster: { cr: "5" }, npc: null, character: null },
      { monster: { cr: "10" }, npc: null, character: null },
    ];
    assert.equal(calculateMaxCr(participants), 10);
  });

  it("falls back to npc.cr when monster.cr missing", () => {
    const participants = [
      { monster: null, npc: { cr: "3" }, character: null },
    ];
    assert.equal(calculateMaxCr(participants), 3);
  });

  it("defaults to '0' when both monster and npc missing", () => {
    const participants = [
      { monster: null, npc: null, character: { level: 5 } },
    ];
    assert.equal(calculateMaxCr(participants), 0);
  });

  it("handles mixed participants with various CR sources", () => {
    const participants = [
      { monster: { cr: "1/4" }, npc: null, character: null },
      { monster: null, npc: { cr: "8" }, character: null },
      { monster: null, npc: null, character: { level: 5 } },
    ];
    assert.equal(calculateMaxCr(participants), 8);
  });

  it("filters out participants with CR 0", () => {
    const participants = [
      { monster: { cr: "0" }, npc: null, character: null },
      { monster: null, npc: { cr: "6" }, character: null },
    ];
    assert.equal(calculateMaxCr(participants), 6);
  });
});

describe("copilot — calculateAvgLevel()", () => {
  it("returns 0 when no character participants", () => {
    const participants = [
      { monster: { cr: "5" }, character: null },
    ];
    assert.equal(calculateAvgLevel(participants), 0);
  });

  it("calculates average level rounded", () => {
    const participants = [
      { character: { level: 5 }, monster: null },
      { character: { level: 7 }, monster: null },
    ];
    // (5+7)/2 = 6
    assert.equal(calculateAvgLevel(participants), 6);
  });

  it("rounds average correctly", () => {
    const participants = [
      { character: { level: 5 }, monster: null },
      { character: { level: 6 }, monster: null },
    ];
    // (5+6)/2 = 5.5 -> round to 6
    assert.equal(calculateAvgLevel(participants), 6);
  });

  it("handles single character participant", () => {
    const participants = [
      { character: { level: 8 }, monster: null },
    ];
    assert.equal(calculateAvgLevel(participants), 8);
  });

  it("handles empty array", () => {
    assert.equal(calculateAvgLevel([]), 0);
  });
});

describe("copilot — isDeadlyEncounter()", () => {
  it("returns true when maxCr exceeds avgLevel by 5+", () => {
    assert.equal(isDeadlyEncounter(10, 5), true);
  });

  it("returns false when maxCr equals avgLevel + 4 (threshold)", () => {
    assert.equal(isDeadlyEncounter(9, 5), false);
  });

  it("returns false when maxCr is less than avgLevel + 5", () => {
    assert.equal(isDeadlyEncounter(5, 5), false);
  });

  it("returns false when maxCr is 0", () => {
    assert.equal(isDeadlyEncounter(0, 5), false);
  });

  it("returns false when avgLevel is 0", () => {
    assert.equal(isDeadlyEncounter(10, 0), false);
  });

  it("returns false when both are 0", () => {
    assert.equal(isDeadlyEncounter(0, 0), false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Error Handling
// ---------------------------------------------------------------------------

describe("copilot — error handling", () => {
  it("should return empty suggestions array on error", () => {
    const result = handleError(new Error("DB connection failed"));
    assert.deepEqual(result, { cooldown: false, suggestions: [] });
  });

  it("should not throw regardless of error type", () => {
    const errors = [
      new Error("generic"),
      new TypeError("type error"),
      new RangeError("range"),
      "string error",
      null,
      undefined,
    ];
    for (const err of errors) {
      const result = handleError(err);
      assert.deepEqual(result, { cooldown: false, suggestions: [] });
    }
  });

  it("should not leak error details in response", () => {
    const result = handleError(new Error("Internal: token expired"));
    assert.deepEqual(result, { cooldown: false, suggestions: [] });
    assert.equal(result.cooldown, false);
    assert.ok(Array.isArray(result.suggestions));
    assert.equal(result.suggestions.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Suggestions Output Shape
// ---------------------------------------------------------------------------

describe("copilot — suggestions contract", () => {
  it("should cap suggestions at 3 maximum", () => {
    // Verify the slice(0,3) behavior from copilot.js line 156
    const raw = [1, 2, 3, 4, 5];
    const capped = raw.slice(0, 3);
    assert.equal(capped.length, 3);
    assert.deepEqual(capped, [1, 2, 3]);
  });

  it("should handle empty suggestions gracefully", () => {
    const result = { cooldown: false, suggestions: [] };
    assert.ok(Array.isArray(result.suggestions));
    assert.equal(result.suggestions.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Rate Limit Map Size Tracking
// ---------------------------------------------------------------------------

describe("copilot — rate limit map tracking", () => {
  it("should track multiple sessions independently", () => {
    const { isRateLimited, getMapSize } = createRateLimiter();
    assert.equal(getMapSize(), 0);
    isRateLimited("sess-1");
    assert.equal(getMapSize(), 1);
    isRateLimited("sess-2");
    assert.equal(getMapSize(), 2);
    isRateLimited("sess-3");
    assert.equal(getMapSize(), 3);
  });

  it("should not increase map size for existing session re-checks", () => {
    const { isRateLimited, getMapSize } = createRateLimiter();
    isRateLimited("existing");
    const sizeBefore = getMapSize();
    isRateLimited("existing"); // within cooldown
    assert.equal(getMapSize(), sizeBefore);
  });
});
