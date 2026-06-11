# Project Context

## Environment
- Language: JavaScript (Node.js) + React
- Runtime: Node.js 22 (Docker multi-stage: alpine build → slim runtime)
- Build: `npm run build` (Vite for client)
- Test: LSP diagnostics + staging server curl tests
- Package Manager: npm
- Database: SQLite via Prisma ORM

## Project Type
- Application: D&D 5e Virtual Tabletop (VTT) / Campaign Manager

## Infrastructure
- Container: Docker (single service in docker-compose.yml, multi-stage build)
- Orchestration: Docker Compose (volumes: tablecast-db, tablecast-uploads, tablecast-5etools-cache, tablecast-backups)
- CI/CD: Git push → webhook at http://192.168.0.77:3000/api/git/stacks/2/webhook
- Server: http://192.168.0.77:3001 (staging)
- AI Provider: OpenAI-compatible + Ollama (configurable)
- Notifications: Pushover (mobile push via opencode-notify plugin)

## Structure
- Source: `server/src/` (Express backend), `client/src/` (React frontend)
- Tests: Manual via staging server + curl + puppeteer
- Docs: `AGENTS.md` (living architecture doc)
- Entry: `server/src/index.js`, `client/src/App.jsx`

## Backup System (Current State)
- **Utility**: `server/src/utils/backup.js` - zip creation (archiver), rclone cloud copy, 30-day retention
- **Routes**: `server/src/routes/backup.js` - config, status, trigger, plus universal rclone provider/remote management
- **Config storage**: Dual - DB `app_settings` (key `rclone.config`) + disk file `server/prisma/data/rclone.conf`
- **Providers**: Universal rclone provider support via `GET /api/backup/providers` (introspection)
- **Remotes CRUD**: `GET/POST /api/backup/remotes`, `DELETE /api/backup/remotes/:name`
- **OAuth removed**: Replaced Google Drive-only OAuth wizard with provider-agnostic GUI

## Conventions
- Naming: camelCase (JS), PascalCase (React components)
- Imports: CommonJS (require) for server, ESM imports for client
- Error handling: async try/catch, AppError class, centralized error middleware
- Auth: Header-based `x-tablecast-user-id` with `requireDm` middleware
- Logging: Structured JSON logger (`server/src/utils/logger.js`) with namespaces

## Current Work (Refactoring Phases)
### Phase 1: WikiPanel.jsx ✅
- Extracted `NpcStatblock.jsx` (332 lines) + `wikiStyles.js` (875 lines) + `wikiUtils.js` (123 lines)
- WikiPanel.jsx reduced from 4499 → 3221 lines (-28%)
- All LSP diagnostics pass on all 4 files

### Phase 2: mcp-server.js ✅
- Extracted `schemas.js` (TOOLS array, 658 lines)
- Extracted `shared.js` (helper functions, 78 lines)
- Extracted 8 domain handler modules (1476 total lines):
  - `handlers/users.js` — list_users, create_user
  - `handlers/characters.js` — list/create/update/delete/add_item
  - `handlers/npcs.js` — list/create/update/delete/add_item
  - `handlers/monsters.js` — list/create/update/delete
  - `handlers/encounters.js` — list/create/update/add/update_participant
  - `handlers/sessions.js` — list/create/update
  - `handlers/wiki.js` — list/create/update/delete (with Socket.io broadcasts)
  - `handlers/reference.js` — search/get_reference_detail
- mcp-server.js reduced from 1538 → 162 lines (-89%)
- Uses handler-map pattern instead of monolithic switch
- All LSP diagnostics pass

### Phase 3: CharacterSheet.jsx (pending)
- ~10KB component, significant extraction opportunities

### Phase 4: SettingsPanel.jsx (pending)
- ~7KB component, moderate extraction opportunities
