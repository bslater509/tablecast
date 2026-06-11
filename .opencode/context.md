# Project Context

## Mission: Split Large Files (COMPLETE ✅)

## Results

### Phase 1: WikiPanel.jsx — 4499→3221 lines (-28%)
Extracted to `client/src/components/wiki/`:
- `NpcStatblock.jsx` (332 lines) — Statblock renderer
- `wikiStyles.js` (875 lines) — Inline styles
- `wikiUtils.js` (123 lines) — calculateModifier, buildImagePrompt, compileMarkdown, parse5eToolsAlignment

### Phase 2: mcp-server.js — 2249→162 lines (-93%)
Extracted to `server/src/mcp/`:
- `schemas.js` (658 lines) — TOOLS array definitions
- `shared.js` (78 lines) — generateModifiers, JSON helpers, validators
- `handlers/users.js` (30 lines) — list_users, create_user
- `handlers/characters.js` (219 lines) — CRUD for characters
- `handlers/npcs.js` (269 lines) — CRUD for NPCs
- `handlers/monsters.js` (243 lines) — CRUD for monsters
- `handlers/encounters.js` (346 lines) — encounters + participants
- `handlers/sessions.js` (216 lines) — CRUD for sessions
- `handlers/wiki.js` (95 lines) — CRUD for wiki articles
- `handlers/reference.js` (58 lines) — search/get reference info

Architecture: Dynamic handler resolution via convention
`handle + PascalCase(toolName)` → spread into HANDLERS object

### Phase 3: CharacterSheet.jsx — 2616→1235 lines (-53%)
Extracted to `client/src/components/character/`:
- `characterStyles.js` (803 lines) — Inline styles
- `characterUtils.js` (58 lines) — SKILL_DEFINITIONS, getMod, formatMod, getProficiencyBonus
- `AbilityScoresPanel.jsx` (73 lines) — Stats tab
- `SkillsPanel.jsx` (50 lines) — Skills tab
- `AttacksPanel.jsx` (185 lines) — Attacks tab
- `InventoryPanel.jsx` (140 lines) — Inventory tab
- `SpellsPanel.jsx` (295 lines) — Spells tab

### Phase 4: SettingsPanel.jsx — 2044→70 lines (-96%)
Extracted to `client/src/components/settings/`:
- `settingsStyles.js` (342 lines) — Inline styles
- `settingsApi.js` (101 lines) — API fetch functions
- `AiSetup.jsx` (254 lines) — AI provider configuration
- `BackupSettings.jsx` (1265 lines) — rclone backup + reference cache management
- `SettingsPanel.jsx` (70 lines) — Thin orchestrator, imports + renders sub-components

### Phase 6: EncountersPanel.jsx — 1642→857 lines (-48%)
Extracted to `client/src/components/encounters/`:
- `encounterStyles.js` (389 lines) — Styles object + hpColor/badgeColor helpers
- `AiBuilderModal.jsx` (248 lines) — AI-powered encounter generation modal
- `AddParticipantPanel.jsx` (224 lines) — Monster/NPC/Character participant addition form
- `EncountersPanel.jsx` (857 lines) — DM encounter management with imported sub-components

### Phase 8: server/src/ai/helpers.js — 1269→0 lines (DELETED → 12 modules)
Extracted to `server/src/ai/helpers/`:
- `index.js` (74 lines) — Barrel re-export of all 31 functions/constants
- `logging.js` (30 lines) — logAiResponse audit logger
- `formatting.js` (98 lines) — formatCreaturePromptList, formatEntityList, cleanText, stringifyEntries, cleanAiFieldOutput, stripAiJsonCodeFences, parseJsonArray
- `rag.js` (208 lines) — findRelevantRules, fetchCampaignWikiSnippet (RAG rules query + campaign context)
- `profiles.js` (52 lines) — buildNpcProfileContext, buildNpcRoleplaySystemPrompt, ASSIST_ACTIONS_REQUIRING_TEXT
- `assist.js` (129 lines) — buildAssistSystemPrompt, buildAssistUserMessage (AI assist prompt builders)
- `settings.js` (36 lines) — loadAiSettings (app_settings loader)
- `messages.js` (28 lines) — formatHistoryOpenAi, buildChatMessages (message builders)
- `session.js` (52 lines) — loadSessionAiContext (session AI context loader)
- `calls.js` (233 lines) — safeParseJsonResponse, performAiCall (HTTP AI calls, 6 providers)
- `streaming.js` (455 lines) — SSE helpers, 5 stream pump functions, performAiStreamTokens, performAiStream
- `generation.js` (45 lines) — streamGenerate (shared SSE generation pattern)

### Phase 9: server/src/ai/generation.js — 1059→39 lines (-96%)
Extracted to `server/src/ai/generation/`:
- `index.js` (39 lines) — Pure Express Router with 12 POST route definitions
- `handlers.js` (1069 lines) — All 12 handler functions (NPC, character, monster gen, sessions, text expansion, NPC interview)

Architecture: Express Router pattern — index.js imports handlers from `./handlers`, defines routes with `requireDm` middleware

## Verification
- LSP diagnostics: All clean (no errors/warnings)
- All 12 modules: Node.js require loads successfully (31 exports verified)
- All 5 consumer files: require("../ai/helpers") resolves correctly via index.js barrel
- Node -c syntax check: Passes on all 12 modules + 5 consumers
- No circular dependencies: DAG dependency graph
- No console.log/debug: Clean
- Total lines: 1440 (original helpers.js was 1269 — +171 from barrel + require imports)
- Phase 9: generation/index.js + handlers.js = 1108 lines (original 1059 — +49 from split structure)
