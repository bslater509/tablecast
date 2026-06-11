# Project Context

## Environment
- Language: Node.js 22 (server), React 18 + Vite 5 (client)
- Runtime: Express 4 + Socket.io 4
- Build: `npm run build` (server), `npm run build` (client → Vite)
- Test: No unit test infrastructure (project-wide pattern)
- Package Manager: npm
- Database: SQLite via Prisma 5
- Deploy: git push → webhook → remote docker compose rebuild

## Project Type
- [x] Application (VTT Companion for D&D 5e)
- [ ] Library/Package
- [ ] Microservice
- [x] Monorepo (server/ + client/)

## Infrastructure
- Container: Docker (multi-stage: Vite build → node:22-slim)
- Orchestration: Docker Compose
- CI/CD: GitHub webhook → remote `docker compose -p tablecast up -d --build`
- Cloud: LAN-only (192.168.0.77:3001), no TLS, plain HTTP

## Structure
- Source: `/root/tablecast/server/src/`, `/root/tablecast/client/src/`
- Tests: None
- Entry: `server/src/index.js`, `client/src/App.jsx`

## Section 3 Implementation Complete ✅

### §3.2 In-Game Calendar & Weather
- **Model**: Stored in `AppSetting` table as JSON (`calendar.config`)
- **Backend**: `server/src/routes/calendar.js` — GET/PUT calendar, POST advance/weather
- **Util**: `server/src/utils/weatherGenerator.js` — seasonal/terrain weather generation
- **MCP**: `server/src/mcp/handlers/calendar.js` — 4 tools (get, update, advance, generate_weather)
- **Frontend**: `CalendarPanel.jsx` (DM tab) + `CalendarWidget.jsx` (standalone widget)
- **Socket**: `game:dateChange` event broadcast
- **Nav**: calendar item in DM_NAV_ITEMS
- **Player View**: visible in player layout (read-only)

### §3.3 Quest/Journal Log
- **Model**: `Quest` — title, description, status (ACTIVE/COMPLETED/FAILED), objectives (JSON), rewards (JSON), questGiverNpcId, parentQuestId, assignedCharacterIds, isVisibleToPlayers
- **Backend**: `server/src/routes/quests.js` — full CRUD + status tracking
- **MCP**: `server/src/mcp/handlers/quests.js` — 4 tools (list, create, update, delete)
- **Frontend**: `QuestLogPanel.jsx` — DM quest CRUD with objective builder, reward config, progress tracking; player read-only view with notification badges
- **Nav**: journal item in DM_NAV_ITEMS; player layout includes journal tab

### §3.4 Dialogue Tree Builder
- **Model**: `dialogueTree` JSON field on `Npc` model
- **Backend**: `server/src/routes/dialogue.js` — GET/PUT dialogue, POST start/advance/evaluate
- **Util**: `server/src/utils/dialogueEngine.js` — tree evaluation, condition checks, skill check resolution
- **MCP**: `server/src/mcp/handlers/dialogue.js` — 4 tools (get, update, start, advance)
- **Frontend**: `DialogueTreePanel.jsx` — DM builder mode (node CRUD, validation, skill checks) + player chat-bubble read-only mode with socket streaming
- **Socket**: `dialogue:start`, `dialogue:advance` events
- **Nav**: dialogue item in DM_NAV_ITEMS; player layout includes dialogue tab

### §3.5 Player Handouts
- **Model**: `Handout` — title, content, imageUrl, targetCharacterIds (JSON), isRead, createdByDmId
- **Backend**: `server/src/routes/handouts.js` — full CRUD with character targeting
- **MCP**: `server/src/mcp/handlers/handouts.js` — 4 tools (list, create, update, delete)
- **Frontend**: `HandoutPanel.jsx` (viewer) + `HandoutsPanel.jsx` (management list)
- **Socket**: `handout:created`, `handout:updated`, `handout:deleted`, `handout:read` events
- **Nav**: handouts item in DM_NAV_ITEMS; player nav includes handouts; popout route available

## Notes
- Dead code removed: `DialogueEditor.jsx` (1608 lines, unimported), `QuestJournalPanel.jsx` (never imported — QuestLogPanel used instead)
- Build verified: 1800+ modules, ~5s build time, no errors
- Main Section 3 deployed via commit `a4ade56` on origin/master
