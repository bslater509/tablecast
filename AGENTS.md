# AI Agent Instructions — Tablecast Project

This document is a **living reference** describing the project's standards, architecture, and agent roles. Follow it whenever generating code or making changes.

---

## Global Coding Standards (Apply to all Agents)

- **Mobile-First:** All UI components must be built for mobile screens first. Ensure touch targets (buttons, tokens) are large enough for fingers (minimum 44×44px).
- **Network Binding:** The Node.js server must bind to `0.0.0.0` (not `localhost` or `127.0.0.1`) to allow Local Area Network (LAN) access from phones.
- **Simplicity:** Prefer readable, modular code over clever, heavily abstracted logic.
- **Leverage Existing Libraries:** Prefer well-established, maintained libraries rather than reinventing the wheel (e.g., complex math, VTT operations, compression, or UI components).
- **Error Handling:** All async operations must have robust try/catch blocks. Gracefully handle WebSocket disconnections and reconnections.
- **No Local Server Execution:** The server must **never** be run or tested locally. All runtime testing, verification, and deployment happen on the remote server.
- **Staging Server & Health:** The active server is hosted at `http://192.168.0.77:3001`. Verify backend connectivity with `curl http://192.168.0.77:3001/api/health`.
- **GitHub Webhook Deployment:** Code updates are deployed via git push → webhook at `http://192.168.0.77:3000/api/git/stacks/2/webhook`. This triggers a remote `docker compose -p tablecast -f - up -d --remove-orphans --build --pull always`.
- **No Local Docker Rebuilds:** All Docker builds/rebuilds happen on the remote server via the webhook. Do **not** run `docker compose build` or similar locally.
- **Debugging Tools:** Chrome (Debian package) is available for browser testing against `http://192.168.0.77:3001`. If browser subagents fail, verify endpoints directly with `curl`.
- **Git Version Control & Deployment Trigger:** Always push all changes to the repository. When finished with a task, there should be no uncommitted or unpushed changes left.
- **No 5etools Repository Modifications:** The `5etoolsimg/` and `5etoolssrc/` git submodules have been removed. 5etools reference data (JSON) is fetched from a GitHub raw mirror (`raw.githubusercontent.com/5etools-mirror-3/5etools-src/master/data`) and cached to `server/uploads/5etools-cache/` via `curl`. Monster token images point directly to `https://5e.tools/img/...` (CDN, not behind Cloudflare). Do not create or modify files in the cache directory directly.
- **Auth Pattern:** The server uses header-based auth: `x-tablecast-user-id: <id>`. DM-only endpoints use the `requireDm` middleware (checks `req.get("x-tablecast-user-id")` and verifies role in DB).
- **AI Tool Config:** The `opencode.json` at repo root configures MCP servers (puppeteer) and agent behavior. Do not break the MCP server configuration when making changes. The puppeteer MCP uses `ALLOW_DANGEROUS: "true"` and `--no-sandbox`/`--disable-setuid-sandbox` flags — these are required in the container environment where Chrome runs as root inside Docker and lack sandbox capabilities. These are not security concerns on the trusted LAN.

---

## Security Context

Tablecast is designed to run **only on a trusted Local Area Network (LAN)** — typically the DM's home Wi-Fi. The server binds to `0.0.0.0` so phones and tablets on the same LAN/Subnet can connect directly via the DM's local IP address.

**This has important security implications:**
- **No TLS/HTTPS:** The server serves plain HTTP. All traffic including auth headers is unencrypted on the wire. This is acceptable only because the LAN is trusted.
- **No CSRF protection:** State-changing endpoints rely on header-based auth. Cross-origin attacks are not a realistic threat on a trusted LAN.
- **Rate limiting:** API has a 200 requests per minute per IP limit configured via `express-rate-limit`. This is acceptable because the LAN is trusted; adjust rate limits via the server config if needed.
- **User-ID-based auth is not cryptographic:** The `x-tablecast-user-id` header is not signed or verified beyond checking the user exists. Any client on the LAN can impersonate any user including the DM. Treat this as a convenience for local gaming, not a security boundary.
- **Debug endpoints are unprotected:** Debug, MCP log, and AI response log endpoints are open. This allows anyone on the LAN to inspect server state, LLM prompts, and responses. This is by design for local debugging convenience.

---

## Network Topology

```
┌─────────────────────────────────────────────────────┐
│ DM's Computer (192.168.0.77:3001)                    │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Docker Container: tablecast                      │ │
│  │  ┌────────────┐     ┌─────────────────────────┐ │ │
│  │  │ Express API │────▶│ Prisma + SQLite (local) │ │ │
│  │  │ Socket.io   │◀───▶│ MCP Server              │ │ │
│  │  │ Static SPA  │     │ AI Provider (Ollama/API)│ │ │
│  │  └────────────┘     └─────────────────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│ Players connect over LAN via http://192.168.0.77:3001 │
└─────────────────────────────────────────────────────┘
```

---

## Logging & Debugging Infrastructure

The server has a structured logging and debugging system designed to help AI agents self-diagnose.

### Structured JSON Logger (`server/src/utils/logger.js`)
- **Usage:** `const logger = require("../utils/logger")` → `logger.info(ns, msg, meta)`, `logger.error(ns, msg, meta)`, etc.
- **Namespaces** (`ns`): Use dotted hierarchies like `"http"`, `"socket"`, `"ai:chat"`, `"mcp"`, `"auth"`.
- **Output:** Every call produces a single JSON line on stdout (info/warn/debug) or stderr (error).
- **Control:** Set `LOG_LEVEL` env var — `silent` | `error` | `warn` | `info` (default) | `debug`.
- **Legacy DEBUG env:** The older `DEBUG=tablecast:*` namespace logger (`server/src/utils/debug.js`) still works alongside the new logger.
- **Migration:** When editing server code, prefer `logger.info/error/warn/debug` over `console.log/error`.

### Request ID Middleware
- Every HTTP request gets a unique `req.id` (8-char hex via `crypto.randomUUID()`).
- Log lines for the same request can be correlated by including `reqId: req.id` in the meta object.

### Morgan HTTP Logging
- All HTTP requests are logged as structured JSON via `morgan` with method, URL, status code, and response time.
- Output goes through the structured logger under namespace `"http"`.

### Centralized Error Handler (`server/src/index.js`)
- Use `throw new AppError(statusCode, message)` in routes to produce consistent JSON error responses.
- 500 errors include stack traces in the log; 4xx errors do not.
- The error middleware logs via `logger.error("http:error", ...)` with `reqId`, `status`, `error`, and `stack`.

### Debug Endpoints (all require DM auth via `x-tablecast-user-id: 1`)

| Endpoint | Description |
|---|---|
| `GET /api/debug` | Full server health: uptime, memory, DB status, entity counts, reference cache, active SSE transports |
| `GET /api/debug/mcp-logs?limit=50&tool=` | Recent MCP tool call audit trail from the `mcp_logs` table |
| `GET /api/debug/ai-logs?limit=50&operation=` | Recent AI response history from the `ai_response_logs` table (raw LLM output included) |
| `GET /api/ai/debug` | AI subsystem state: provider, model, API key status, response log stats, conversation counts, active SSE transports |

### Prisma Audit Models

**`mcp_logs`** — Every MCP tool invocation is persisted automatically:
- `tool`, `arguments` (JSON), `result` (JSON), `isError`, `createdAt`
- Indexed by `tool` and `createdAt` for efficient querying.

**`ai_response_logs`** — Every AI API call (via `performAiCall`) is persisted automatically:
- `operation`, `prompt` (first 5000 chars), `rawReply` (first 10000 chars), `parsedOk`, `errorMsg`, `durationMs`, `createdAt`
- Indexed by `operation`, `parsedOk`, and `createdAt`.
- Use this to debug LLM output issues: find failed parses with `WHERE parsedOk = false`.

### MCP SSE Heartbeat
- Active MCP SSE transport sessions log a `debug`-level heartbeat every 60s via namespace `"mcp:sse:heartbeat"`.
- Includes `sessionId`, `ageMs`, and `ageSeconds` to detect stale connections.

### Pushover Notifications
The AI agent's OpenCode environment sends mobile push notifications via the [Pushover](https://pushover.net/) API to alert the DM when the agent needs attention.

**Configuration:**
- Credentials stored in `~/.config/opencode/pushover.json`: `token` (app token) and `user` (user key).
- Can also be set via env vars `PUSHOVER_APP_TOKEN` and `PUSHOVER_USER_KEY`.
- Disable entirely by setting `OPENCODE_NOTIFY=0`.

**Trigger events:**

| Event | Notification Title | Message Content |
|---|---|---|
| `session.idle` | `Tablecast ✅/⚠️/❌` | Session summary: tool counts by type, last action, error count |
| `permission.asked` | `🔐 Permission needed` | The permission title, pattern, or type being requested |
| `question.asked` | `❓ Question` | The question text the agent is asking |

**Session summary format:** `"5 done, 0 errors — bash×3, read×2\nLast: initialized npm"` — accumulates all tool calls in a session, groups by tool name, and appends the last action.

**Plugin location:** `~/.config/opencode/plugins/opencode-notify.mjs` — registered via `opencode.json` at the repo root.

---

## Project Architecture

### Repository Layout

| Path | Purpose |
|---|---|
| `server/src/index.js` | Express + Socket.io entry point, middleware, route mounting, error handler |
| `server/src/socket.js` | All Socket.io event handlers (~813 lines, 12+ event types) |
| `server/src/mcp-server.js` | MCP server entry point (~177 lines, tools defined in `server/src/mcp/`) |
| `server/src/mcp-cli.js` | MCP CLI client for debugging |
| `server/src/auth.js` | Header-based auth (`x-tablecast-user-id`), `requireDm` middleware |
| `server/src/prisma.js` | Prisma client singleton |
| `server/src/routes/` | 14 route modules (see table below) |
| `server/src/utils/` | Logger, debug, backup, reference search/sync, token image lookup |
| `client/src/utils/dynamicLighting.js` | Raycasting line-of-sight computation for VTT |
| `client/src/components/map/` | Modular map rendering: MapCanvas, MapToolbar, useMapData, useMapInteraction |
| `server/prisma/schema.prisma` | 17 models: SQLite with Prisma |
| `client/src/App.jsx` | React root component (~36KB) |
| `client/src/components/` | 20+ React components |
| `client/src/context/` | `SocketContext.jsx`, `DiceBoxContext.jsx` |
| `client/src/hooks/` | `useAiChat.js` |
| `client/src/utils/` | `aiStream.js` |
| `client/src/lib/` | `diceThemes.js` |
| `Dockerfile` | Multi-stage: Vite build → node:22-slim runtime with rclone |
| `docker-compose.yml` | Single service with persistent volumes (db, uploads, 5etools-cache) |
| `opencode.json` | AI assistant MCP/tool configuration |

### API Route Modules

| Path | File | Purpose |
|---|---|---|
| `GET/POST /api/users` | `routes/users.js` | Player/DM user management |
| `GET/POST/PUT/DELETE /api/characters` | `routes/characters.js` | D&D 5e character sheets CRUD |
| `GET/POST/PUT/DELETE /api/npcs` | `routes/npcs.js` | DM-created NPC statblocks CRUD |
| `GET/POST/PUT/DELETE /api/monsters` | `routes/monsters.js` | Imported monster bestiary CRUD |
| `GET/POST/PUT/DELETE /api/wiki` | `routes/wiki.js` | DM Wiki articles (LORE, NPC, LOG, etc.) |
| `GET/POST/PUT/DELETE /api/maps` | `routes/maps.js` | VTT map images CRUD |
| `GET/POST/PUT/DELETE /api/encounters` | `routes/encounters.js` | Combat encounters with participants |
| `POST /api/backup` | `routes/backup.js` | Trigger zip + rclone backup to Google Drive |
| `GET /api/reference` | `routes/reference.js` | 5e SRD reference search |
| `GET/POST /api/ai` | `routes/ai.js` | AI queries, NPC generation, encounter building, settings |
| `POST /api/rolls` | `routes/rolls.js` | Dice roll history |
| `GET/POST /api/chat` | `routes/chat.js` | Chat message history |
| `GET/POST/PUT/DELETE /api/sessions` | `routes/sessions.js` | Game session planning with agenda/recap |
| `GET /api/debug` | `routes/debug.js` | Server health, MCP logs, AI response logs |

### Socket.io Events

**Client → Server:**

| Event | Payload | Purpose |
|---|---|---|
| `chat:send` | `{ sender, text, type, userId, rollDetails }` | Chat message + dice roll submission |
| `chat:typing` | `{ sender }` | Typing indicator |
| `token:move` | `{ id, mapId, x, y, visionRadius?, darkvisionRadius?, auraRadius?, auraColor?, conditions? }` | Token drag on VTT grid |
| `token:create` | `{ mapId, label, imageUrl, x, y, characterId?, visionRadius?, darkvisionRadius?, auraRadius?, auraColor?, conditions? }` | New token placement |
| `token:delete` | `{ id }` | Remove token |
| `map:select` | `{ mapId }` | Switch active map |
| `map:delete` | `{ mapId }` | Delete a map |
| `fog:update` | `{ mapId, fogState }` | Fog of war polygon update |
| `encounter:refresh` | `{ encounterId }` | Request encounter state refresh |
| `encounter:turn` | `{ encounterId, action }` | Advance/change turn |

**Server → Client:**

| Event | Payload | Purpose |
|---|---|---|
| `chat:message` | `{ id, sender, text, type, userId, timestamp }` | New chat message broadcast |
| `chat:message:update` | `{ id, text }` | Streaming AI reply update |
| `token:moved` | `{ id, mapId, x, y }` | Token position broadcast |
| `token:created` | token object | New token broadcast |
| `token:deleted` | `{ id }` | Token removal broadcast |
| `map:selected` | `{ mapId }` | Map switch broadcast |
| `map:deleted` | `{ mapId }` | Map deletion broadcast |
| `fog:updated` | `{ mapId, fogState }` | Fog state broadcast |
| `encounter:updated` | encounter object | Encounter changes broadcast |
| `encounter:turnChanged` | turn data | Turn advancement broadcast |

### MCP Server Tools (30 tools)

| Tool | Purpose |
|---|---|
| `list_users`, `create_user` | User management |
| `list_characters`, `create_character`, `update_character`, `delete_character` | Character sheet CRUD |
| `list_npcs`, `create_npc`, `update_npc`, `delete_npc` | NPC statblock CRUD |
| `list_monsters`, `create_monster`, `update_monster`, `delete_monster` | Monster bestiary CRUD |
| `list_wiki_articles`, `create_wiki_article`, `update_wiki_article`, `delete_wiki_article` | Wiki article CRUD |
| `list_encounters`, `create_encounter`, `update_encounter` | Combat encounter management |
| `add_encounter_participant`, `update_encounter_participant` | Encounter combatant management |
| `list_sessions`, `create_session`, `update_session` | Game session management |
| `add_item_to_character`, `add_item_to_npc` | Inventory management |
| `search_reference`, `get_reference_detail` | 5e SRD reference lookup |

### Prisma Models (17 models)

| Model | Table | Key Fields |
|---|---|---|
| `User` | `users` | `id`, `username`, `role` ("DM"\|"PLAYER"), `diceTheme`, `diceColor` |
| `ChatMessage` | `chat_messages` | `id`, `userId?`, `sender`, `text`, `type`, `rollDetails?` |
| `Character` | `characters` | `userId`, `name`, `race`, `class`, `level`, 6 ability scores, `inventory` (JSON), `modifiers` (JSON) |
| `Map` | `maps` | `name`, `imageUrl`, `gridSize`, `gridType` ("SQUARE"\|"HEX"), `fogState` (JSON), `walls` (JSON) |
| `Token` | `tokens` | `mapId`, `characterId?`, `npcId?`, `monsterId?`, `label`, `imageUrl`, `x`, `y`, `stats?`, `conditions` (JSON), `visionRadius`, `darkvisionRadius`, `auraRadius`, `auraColor` |
| `WikiArticle` | `wiki_articles` | `title`, `content`, `isVisibleToPlayers`, `category`, `tags` (JSON) |
| `AppSetting` | `app_settings` | `key` (PK), `value` |
| `Npc` | `npcs` | 6 abilities, `hp`, `ac`, `cr`, `actions` (JSON), narrative fields |
| `Monster` | `monsters` | Same structure as Npc (imported from 5etools SRD) |
| `Encounter` | `encounters` | `name`, `mapId`, `status`, `round`, `turnIndex` |
| `EncounterParticipant` | `encounter_participants` | `encounterId`, `tokenId?`, `npcId?`, `characterId?`, `monsterId?`, initiative, HP, AC, `conditions` (JSON), `deathSaves` (JSON) |
| `Roll` | `rolls` | `sender`, `formula`, `rolls` (JSON), `modifier`, `total`, `diceTheme`, `diceColor` |
| `GameSession` | `game_sessions` | `title`, `status`, `agenda`, `prepChecklist` (JSON), `recap`, linked IDs |
| `AiConversation` | `ai_conversations` | `userId?`, `type` ("rules"\|"npc"), `npcId?`, messages relation |
| `AiMessage` | `ai_messages` | `conversationId`, `role` ("user"\|"assistant"), `text` |
| `McpLog` | `mcp_logs` | `tool`, `arguments` (JSON), `result` (JSON), `isError` |
| `AiResponseLog` | `ai_response_logs` | `operation`, `prompt`, `rawReply`, `parsedOk`, `durationMs` |

---

## Agent Roles

### 🛠️ Agent 1: DevOps & Database Architect
**Focus:** Docker, server initialization, Prisma schema, SQLite, system dependencies.
**Prompt Prefix:** *"Act as the DevOps and DB Architect. Your task is to..."*
**Directives:**
- **Maintain** the `Dockerfile` (multi-stage: Vite build → node:22-slim runtime with rclone, openssl, curl).
- **Maintain** `docker-compose.yml` with persistent volumes for SQLite (`tablecast-db`), uploads (`tablecast-uploads`), and 5etools cache (`tablecast-5etools-cache`).
- **Manage** Prisma schema — add/modify models in `server/prisma/schema.prisma`, run `npx prisma migrate dev` to generate migrations, update `server/prisma/seed.js` as needed.
- **Keep** `server/prisma/data/rclone.conf` generated from DB `app_settings` — do not hardcode cloud credentials.
- **Never** run local Docker rebuilds. Deploy via git push → webhook.

### 🔌 Agent 2: Backend & Real-Time Engineer
**Focus:** Express API routes, Socket.io, MCP server, Prisma integration, backup, auth.
**Prompt Prefix:** *"Act as the Backend Engineer. Your task is to..."*
**Directives:**
- **Extend** existing route modules (14 routes in `server/src/routes/`) — users, characters, NPCs, monsters, wiki, maps, encounters, backup, reference, AI, rolls, chat, sessions, debug.
- **Add** Socket.io events in `server/src/socket.js` following the existing patterns (validation, persistence, broadcast).
- **Maintain** the MCP server (`server/src/mcp-server.js`) — add/modify tools for AI agent CRUD access to all Prisma models.
- **Maintain** the auth system (`server/src/auth.js`) — header-based `x-tablecast-user-id` with `requireDm` middleware.
- **Maintain** the backup utility (`server/src/utils/backup.js`) — zip archive + rclone copy, config loaded from `app_settings` table.
- **Log** all operations using `logger.info/error` with appropriate namespaces and meta (`reqId`, etc.). Avoid `console.log` in server code.

### 📱 Agent 3: Frontend UI/UX Developer
**Focus:** React components, Vite build, 3D dice box, character sheet, Tailwind/CSS, socket client.
**Prompt Prefix:** *"Act as the Frontend UI Developer. Your task is to..."*
**Directives:**
- **Maintain** existing components in `client/src/components/` — ChatPanel, CharacterSheet, MapPanel, WikiPanel, SessionsPanel, SettingsPanel, DiceRollerPanel, AiPanel, etc.
- **Use** `SocketContext` (`client/src/context/SocketContext.jsx`) for real-time state — emit events, listen for broadcasts.
- **Use** `DiceBoxContext` (`client/src/context/DiceBoxContext.jsx`) for 3D dice rendering via `@3d-dice/dice-box`.
- **Preserve** the Vite build pipeline — do not eject or change bundler. The client is built inside the Dockerfile and served by Express.
- **Ensure** all interactive elements are mobile-friendly: 44×44px minimum touch targets, swipeable layouts, responsive design.
- **Auto-calculate** D&D 5e ability modifiers on the frontend when base stats change.

### 🗺️ Agent 4: VTT Engine Developer
**Focus:** Canvas rendering, token manipulation, grid/fog mechanics, touch events.
**Prompt Prefix:** *"Act as the VTT Engine Developer. Your task is to..."*
**Directives:**
- **Maintain** the map rendering in `client/src/components/MapPanel.jsx` (~133KB) — the largest component, handles canvas/Konva rendering, token drag-and-drop, grid overlay, fog of war.
- **Prioritize** touch events (`onTouchStart`, `onTouchMove`) over mouse events for all interactive canvas elements.
- **Token snap** — drag-and-drop must auto-calculate nearest grid intersection and snap on release, then emit `token:move` via Socket.io.
- **Fog of War** — DM-drawn opaque polygons over the map layer. Emit `fog:update` on changes.
- **Grid** — render responsive, scalable grid overlay. Support both "SQUARE" and "HEX" grid types.
- **Dynamic Lighting** — raycasting line-of-sight from `client/src/utils/dynamicLighting.js`. Walls stored as JSON on Map model (`walls`). Token `visionRadius`/`darkvisionRadius` control visible area. Render visible polygon using canvas `clip()`.
- **Token Auras & Conditions** — `auraRadius`/`auraColor` rendered as colored rings; `conditions` JSON array shown as colored status wedges on token base.

### 🤖 Agent 5: AI Integration Engineer
**Focus:** AI subsystem, MCP server, reference data, LLM streaming.
**Prompt Prefix:** *"Act as the AI Integration Engineer. Your task is to..."*
**Directives:**
- **Maintain** the AI subsystem in `server/src/routes/ai.js` — multi-provider support (OpenAI-compatible + Ollama), streaming, NPC generation, encounter building, rules scholar.
- **Maintain** the MCP server (`server/src/mcp-server.js`) — the bridge between AI agents and the game data. Tools follow the `{ name, description, inputSchema }` pattern from the MCP SDK.
- **Maintain** reference syncing (`server/src/utils/referenceSync.js`) — fetches D&D 5e SRD data from a GitHub raw mirror (`raw.githubusercontent.com/5etools-mirror-3/5etools-src/master/data`) and caches it to disk (`server/uploads/5etools-cache/`) for local offline rules lookup.
- **Maintain** reference search (`server/src/utils/referenceSearch.js`) — full-text search across synced SRD data with relevance ranking.
- **Support** chat commands (`/ai <query>`) and dedicated NPC roleplay AI conversations in the frontend.
- **Ensure** AI audit logging: every LLM API call is persisted to `ai_response_logs`, every MCP tool call to `mcp_logs` for debugging.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, React Router 6, Lucide React, DOMPurify, marked |
| **3D Dice** | `@3d-dice/dice-box` (BabylonJS-based) |
| **VTT Canvas** | Raw HTML5 Canvas API (custom useEffect render loop) |
| **Backend** | Node.js 22, Express 4, Socket.io 4 |
| **ORM** | Prisma 5 (SQLite provider) |
| **MCP** | `@modelcontextprotocol/sdk` v1.29 — stdio transport |
| **AI Providers** | OpenAI-compatible API + Ollama (configurable via settings UI) |
| **Backup** | `archiver` (zip) + `rclone` (Google Drive upload) |
| **Container** | Docker multi-stage build (node:22-alpine → node:22-slim) |
| **Dice Textures** | Custom PNG generation (`client/generate-dice-textures.js`, `client/patch-dice-box.js`) |
