# Unit Test Record: encounter-templates.js (handleApplyEncounterTemplate)

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
// In-memory stores as fake DB
// ---------------------------------------------------------------------------
let templatesStore = [];
let nextTemplateId = 1;
let encountersStore = [];
let nextEncounterId = 1;
let participantsStore = [];
let nextParticipantId = 1;

function resetStores() {
  templatesStore = [];
  nextTemplateId = 1;
  encountersStore = [];
  nextEncounterId = 1;
  participantsStore = [];
  nextParticipantId = 1;
}

// ---------------------------------------------------------------------------
// Mock prisma — simple in-memory implementation
// ---------------------------------------------------------------------------
const mockPrisma = {
  encounterTemplate: {
    findUnique: async ({ where: { id } }) =>
      templatesStore.find((t) => t.id === id) || null,
  },
  encounter: {
    create: async ({ data }) => {
      // ...
    },
    findUnique: async ({ where: { id }, include }) => {
      // ...
    },
  },
  encounterParticipant: {
    create: async ({ data }) => {
      // ...
    },
  },
};

// 8 test cases:
// - templateId missing → error
// - templateId not positive → error
// - template not found → error
// - empty participants → encounter created, no participants
// - participants with count → correct number of records created
// - name override → encounter uses override name
// - mapId override → encounter uses override mapId
// - result JSON includes participants
```

## Test Result
- **Status**: pass
- **Total**: 8 assertions
- **Passed**: 8
- **Failed**: 0
- **Session**: ses_T7
- **Timestamp**: 2026-06-12T06:55:31.000Z
