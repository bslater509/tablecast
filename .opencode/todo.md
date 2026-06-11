# Mission: Split Large Source Files into Manageable Modules

## M1: Phase 1 — WikiPanel.jsx (4499 lines → wiki/ subdirectory)
### T1.1: Extract NpcStatblock component | agent:Worker
- [x] S1.1.1: Create wiki/NpcStatblock.jsx with NpcStatblock component + statblockStyles
- [x] S1.1.2: Update WikiPanel.jsx to import NpcStatblock from wiki/NpcStatblock.jsx
- [x] S1.1.3: Run LSP diagnostics to verify no errors

### T1.2: Extract styles constant | agent:Worker
- [x] S1.2.1: Create wiki/wikiStyles.js with the `styles` object
- [x] S1.2.2: Update WikiPanel.jsx to import from wikiStyles.js
- [x] S1.2.3: Run LSP diagnostics to verify no errors

### T1.3: Extract utility functions | agent:Worker
- [x] S1.3.1: Create wiki/wikiUtils.js with calculateModifier, buildImagePrompt, compileMarkdown, parse5eToolsAlignment
- [x] S1.3.2: Update WikiPanel.jsx to import from wikiUtils.js
- [x] S1.3.3: Run LSP diagnostics to verify no errors

### T1.4: Review Phase 1 | agent:Reviewer
- [x] S1.4.1: LSP diagnostics clean on all wiki/ modules and WikiPanel.jsx
- [x] S1.4.2: Verify build compiles without errors

## M2: Phase 2 — mcp-server.js (2249 lines → domain handlers)
### T2.1: Create handler structure | agent:Worker
- [x] S2.1.1: Create mcp/handlers/users.js with user tools
- [x] S2.1.2: Create mcp/handlers/characters.js with character tools
- [x] S2.1.3: Create mcp/handlers/npcs.js with NPC tools
- [x] S2.1.4: Create mcp/handlers/monsters.js with monster tools
- [x] S2.1.5: Create mcp/handlers/encounters.js with encounter tools
- [x] S2.1.6: Create mcp/handlers/sessions.js with session tools
- [x] S2.1.7: Create mcp/handlers/wiki.js with wiki tools
- [x] S2.1.8: Create mcp/handlers/reference.js with reference tools
- [x] S2.1.9: Create mcp/schemas.js with all tool schemas
  - [x] S2.1.9a: Create mcp/shared.js with shared helper functions
- [x] S2.1.10: Update mcp-server.js (154 lines) to import + register from handlers

### T2.2: Review Phase 2 | agent:Reviewer
- [x] S2.2.1: Run LSP diagnostics on mcp-server.js and all handlers
- [x] S2.2.2: Verify MCP server starts correctly (node -c syntax check)

## M3: Phase 3 — CharacterSheet.jsx (2616 lines → character/ subdirectory)
### T3.1: Extract style constants and utilities | agent:Worker
- [x] S3.1.1: Create character/characterStyles.js (803 lines)
- [x] S3.1.2: Create character/characterUtils.js (58 lines)

### T3.2: Extract sub-components | agent:Worker
- [x] S3.2.1: Create character/AbilityScoresPanel.jsx
- [x] S3.2.2: Create character/SkillsPanel.jsx
- [x] S3.2.3: Create character/AttacksPanel.jsx
- [x] S3.2.4: Create character/InventoryPanel.jsx
- [x] S3.2.5: Create character/SpellsPanel.jsx

### T3.3: Review Phase 3 | agent:Reviewer
- [x] S3.3.1: Run LSP diagnostics on all character/ modules
- [x] S3.3.2: Verify CharacterSheet renders and builds correctly

## M4: Phase 4 — SettingsPanel.jsx (2044 lines → settings/ subdirectory)
### T4.1: Extract styles and API helpers | agent:Worker
- [x] S4.1.1: Create settings/settingsStyles.js (342 lines)
- [x] S4.1.2: Create settings/settingsApi.js with 7 pure fetch functions (101 lines)
- [x] S4.1.3: Update SettingsPanel.jsx — imports, remove inline styles & fetch utils
- [x] S4.1.4: LSP diagnostics clean on all files

### T4.2: Extract sub-components | agent:Worker
- [x] S4.2.1: Create settings/BackupSettings.jsx (1265 lines, imports from settingsApi + settingsStyles)
- [x] S4.2.2: Create settings/AiSetup.jsx (254 lines, accepts authHeaders/jsonAuthHeaders as props)
- [x] S4.2.3: Update SettingsPanel.jsx to import and render BackupSettings and AiSetup

### T4.3: Review Phase 4 (Re-Verified) | agent:Worker
- [x] S4.3.1: LSP diagnostics clean on all 3 modified files (0 errors, 0 warnings)
- [x] S4.3.2: Vite build passes (1775 modules, 4.40s) — components now wired and active

## M5: Final Verification & Push
### T5.1: Full system check and deploy | agent:Worker
- [x] S5.1.1: Run LSP diagnostics on all modified files — clean (0 errors, 0 warnings)
- [x] S5.1.2: Run Vite build and verify zero errors — PASS (1775 modules, 4.40s)
- [x] S5.1.3: Git commit and push all changes — commit a973190 pushed to master

## M6: Phase 6 — EncountersPanel.jsx (1642 lines → encounters/ subdirectory)
### T6.1: Extract styles and helper functions
- [x] S6.1.1: Create encounters/encounterStyles.js (389 lines) — styles, hpColor, badgeColor
- [x] S6.1.2: Update EncountersPanel.jsx to import encounterStyles, hpColor, badgeColor
- [x] S6.1.3: Run LSP diagnostics — clean

### T6.2: Extract AiBuilderModal component
- [x] S6.2.1: Create encounters/AiBuilderModal.jsx (248 lines) — self-contained AI encounter builder modal
- [x] S6.2.2: Update EncountersPanel.jsx to import and render AiBuilderModal
- [x] S6.2.3: Run LSP diagnostics — clean

### T6.3: Extract AddParticipantPanel component
- [x] S6.3.1: Create encounters/AddParticipantPanel.jsx (224 lines) — self-contained add-participant form
- [x] S6.3.2: Update EncountersPanel.jsx to import and render AddParticipantPanel
- [x] S6.3.3: Run LSP diagnostics — clean

### T6.4: Review Phase 6 | agent:Reviewer
- [x] S6.4.1: LSP diagnostics clean on all 4 files (0 errors, 0 warnings)
- [x] S6.4.2: Vite build passes (1775 modules, 4.21s, zero errors)
- [x] S6.4.3: Verify modularity and code quality

## M7: Phase 7 — ChatPanel.jsx (1332 lines → chat/ subdirectory)
### T7.1: Extract chatUtils.js — pure helper functions
- [x] S7.1.1: Create chat/chatUtils.js (157 lines) — 13 helper functions: groupMessages, genGroupId, SENDER_COLORS, getSenderColor, getSenderInitial, parseDiceNotation, formatTime, formatDateLabel, getDateKey, mergeMessages, genTempId, EMOJI_LIST
- [x] S7.1.2: Update ChatPanel.jsx to import from chatUtils.js
- [x] S7.1.3: LSP diagnostics — clean

### T7.2: Extract chatStyles.js — styles object
- [x] S7.2.1: Create chat/chatStyles.js (120 lines) — full `chatStyles` object
- [x] S7.2.2: Update ChatPanel.jsx to import chatStyles from chat/chatStyles.js
- [x] S7.2.3: LSP diagnostics — clean

### T7.3: Extract EmojiPicker.jsx, CopyButton.jsx, DateSeparator.jsx
- [x] S7.3.1: Create chat/EmojiPicker.jsx (24 lines) — emoji grid picker
- [x] S7.3.2: Create chat/CopyButton.jsx (54 lines) — copy-to-clipboard with feedback
- [x] S7.3.3: Create chat/DateSeparator.jsx (13 lines) — date label between groups
- [x] S7.3.4: Update ChatPanel.jsx to import and render all 3 components
- [x] S7.3.5: LSP diagnostics — clean

### T7.4: Extract MessageBubble.jsx (327 lines)
- [x] S7.4.1: Create chat/MessageBubble.jsx (327 lines) — 5 message types: system, plain, roll, AI scholar, NPC roleplay
- [x] S7.4.2: Update ChatPanel.jsx to import and render MessageBubble
- [x] S7.4.3: LSP diagnostics — clean

### T7.5: Extract TypingIndicator.jsx, ScrollToBottomFAB.jsx
- [x] S7.5.1: Create chat/TypingIndicator.jsx (37 lines) — animated typing dots
- [x] S7.5.2: Create chat/ScrollToBottomFAB.jsx (14 lines) — FAB with unread badge
- [x] S7.5.3: Update ChatPanel.jsx to import and render both
- [x] S7.5.4: LSP diagnostics — clean

### T7.6: Rewrite ChatPanel.jsx — remaining logic stays in parent
- [x] S7.6.1: Remove inline styles (all → chatStyles), inline helpers (all → chatUtils), inline sub-components (all → separate files)
- [x] S7.6.2: Keep core state/handlers + import-based architecture
- [x] S7.6.3: LSP diagnostics — clean

### T7.7: LSP diagnostics + Vite build verification
- [x] S7.7.1: LSP diagnostics clean on all 9 chat/ files (0 errors, 0 warnings)
- [x] S7.7.2: Vite build passes (1787 modules, 4.24s, zero errors)

## M9: Phase 9 — server/src/ai/generation.js (1059 lines → generation/ subdirectory)
### T9.1: Split generation.js into router + handlers | agent:Worker
- [x] S9.1.1: Create generation/handlers.js (1069 lines) — all 12 handler functions extracted from generation.js
- [x] S9.1.2: Rewrite generation/index.js (39 lines) — pure Express Router with 12 POST route definitions
- [x] S9.1.3: Delete old generation.js after git mv preserves history
- [x] S9.1.4: Run LSP diagnostics — clean (0 errors, 0 warnings)
- [x] S9.1.5: Verify node -c syntax check passes on both files
- [x] S9.1.6: Verify require resolution — consumer routes/ai.js loads correctly

### T9.2: Review Phase 9 | agent:Reviewer
- [x] S9.2.1: LSP diagnostics clean on both generation/ files (0 errors, 0 warnings)
- [x] S9.2.2: node -c syntax check passes on both files
- [x] S9.2.3: All 12 handler functions exported and verified as async functions
- [x] S9.2.4: All 12 routes match original: npc-options, npc, char-options, char, monster-options, monster, build-encounter, encounter-description, session-recap, session-agenda, expand-text, npc-interview
- [x] S9.2.5: No console.log/debug statements found
- [x] S9.2.6: No behavioral changes — all logic, imports, error handling preserved
