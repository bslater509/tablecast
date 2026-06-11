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
- [ ] S4.2.1: Create settings/BackupSettings.jsx
- [ ] S4.2.2: Create settings/AiSetup.jsx
- [ ] S4.2.3: Update SettingsPanel.jsx to import sub-components

### T4.3: Review Phase 4 | agent:Reviewer
- [ ] S4.3.1: Run LSP diagnostics on all settings/ modules
- [ ] S4.3.2: Run Vite build to verify compilation

## M5: Final Verification & Push
### T5.1: Full system check and deploy | agent:Reviewer
- [ ] S5.1.1: Run LSP diagnostics on all modified files
- [ ] S5.1.2: Run Vite build and verify zero errors
- [ ] S5.1.3: Git commit and push all changes
