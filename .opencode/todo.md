# Mission: Implement Section 4.4 - Scenario & Encounter Templates

## Status: IN PROGRESS

### M1: Prisma Schema & Migration ✅
- [x] T1: Add EncounterTemplate model to schema.prisma
- [x] T2: Add relation to Map model
- [x] T3: Generate migration `add_encounter_template`
- [x] T4: Apply migration + generate Prisma client

### M2: Backend Routes ✅
- [x] T5: Create backend CRUD + apply route module

### M3: MCP Tools ✅ (pending apply handler fix)
- [x] T6: Add MCP tool schemas to schemas.js (list/create/update/delete/apply)
- [x] T7: Create MCP handler at server/src/mcp/handlers/encounter-templates.js
- [x] T7.1: Fix missing handleApplyEncounterTemplate handler

### M4: Frontend Component ✅
- [x] T8: Create EncounterTemplatesPanel.jsx

### M5: Wiring
- [x] T9: Wire route into server/src/index.js
- [x] T10: Wire MCP handler into server/src/mcp-server.js
- [x] T11: Wire nav item and route in App.jsx

### M6: Verification | pending | agent:Reviewer
- [ ] T12: Server syntax check
- [ ] T13: Vite build
- [ ] T14: LSP diagnostics
- [ ] T15: features.md update - §4.4 marked [x] Implemented
- [ ] T16: Git commit + push
