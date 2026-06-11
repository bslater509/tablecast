# Mission: Section 3.1 - Ambient Soundboard & Background Music

## M1: Backend — Prisma Soundtrack model & migration | agent:Worker
- [ ] S1.1: Add Soundtrack model to schema.prisma (id, name, category, filePath, duration, loop)
- [ ] S1.2: Generate Prisma migration for Soundtrack model
- [ ] S1.3: Create server/uploads/audio/ directory with .gitkeep

## M2: Backend — Soundtrack CRUD + audio upload route | agent:Worker | depends:M1
- [ ] S2.1: Create server/src/routes/soundtracks.js with multer upload + CRUD endpoints
- [ ] S2.2: Mount route in server/src/index.js at /api/soundtracks

## M3: Backend — Socket.io sound:state / sound:sync events | agent:Worker | depends:M1
- [ ] S3.1: Add sound:state and sound:sync socket event handlers to socket.js
- [ ] S3.2: Store current sound state in server memory (in-memory state)

## M4: Backend — MCP tool schemas + handlers for Soundtrack | agent:Worker | depends:M1
- [ ] S4.1: Add soundtrack tool schemas to server/src/mcp/schemas.js
- [ ] S4.2: Create server/src/mcp/handlers/soundtracks.js with CRUD handlers
- [ ] S4.3: Wire handlers into mcp-server.js

## M5: Frontend — SoundContext (AudioContext + socket sync) | agent:Worker
- [ ] S5.1: Create client/src/context/SoundContext.jsx with AudioContext management, multi-client sync
- [ ] S5.2: Add song library with pre-loaded OGG/MP3 URLs from the public folder

## M6: Frontend — SoundboardPanel component | agent:Worker | depends:M5
- [ ] S6.1: Create client/src/components/SoundboardPanel.jsx (track list, play/pause, volume, crossfade, upload, queue)
- [ ] S6.2: Wire up socket sound:state/sound:sync events

## M7: Frontend — Nav item + route + wrapper in App.jsx | agent:Worker | depends:M6
- [ ] S7.1: Add "Soundboard" nav item to DM_NAV_ITEMS in App.jsx
- [ ] S7.2: Add route for /dm/soundboard in App.jsx
- [ ] S7.3: Wrap SoundContext provider in App.jsx

## M8: Verification | agent:Reviewer | depends:M2,M3,M4,M7
- [ ] S8.1: Run Vite build
- [ ] S8.2: Run LSP diagnostics
- [ ] S8.3: Verify server routes load cleanly
- [ ] S8.4: Update features.md §3.1 status to [x]
- [ ] S8.5: Git commit and push

## M9: Post-Deploy Verify | agent:Reviewer | depends:M8
- [ ] S9.1: Verify server starts and /api/soundtracks endpoint responds
- [ ] S9.2: Verify frontend builds and Soundboard panel loads
