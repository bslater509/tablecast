# Sync Issues (Unresolved Only)

## SYNC-1
- Severity: HIGH
- Files: `settings/AiSetup.jsx` ↔ `utils/authHeaders.js`
- Problem: Line 5 import path `"../utils/authHeaders"` should be `"../../utils/authHeaders"`
- Fix: Rewrote AiSetup.jsx to accept authHeaders/jsonAuthHeaders as props — no longer imports authHeaders at all
- Status: ✅ RESOLVED

## SYNC-2
- Severity: HIGH
- Files: `SettingsPanel.jsx` ↔ `settings/BackupSettings.jsx`, `settings/AiSetup.jsx`
- Problem: SettingsPanel.jsx contained all inline backup/AI logic; components were dead code
- Fix: Rewrote SettingsPanel.jsx to import and render `<BackupSettings>` and `<AiSetup>`; removed all inline state, handlers, effects
- Status: ✅ RESOLVED

## SYNC-3
- Severity: MEDIUM
- Files: `SettingsPanel.jsx`
- Problem: SettingsPanel.jsx remained at 1766 lines
- Fix: SettingsPanel.jsx reduced to 70 lines (-1696, -96%)
- Status: ✅ RESOLVED
