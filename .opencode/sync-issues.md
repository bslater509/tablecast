# Sync Issues (Unresolved Only)

## SYNC-1: Duplicate route mount in index.js
- **Severity:** HIGH
- **Files:** `server/src/index.js` ↔ `server/src/routes/encounter-templates.js`
- **Problem:** Route `encounter-templates` mounted twice — lines 254 and 256 both call `app.use("/api/encounter-templates", ...)`.
- **Fix:** Remove line 256 (`app.use("/api/encounter-templates", require("./routes/encounter-templates"));`) — line 254 already mounts using the `encounterTemplatesRouter` variable (line 217).
- **Status:** pending

## SYNC-2: Missing unit tests for encounter-templates route
- **Severity:** MEDIUM
- **Files:** `server/src/routes/encounter-templates.js`
- **Problem:** No unit tests exist for the Express route module. MCP handler has tests but the route module does not.
- **Fix:** Create route-level tests covering GET list, GET by id, POST (create), PUT (update), DELETE, POST (apply) — valid and invalid inputs, auth, not-found cases.
- **Status:** pending

## SYNC-3: features.md §4.4 status not updated
- **Severity:** LOW
- **Files:** `features.md` (line 657)
- **Problem:** §4.4 still shows `- [ ] **Status:** Planned` — should be `[x]` Implemented since the model, backend route, MCP tools, and frontend component exist.
- **Fix:** Change line 657 to `- [x] **Status:** Implemented`
- **Status:** pending
