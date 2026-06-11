# Unit Test Record: URL-Driven Navigation — WikiPanel + Related Panels

## Target Files
1. `client/src/components/WikiPanel.jsx` - URL-driven article selection
2. `client/src/App.jsx` - All `:id` routes for wiki, map, encounters, settings, messages
3. `client/src/components/EncountersPanel.jsx` - URL-driven encounter selection
4. `client/src/components/MapPanel.jsx` - URL-driven map selection
5. `client/src/components/SettingsPanel.jsx` - URL-driven tab selection
6. `client/src/components/MessageHub.jsx` - Router hooks import
7. `client/src/components/map/useMapData.js` - initialMapId parameter

## Changes

### WikiPanel.jsx (+30 lines, 2 useEffects)
- Added `useParams`, `useLocation` imports (line 7)
- Added `const { id: routeArticleId } = useParams()` (line 38)
- Added `const location = useLocation()` (line 39)
- Effect 1 (lines 282-289): Sync `routeArticleId` → `selectedArticle`
  - Guards: `if (!routeArticleId) return;`
  - Finds article by ID in `articles` array
  - Skips if `article.id === selectedArticle?.id`
- Effect 2 (lines 291-306): Sync `selectedArticle` → URL for shareable links
  - Guards: `if (isPopout) return;`
  - Derives base path: strips trailing `/digits` from `location.pathname`
  - Guard: `if (location.pathname !== expected)` prevents infinite loop
  - Deselect: navigates to base path (with `!routeArticleId` guard)
  - Uses `{ replace: true }` to preserve back-button behavior

### App.jsx (+20 lines, 13 new routes)

| Route | Location | Line |
|-------|----------|------|
| `/dm/popout/map/:id` | Popout block | 564 |
| `/dm/popout/wiki/:id` | Popout block | 568 |
| `/dm/popout/encounters/:id` | Popout block | 574 |
| `/player/wiki/:id` | PlayerLayout | 1021 |
| `/player/encounters/:id` | PlayerLayout | 1025 |
| `/player/messages/session` | PlayerLayout | 1013 |
| `/player/messages/rules` | PlayerLayout | 1014 |
| `/player/messages/rules/:convId` | PlayerLayout | 1015 |
| `/player/messages/npc/:npcId` | PlayerLayout | 1016 |
| `/player/messages/npc/:npcId/:convId` | PlayerLayout | 1017 |
| `/dm/map/:id` | DmLayout | 1264 |
| `/dm/wiki/:id` | DmLayout | 1287 |
| `/dm/encounters/:id` | DmLayout | 1291 |
| `/dm/settings/:tab` | DmLayout | 1299 |
| `/dm/messages/session` | DmLayout | 1277 |
| `/dm/messages/rules` | DmLayout | 1278 |
| `/dm/messages/rules/:convId` | DmLayout | 1279 |
| `/dm/messages/npc/:npcId` | DmLayout | 1280 |
| `/dm/messages/npc/:npcId/:convId` | DmLayout | 1281 |

### EncountersPanel.jsx (+15 lines)
- Added `useNavigate`, `useParams`, `useLocation` imports
- Route-driven encounter fetch on mount (URL priority over localStorage)
- Effect to re-fetch on `routeEncounterId` change
- URL navigation on encounter click and back button

### MapPanel.jsx (+10 lines)
- Added `useParams`, `useNavigate` imports
- `routeMapId` passed as `initialMapId` to `useMapData`
- Map selector navigates to `/dm/map/:id`

### SettingsPanel.jsx (+10 lines)
- Replaced local state with URL param-driven tab
- Tab buttons navigate to `/dm/settings/:tab`
- Falls back to localStorage for `/dm/settings` (no tab)

### useMapData.js (+2 lines)
- Accepts `initialMapId` parameter
- Uses `initialMapId` instead of localStorage when provided

## Verification

### LSP Diagnostics
- WikiPanel.jsx: ✅ Clean
- App.jsx: ✅ Clean
- EncountersPanel.jsx: ✅ Clean
- MapPanel.jsx: ✅ Clean
- SettingsPanel.jsx: ✅ Clean
- useMapData.js: ✅ Clean
- Full project `*`: ✅ Clean

### Build
- Vite build: 1791 modules transformed, 6.51s, zero errors

### Code Quality
- ✅ No console.log/debug added
- ✅ No hardcoded secrets
- ✅ Infinite loop guard: `location.pathname !== expected`
- ✅ Popout guard: `if (isPopout) return;`
- ✅ `replace: true` preserves browser back-button behavior
- ✅ Route param takes priority over localStorage
- ✅ Pattern matches existing SessionsPanel implementation
- ✅ Article-not-found handled gracefully (no crash)

## Test Result
- Status: **pass**
- Session: ses_1483adcd8ffe
- Timestamp: 2026-06-11T19:22:00Z
