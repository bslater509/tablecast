# Unit Test Record: localStorage State Persistence

## Target Files
1. `client/src/context/AiContext.jsx` - persist selectedNpcId, selectedCharId
2. `client/src/components/SettingsPanel.jsx` - persist activeSettingsTab
3. `client/src/components/DiceRollerPanel.jsx` - persist activeSubTab

## Changes

### AiContext.jsx (+11 lines)
- Added `SELECTED_NPC_STORAGE_KEY` and `SELECTED_CHAR_STORAGE_KEY` constants
- Lazy init `selectedNpcId` from `localStorage.getItem("tablecast.selectedNpcId")`
- Lazy init `selectedCharId` from `localStorage.getItem("tablecast.selectedCharId")`
- useEffect to persist `selectedNpcId` to localStorage on change
- useEffect to persist `selectedCharId` to localStorage on change

### SettingsPanel.jsx (+5 lines)
- Added `SETTINGS_TAB_STORAGE_KEY` constant
- Added `useEffect` import
- Lazy init `activeSettingsTab` from `localStorage.getItem("tablecast.settingsTab")`
- useEffect to persist `activeSettingsTab` to localStorage on change

### DiceRollerPanel.jsx (+6 lines)
- Added `DICE_ROLLER_TAB_STORAGE_KEY` constant
- Lazy init `activeSubTab` from `localStorage.getItem("tablecast.diceRollerTab")`
- useEffect to persist `activeSubTab` to localStorage on change

## Verification
- **LSP diagnostics**: Clean on all 3 files (0 errors, 0 warnings)
- **Full project LSP**: Clean across all files
- **Vite build**: 1791 modules transformed, built in 7.26s, zero errors
- **Server syntax**: `node -c` passes on index.js and mcp-server.js

## Test Result
- Status: pass
- Session: ses_N
- Timestamp: 2026-06-11T18:59:00Z
