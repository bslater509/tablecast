# Project Context

## Environment
- Language: JavaScript (Node.js 22, React 18)
- Runtime: Docker (node:22-slim)
- Build: Vite (client), Docker multi-stage
- Test: N/A (no test suite)
- Package Manager: npm

## Project Type
- [x] Application (Web - D&D 5e VTT companion)

## Infrastructure
- Container: Docker
- Orchestration: Docker Compose (single service)
- CI/CD: GitHub push → webhook → Docker build
- Server: http://192.168.0.77:3001

## Recent Fix: Auth Headers (June 10, 2026)

### Problem
Player characters (heroes) couldn't load their character sheet because:
1. All ~15 frontend components hardcoded `x-tablecast-user-id` header regardless of user type
2. Character IDs could overlap with user IDs (e.g., Thorin II = 1, DungeonMaster = 1)
3. Backend would find the wrong identity in the `users` table first

### Server-Side Fixes (deployed in previous session)
- `server/src/auth.js`: Added `x-tablecast-character-id` support in `getRequestIdentity`, falls back to `characters` table
- `server/src/routes/characters.js`: Added `isSelf` checks for character identities in GET/:id, PUT/:id, DELETE/:id; fixed list filtering

### Client-Side Fixes (this session)
All 12+ files now use `getAuthHeaders(user)`/`getJsonAuthHeaders(user)`:
- CharacterSheet.jsx, map/useMapData.js, AiAssistButton.jsx
- CharacterList.jsx, EncountersPanel.jsx, ImporterPanel.jsx
- MessageHub.jsx, SessionsPanel.jsx, SettingsPanel.jsx, WikiPanel.jsx
- hooks/useAiChat.js, hooks/useConversations.js
- context/AiContext.jsx, utils/aiStream.js

### Verification
- `client/src/utils/authHeaders.js` - LSP clean
- No `x-tablecast-user-id` remains in client/src
- Health check: OK at :3001
- Deployed via commit 79abf79
