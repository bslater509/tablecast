# Project Context - Section 3 Complete

## Environment
- Language: JavaScript (Node.js 22, React 18)
- Build: Vite 5 (client) / Node (server)
- Test: No frontend unit tests (project pattern)
- Package Manager: npm, Docker, Prisma 5 (SQLite)

## What Was Built - Section 3: Narrative & Worldbuilding

### 3.2 In-Game Calendar & Weather
- **Backend**: `server/src/routes/calendar.js` - GET/PUT calendar config, POST advance time, POST generate weather
- **Storage**: Calendar config stored in AppSetting table (`calendar.config` key) as JSON
- **Utility**: `server/src/utils/weatherGenerator.js` - Procedural D&D weather: seasons/terrain modifiers, 10 weather types, wind, temperature
- **Socket**: `game:dateChange` event broadcast
- **Default**: Forgotten Realms calendar (12 months: Hammer, Alturiak, Ches, etc.), year 1495
- **MCP**: get_calendar, update_calendar, advance_calendar, generate_weather
- **Frontend**: CalendarPanel.jsx + CalendarWidget.jsx - DM calendar config + player weather view

### 3.3 Quest/Journal Log
- **Backend**: `server/src/routes/quests.js` - CRUD quests with objectives/rewards/quest chains
- **Prisma**: Quest model (title, description, status, objectives JSON, rewards JSON, questGiverNpcId, parentQuestId, isVisibleToPlayers)
- **MCP**: list_quests, create_quest, update_quest, delete_quest
- **Frontend**: QuestLogPanel.jsx - DM quest CRUD with objective builder, reward config, quest chain support

### 3.4 NPC Dialogue Trees
- **Backend**: `server/src/routes/dialogue.js` (mounted at `/api/npcs/:npcId/dialogue`) - GET/PUT tree, POST start/advance/evaluate
- **Prisma**: Npc model has `dialogueTree` (JSON) field
- **Utility**: `server/src/utils/dialogueEngine.js` - Tree traversal, skill check resolution, condition evaluation
- **Socket**: dialogue:start, dialogue:advance events
- **MCP**: get_npc_dialogue, update_npc_dialogue, start_npc_dialogue, advance_npc_dialogue
- **Frontend**: DialogueTreePanel.jsx - DM tree builder (6 node types: SPEECH/CHOICE/CONDITION/ACTION/RANDOM/SKILL_CHECK) + player chat bubble mode

### 3.5 Player Handouts
- **Backend**: `server/src/routes/handouts.js` - CRUD handouts with character targeting
- **Prisma**: Handout model (title, content, imageUrl, targetCharacterIds JSON, isRead, createdByDmId)
- **Socket**: handout:created, handout:updated, handout:deleted
- **MCP**: list_handouts, create_handout, update_handout, delete_handout
- **Frontend**: HandoutPanel.jsx / HandoutsPanel.jsx - DM create/assign + player read view

### Deployment
- All endpoints verified live at 192.168.0.77:3001
- Git commits: a4ade56 (section 3 code), 5636b0d (cleanup)
