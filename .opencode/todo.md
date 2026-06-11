# Mission: Section 3 - Narrative & Worldbuilding

## Strategy
- **Phase 1**: Batch all Prisma schema changes + migration (single operation)
- **Phase 2**: Backend routes + utilities + MCP tools (parallel by domain)
- **Phase 3**: Frontend components (parallel by domain)
- **Phase 4**: Integration (nav items, routes, App.jsx wiring)
- **Phase 5**: Full verification + deploy

---

## Phase 1: Prisma Schema + Migration | agent:Worker

### T1: Add all Section 3 models to schema.prisma + generate migration
- [x] S1.1: Add `Quest` model (id, title, description, status, objectives JSON, rewards JSON, questGiverNpcId?, parentQuestId?, assignedToCharacterIds JSON, isVisibleToPlayers) | verified
- [x] S1.2: Add `Handout` model (id, title, content, imageUrl, targetCharacterIds JSON, isRead, createdByDmId) | verified
- [x] S1.3: Add `dialogueTree` JSON field to Npc model | verified
- [x] S1.4: Generate Prisma migration: `npx prisma migrate dev --name add_section3_models` | verified
- [x] S1.5: Verify migration applied and Prisma client regenerated | verified

---

## Phase 2: Backend (Parallel by Domain)

### T2: Calendar & Weather Backend | agent:Worker | depends:T1 | status: completed 🔵
- [x] S2.1: Create `server/src/utils/weatherGenerator.js` — seasonal weather tables and random weather generation | verified
- [x] S2.2: Create `server/src/routes/calendar.js` — GET calendar config, PUT calendar config, POST advance time, POST weather/generate | verified
- [x] S2.3: Mount calendar route in server/src/index.js at /api/calendar | verified
- [x] S2.4: Add socket event `game:dateChange` in socket.js for calendar advancement broadcasts | verified
- [x] S2.5: Add MCP tools to schemas.js: get_calendar, update_calendar, advance_calendar, generate_weather | verified
- [x] S2.6: Create MCP handlers: `server/src/mcp/handlers/calendar.js` | verified
- [x] S2.7: Wire calendar MCP handlers into mcp-server.js | verified

### T3: Quest/Journal Backend | agent:Worker | depends:T1
- [x] S3.1: Create `server/src/routes/quests.js` — full CRUD + list player-visible + assign to character + toggle objective | verified
- [x] S3.2: Mount quest route in server/src/index.js at /api/quests | verified
- [x] S3.3: Add MCP tools to schemas.js: list_quests, create_quest, update_quest, delete_quest | verified
- [x] S3.4: Create MCP handlers: `server/src/mcp/handlers/quests.js` | verified
- [x] S3.5: Wire quest MCP handlers into mcp-server.js | verified

### T4: Player Handouts Backend | agent:Worker | depends:T1
- [x] S4.1: Create `server/src/routes/handouts.js` — CRUD + list by character + mark read + socket notification | verified
- [x] S4.2: Mount handout route in server/src/index.js at /api/handouts | verified
- [x] S4.3: Add socket events for handout notifications (`handout:new`, `handout:read`) | verified
- [x] S4.4: Add MCP tools to schemas.js: list_handouts, create_handout, update_handout, delete_handout | verified
- [x] S4.5: Create MCP handlers: `server/src/mcp/handlers/handouts.js` | verified
- [x] S4.6: Wire handout MCP handlers into mcp-server.js | verified

### T5: Dialogue Tree Backend | agent:Worker | depends:T1
- [x] S5.1: Create `server/src/routes/dialogue.js` — GET/PUT dialogue tree for NPC, POST execute dialogue node (server-side condition eval) | verified
- [x] S5.2: Mount dialogue route in server/src/index.js at /api/npcs/:id/dialogue | verified
- [x] S5.3: Create `server/src/utils/dialogueEngine.js` — condition evaluator, node resolver, CHAT logging | verified
- [x] S5.4: Add socket events for dialogue state (`dialogue:start`, `dialogue:advance`) | verified
- [x] S5.5: Add MCP tools to schemas.js: get_npc_dialogue, update_npc_dialogue, start_dialogue, advance_dialogue | verified
- [x] S5.6: Create MCP handlers: `server/src/mcp/handlers/dialogue.js` | verified
- [x] S5.7: Wire dialogue MCP handlers into mcp-server.js | verified

---

## Phase 3: Frontend (Parallel by Domain)

### T6: CalendarPanel Frontend | VERIFIED
- [x] S6.1: Create `client/src/components/CalendarPanel.jsx` — calendar config, month view, weather display, time advancement controls
- [x] S6.2: Add calendar panel styles (inline styles or styles object)
- [x] S6.3: Weather generation and display UI
- [x] S6.4: Socket `game:dateChange` listener for date sync

### T7: QuestLogPanel Frontend | VERIFIED 🔵
- [x] S7.1: Create `client/src/components/QuestLogPanel.jsx` — active/completed quests, quest cards with objectives, progress bars | verified
- [x] S7.2: DM quest creation panel with objective builder | verified
- [x] S7.3: Player-facing journal tab showing assigned quests | verified
- [x] S7.4: Notification badges for journal updates | verified: QuestLogPanel.jsx has notificationDot, statusBadge, newQuestCount logic (lines 952, 1028, 1665)

### T8: HandoutPanel Frontend | VERIFIED ✅
- [x] S8.1: Create `client/src/components/HandoutPanel.jsx` — list handouts by character, view handout detail with image, mark read
- [x] S8.2: DM handout creation form (title, content, image upload, target selection)
- [x] S8.3: Socket `handout:new` listener — toast + badge notification
- [x] S8.4: "Handouts" tab in player UI (component ready for App.jsx integration)

### T9: DialogueTree Frontend | agent:Worker | depends:T5 | VERIFIED 🔵
- [x] S9.7: Resolve orphaned duplicate — DialogueEditor.jsx is imported by WikiPanel, DialogueTreePanel.jsx is the wired route component | verified
- [x] S9.1: Create `client/src/components/DialogueEditor.jsx` — node graph editor with drag-to-connect
- [x] S9.2: Node palette (SPEECH, CHOICE, CONDITION, ACTION, RANDOM, SKILL_CHECK)
- [x] S9.3: Node property editor (click node → edit in side panel)
- [x] S9.4: DM dialogue runner panel (start dialogue, navigate tree, override branches)
- [x] S9.5: Player chat bubble interface for dialogue (visible when dialogue active)
- [x] S9.6: Skill check roll integration in dialogue nodes

---

## Phase 4: Integration | agent:Worker | depends:T6,T7,T8,T9

### T10: Wire up App.jsx | status: in_progress
- [x] S10.1: Add "Calendar" nav item to DM_NAV_ITEMS | verified in App.jsx line 121
- [x] S10.2: Add "Journal" nav item to DM_NAV_ITEMS and player nav | verified in App.jsx lines 145-148, 1210-1222
- [x] S10.3: Add "Handouts" tab to player UI | verified in App.jsx lines 138-141, 1084, 1194-1201
- [x] S10.4: Add Dialogue runner button in Npc detail view in WikiPanel | verified: WikiPanel line 1064 navigates to `/dm/dialogue/${id}`, DialogueEditor imported line 23
- [x] S10.5: Add calendar/handouts/journal routes to App.jsx | verified: `/dm/calendar`, `/dm/handouts`, `/dm/journal`, `/player/handouts`, `/player/journal`, `/dm/popout/handouts` exist
- [x] S10.6: Add DialogueTreePanel route to App.jsx (DM nav + route) | verified: `/dm/dialogue` and `/dm/dialogue/:npcId` routes exist at lines 1404-1405
- [x] S10.7: Add CalendarWidget import and render location (orphan component, now consumed in CalendarPanel player view) | verified

---

## Phase 5: Verify & Deploy | agent:Reviewer | depends:T10

### T11: Full System Verification | status: in_progress
- [x] S11.1: Run LSP diagnostics on all new files (zero errors) | verified: ALL CLEAN (CalendarPanel, CalendarWidget, QuestLogPanel, HandoutPanel, DialogueEditor, DialogueTreePanel, App.jsx)
- [x] S11.2: Run Vite build (must succeed) | verified: PASSES (1798 modules)
- [x] S11.3: Run server syntax check (`node -c` on all server files) | verified: ALL PASS
- [x] S11.4: Update features.md — set §3.2, §3.3, §3.4, §3.5 status to [x] | done
- [x] S11.5: Git commit and push all changes (blocked until T10 integration complete)

### T12: Post-Deploy Verify | agent:Reviewer | depends:T11
- [x] S12.1: Verify server starts and /api/calendar, /api/quests, /api/handouts, /api/npcs/:id/dialogue endpoints respond
- [x] S12.2: Verify frontend builds and all new panels load
