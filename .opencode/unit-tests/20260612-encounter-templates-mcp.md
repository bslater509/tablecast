# Unit Test Record: encounter-templates.js

## Target File
`server/src/mcp/handlers/encounter-templates.js`

## Test File (DELETED)
`server/src/mcp/handlers/__tests__/encounter-templates.isolated.test.js`

## Test Code (Preserved)
```javascript
"use strict";

const assert = require("assert");
const handlers = require("../encounter-templates.js");

// ---------------------------------------------------------------------------
// Mock prisma
// ---------------------------------------------------------------------------
let templatesStore = [];
let nextId = 1;

function makeMockPrisma() {
  const mock = {
    encounterTemplate: {
      findMany: async ({ where, orderBy } = {}) => {
        let results = [...templatesStore];
        if (where && where.difficulty !== undefined) {
          results = results.filter((t) => t.difficulty === where.difficulty);
        }
        return results;
      },
      findUnique: async ({ where: { id } }) => {
        return templatesStore.find((t) => t.id === id) || null;
      },
      create: async ({ data }) => {
        const now = new Date().toISOString();
        const record = { id: nextId++, ...data, createdAt: now, updatedAt: now };
        templatesStore.push(record);
        return record;
      },
      update: async ({ where: { id }, data }) => {
        const idx = templatesStore.findIndex((t) => t.id === id);
        if (idx === -1) throw new Error("Record not found");
        templatesStore[idx] = { ...templatesStore[idx], ...data, updatedAt: new Date().toISOString() };
        return templatesStore[idx];
      },
      delete: async ({ where: { id } }) => {
        const idx = templatesStore.findIndex((t) => t.id === id);
        if (idx === -1) throw new Error("Record not found");
        templatesStore.splice(idx, 1);
        return { id };
      },
    },
  };
  return mock;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toJsonArrayString(value) {
  return JSON.stringify(value || []);
}

function reset() { templatesStore = []; nextId = 1; }

// 16 test cases covering:
// - List empty, list all, list filtered by difficulty
// - Create basic, create full, create missing name, create invalid difficulty
// - Update partial, update invalid id, update not found, update no fields
// - Update mapId=null, update tags+participants
// - Delete existing, delete invalid id
// - Invalid difficulty filter validation
```

## Test Result
- **Status**: pass
- **Total**: 37 assertions
- **Passed**: 37
- **Failed**: 0
- **Session**: ses_encounter_templates_mcp
- **Timestamp**: 2026-06-12T06:50:28.000Z
