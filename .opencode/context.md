# Project Context - Section 4.4 Complete

## Environment
- Language: JavaScript (Node.js 22, React 18)
- Build: Vite 5 (client) / Node (server)
- Package Manager: npm, Docker, Prisma 5 (SQLite)

## What Was Built - Section 4.4: Scenario & Encounter Templates

### Prisma Schema
- New `EncounterTemplate` model with: id, name, description, difficulty (easy/medium/hard/deadly), recommendedLevel, tags (JSON), participants (JSON), mapId (optional relation to Map), timestamps
- Migration `add_encounter_template` applied and DB is up to date

### Backend — `/api/encounter-templates` Routes
- `GET /api/encounter-templates` — list with optional ?difficulty, ?minLevel, ?maxLevel filters
- `GET /api/encounter-templates/:id` — single template
- `POST /api/encounter-templates` — create template (DM only)
- `PUT /api/encounter-templates/:id` — update template (DM only, partial)
- `DELETE /api/encounter-templates/:id` — delete template (DM only)
- `POST /api/encounter-templates/:id/apply` — apply template to create live Encounter with participants (npc/monster/character/placeholder source types)

### MCP Tools (5 tools)
- `list_encounter_templates` — list with optional difficulty filter
- `create_encounter_template` — create template with participants
- `update_encounter_template` — update template fields
- `delete_encounter_template` — delete by ID
- `apply_encounter_template` — apply template to create encounter

### Frontend — EncounterTemplatesPanel.jsx (717 lines)
DM-only panel for managing encounter templates:
- **List view**: Cards with difficulty badge, level range, tags, participant count
- **Search/filter**: By name, difficulty dropdown (easy/medium/hard/deadly/All)
- **Create/Edit Modal**: Name, description, difficulty, level range, tags, participants (add/remove rows with sourceType dropdown, name, count)
- **Apply button**: Quick-action to create live encounter from template
- **Seed templates**: 4 built-in templates (Goblin Ambush, Bandit Camp, Kobold Warren, Dragon's Lair)
- **Delete with confirmation**: Toast notification on success/error

### Wiring
- Route wired in index.js at `/api/encounter-templates`
- MCP handler wired in mcp-server.js
- Nav item added to App.jsx: id="templates", icon=Layers, path="/dm/templates"

### Tests
- 15 isolated unit tests for the route module (all pass)
