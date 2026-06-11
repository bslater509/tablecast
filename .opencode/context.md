# Project Context

## Current Mission: Section 3 - Narrative & Worldbuilding (IN PROGRESS)

Section 3.1 (Soundboard) already implemented. Implementing 3.2-3.5.

---

## Section 3 Features to Implement

### 3.2 In-Game Calendar & Weather (Planned → Implement)
- Calendar stored as JSON in AppSetting with key `calendar`
- DM configures via Calendar Settings panel
- Weather generator: per-season weather tables
- Display in DM header bar, calendar modal

### 3.3 Quest/Journal Log (Planned → Implement)
- New `Quest` model: title, description, status, objectives, rewards
- Player Journal UI tab
- DM creation panel with objective builder
- Quest chains, assignment to characters/party

### 3.4 Dialogue Tree Builder for NPCs (Planned → Implement)
- Node types: SPEECH, CHOICE, CONDITION, ACTION, RANDOM, SKILL_CHECK
- Stored as JSON on Npc model
- Node graph editor (drag-to-connect)
- Dialogue runner: DM opens dialogue panel, players see chat-like bubble

### 3.5 Player Handouts (Planned → Implement)
- New `Handout` model: title, content, image attachment, target character(s)
- Handouts tab for players
- Socket notification for new handouts

---

## Architecture Patterns

### Route Pattern
- DM-only routes use `requireDm` middleware
- Mixed routes use `getRequestUser` or `requireUser`
- Standard CRUD with try/catch, logger.error, consistent error responses

### MCP Tool Pattern
- Schemas in `server/src/mcp/schemas.js` - add to TOOLS array
- Handlers in `server/src/mcp/handlers/<domain>.js`
- Wire in `server/src/mcp-server.js` (import + spread into HANDLERS)

### Prisma Pattern
- SQLite with autoincrement IDs, JSON stored as TEXT
- All models use `@@map("table_name")` for naming
- After schema change: `npx prisma migrate dev --name <name>`

### Frontend Pattern
- Components in `client/src/components/`
- Sub-directories for extracted modules (wiki/, settings/, chat/, etc.)
- Auth headers via `getAuthHeaders`/`getJsonAuthHeaders` from `utils/authHeaders.js`
- Socket via `SocketContext`
- Nav items in DM_NAV_ITEMS array in App.jsx

### Frontend Styling
- Inline `styles` objects (CSS-in-JS pattern)
- `glass-panel`, `gold-border-glow`, `touch-target`, `btn-hover-scale` CSS classes
- Mobile-first, 44x44px minimum touch targets
- Dark theme: --color-bg, --color-accent (gold), --color-muted, --color-text

### Server Config
- Port 3001, binds to 0.0.0.0
- SQLite via Prisma (DATABASE_URL env)
- Logger: `logger.info/error/warn/debug(ns, msg, meta)`
- Error handler: AppError class

---

## Git
- Branch: master
- Push via webhook to deploy
