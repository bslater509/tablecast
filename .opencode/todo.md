# Mission Tasks

## Phase 5: MCP server - optional userId
- [x] T5.1: Read mcp-server.js current state | verified
- [x] T5.2: Update create_character tool schema - make userId not required | verified
- [x] T5.3: Update create_character handler - make userId optional | verified
- [x] T5.4: Update character create data construction | verified
- [x] T5.5: Verify with node -c + LSP diagnostics + code quality | verified

## Phase 12: Docker Build + Deploy
- [x] T12.1: Push code to GitHub | completed
- [x] T12.2: Trigger webhook deployment | completed
- [x] T12.3: Verify server running after deploy | completed

## Auth Headers Refactor - Centralized auth via getAuthHeaders/getJsonAuthHeaders utility
- [x] T14.1: CharacterSheet.jsx - Replace hardcoded headers | verified
- [x] T14.2: CharacterList.jsx - Replace hardcoded headers | verified
- [x] T14.3: MessageHub.jsx - Replace hardcoded headers | verified
- [x] T14.4: useMapData.js - Replace hardcoded headers | verified
- [x] T14.5: AiAssistButton.jsx - Replace hardcoded headers | verified
- [x] T14.6: AiContext.jsx - Replace hardcoded headers | verified
- [x] T14.7: useAiChat.js - Replace hardcoded headers | verified
- [x] T14.8: useConversations.js - Replace hardcoded headers | verified
- [x] T14.9: aiStream.js - Replace hardcoded headers | verified
- [x] T14.10: EncountersPanel.jsx - Replace hardcoded headers | verified
- [x] T14.11: SessionsPanel.jsx - Replace hardcoded headers | verified
- [x] T14.12: SettingsPanel.jsx - Replace hardcoded headers | verified
- [x] T14.13: WikiPanel.jsx - Replace hardcoded headers | verified
- [x] T14.14: ImporterPanel.jsx - Replace hardcoded headers | verified
- [x] T14.15: LSP diagnostics + Build verification | verified

## Final System Verification
- [x] T13.1: Verify all live endpoints | PASS (see report below)
- [x] T13.2: Code quality checks (LSP, syntax, security) | PASS
- [x] T13.3: Git state verified (no uncommitted changes beyond .opencode/) | PASS
