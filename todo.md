# Tablecast — Issue Remediation Checklist

Track remediation progress for known issues identified in the repo audit (June 2026).
Mark items complete by changing `[ ]` to `[x]`.

**Legend:** 🔴 Critical/High · 🟠 Medium · 🟡 Low · ℹ️ Info/By design

**Staging server:** `http://192.168.0.77:3001` · **Health:** `GET /api/health`

---

## How to use this file

1. Work top-to-bottom within each section (highest impact first).
2. When fixing an item, add a one-line note under it: `**Fixed:** <date> — <brief note>`.
3. If an item is intentionally deferred, mark `[~]` and add `**Deferred:** <reason>`.
4. Do not edit the `5etoolssrc/` or `5etoolsimg/` submodules for any item in this list.

---

## 1. Backend — Security & Auth

### 1.1 High priority

- [x] **🔴 Debug endpoints are public (docs say DM-only)**
  - **Files:** `server/src/routes/debug.js` (lines 12, 20–153)
  - **Routes affected:**
    - `GET /api/debug` — server uptime, memory, PID, DB status, entity counts, reference cache, SSE transport count
    - `GET /api/debug/mcp-logs` — MCP tool call audit trail with `arguments` and `result` JSON
    - `GET /api/debug/ai-logs` — LLM prompts (up to 5k chars) and raw replies (up to 10k chars)
  - **Problem:** `requireDm` is imported but never applied to any route. Any LAN client can read sensitive debug data.
  - **Expected:** Per `AGENTS.md`, all three endpoints require DM auth via `x-tablecast-user-id: 1`.
  - **Fix:** Add `requireDm` middleware to each route handler.
  - **Fixed:** Jun 8 2026 — Added `requireDm` to all 3 GET routes.

- [x] **🔴 MCP HTTP transport is fully unauthenticated**
  - **Files:** `server/src/routes/ai.js` (approx. lines 55–116)
  - **Routes affected:**
    - `GET /api/ai/mcp` — opens SSE MCP session
    - `POST /api/ai/mcp/message?sessionId=...` — handles JSON-RPC tool invocations
  - **Problem:** Any LAN client can invoke all ~30 MCP tools (full CRUD on users, characters, NPCs, wiki, encounters, sessions, etc.).
  - **Fix:** Require DM auth on MCP session creation and message handling; reject unauthenticated sessions.
  - **Fixed:** Jun 8 2026 — Added `requireDm` to GET /mcp and POST /mcp/message.

- [x] **🔴 Socket.io has no connection or identity verification**
  - **File:** `server/src/socket.js` (lines 15–558)
  - **Problem:** No handshake auth. All authorization uses client-supplied `payload.userId` via `isDmUser()`. Any client can claim `userId: 1` (DM) and perform DM socket actions:
    - `token:create`, `token:delete`
    - `fog:update`
    - `map:select`, `map:delete`
    - `encounter:refresh`, `encounter:turn`
  - **`chat:send`:** Accepts arbitrary `sender` / `userId` with no verification.
  - **Fix:** Bind socket identity to verified `x-tablecast-user-id` at connection time (handshake auth or post-connect token exchange). Reject DM actions unless verified DM.
  - **Fixed:** Jun 8 2026 — Added `io.use()` auth middleware → `socket.data.user` from handshake. All DM handlers use `socket.data.user?.role` instead of `isDmUser(payload.userId)`. `chat:send` uses `socket.data.user?.id`.

- [x] **🔴 Socket AI commands trigger LLM without authentication**
  - **File:** `server/src/socket.js` (approx. lines 78–276)
  - **Problem:** `/ai` and `/roleplay` chat commands run for any connected socket. No check that `message.userId` is valid or authorized. Unauthenticated sockets can trigger `performAiStreamTokens()` if AI is configured.
  - **Fix:** Verify user exists and is allowed to use AI before processing socket AI commands.
  - **Fixed:** Jun 8 2026 — `userObj` now comes from `socket.data.user` (auth middleware) instead of separate DB lookup. Unauthenticated sockets get `null`.

- [x] **🔴 Character sheets readable without auth**
  - **File:** `server/src/routes/characters.js`
  - **Routes affected:**
    - `GET /api/characters` (lines 57–79) — returns all characters (optional `?userId=N`) with owner info, inventory, modifiers, spells
    - `GET /api/characters/:id` (lines 84–105) — full single character sheet
  - **Problem:** Read endpoints have no auth. Mutations (POST/PUT/DELETE) correctly check auth.
  - **Fix:** Restrict reads to: (a) the character owner, (b) DM, or (c) require auth header for any read. Consider hiding `inventory`/`modifiers` from non-owners.
  - **Fixed:** Jun 8 2026 — GET list: auth required, DM sees all, non-DM sees own only. GET by ID: owner or DM only. Sensitive fields stripped for non-owners.

- [x] **🔴 Draft encounters and fog-of-war leak to non-DMs**
  - **File:** `server/src/routes/encounters.js`
  - **Problem:**
    - `includeEncounter()` always includes `map: true` (with `fogState`)
    - `shapeEncounter()` filters hidden **participants** only; map/fog unchanged
    - `GET /api/encounters/:id` (lines 287–294) does **not** restrict by `status` for non-DMs
    - List endpoints correctly filter (`GET /` line 191, `GET /active` line 170)
  - **Impact:** Players can access DRAFT/COMPLETE encounters and full fog state via direct ID.
  - **Fix:** For non-DM requests on `GET /:id`: return 404 if status ≠ `ACTIVE`; strip or omit `map.fogState` for players.
  - **Fixed:** Jun 8 2026 — `respondEncounter` returns 404 for non-DM when status ≠ ACTIVE. `shapeEncounter` strips `map.fogState` for non-DM.

- [x] **🔴 Hidden NPC data exfiltration via AI roleplay**
  - **File:** `server/src/routes/ai.js` (approx. lines 2264–2368, 349–360)
  - **Problem:** `POST /api/ai/chat` with `npcId` loads any NPC by ID with no `isVisibleToPlayers` check. `buildNpcRoleplaySystemPrompt()` injects full profile (history, personality, inventory, actions) into LLM context.
  - **Impact:** Players can extract DM-only NPC content through AI chat.
  - **Fix:** Reject `npcId` for non-DM users when `isVisibleToPlayers === false`. Apply same rule to socket `/roleplay` commands.
  - **Fixed:** Jun 8 2026 — NPC visibility check in `POST /api/ai/chat` (ai.js) and socket `/roleplay` handler. Hidden NPCs return 403 / system message for non-DM.

### 1.2 Medium priority

- [ ] **🟠 Header auth is trivially spoofable (systemic)**
  - **File:** `server/src/auth.js` (lines 8–46)
  - **Problem:** `x-tablecast-user-id` is trusted if the user exists in DB. No session, signature, or client binding.
  - **Context:** Documented as acceptable on trusted LAN per `AGENTS.md`. Becomes a real risk on shared/guest Wi-Fi.
  - **Fix (optional):** Session tokens, signed cookies, or pairing codes for player devices.

- [x] **🟠 AI conversation endpoints — weak header check, no DB validation**
  - **File:** `server/src/routes/ai.js` (approx. lines 2404–2550)
  - **Problem:**
    - Only checks `req.headers["x-tablecast-user-id"]` exists; no `getRequestUser()` / existence check
    - `Number(userId)` can be `NaN` → odd Prisma behavior
    - Impersonation: set header to another user's ID to list/read/delete their conversations
  - **Fix:** Use `getRequestUser()` on all conversation routes; return 401 if user invalid.
  - **Fixed:** Jun 8 2026 — All 6 conversation CRUD endpoints switched to `getRequestUser()` with proper auth checks.

- [x] **🟠 AI chat — conversation hijack and cross-character access**
  - **File:** `server/src/routes/ai.js` (approx. lines 2319–2368, 2272–2286)
  - **Problem:**
    - `conversationId`: auto-saves messages without verifying conversation belongs to request user
    - `characterId`: loads any character with no ownership check
  - **Fix:** Verify `conversation.userId === req.user.id` before read/write. Verify character ownership or DM role for `characterId`.
  - **Fixed:** Jun 8 2026 — Ownership checks on auto-save and characterId injection.

- [x] **🟠 Unauthenticated user registration and enumeration**
  - **File:** `server/src/routes/users.js`
  - **Routes:**
    - `POST /api/users` (lines 98–126) — no auth; unlimited PLAYER account creation
    - `GET /api/users` (lines 23–56) — no auth; lists all `id`, `username`, `role`
  - **Mitigation in place:** Role escalation to DM is blocked (lines 106–108, 156–158).
  - **Fix:** Require DM for `POST`; or rate-limit + captcha. Restrict `GET` to authenticated users or DM only.
  - **Fixed:** Jun 8 2026 — `requireDm` on POST /api/users (PLAYER creation requires DM).

- [x] **🟠 Chat and roll history fully public**
  - **Files:**
    - `server/src/routes/chat.js` (lines 18–51) — `GET /api/chat` no auth
    - `server/src/routes/rolls.js` (lines 18–31) — `GET /api/rolls` no auth
    - `server/src/socket.js` (lines 29–71) — anyone can inject messages/rolls with forged identity
  - **Fix:** Require auth for history reads; bind socket messages to verified user ID.
  - **Fixed:** Jun 8 2026 — `getRequestUser()` on GET /api/chat and GET /api/rolls. Socket messages bound to `socket.data.user?.id`.

- [x] **🟠 Backup OAuth callback — loose `postMessage` origin**
  - **File:** `server/src/routes/backup.js` (lines 139–141, 171–292)
  - **Problem:** `GET /api/backup/oauth-callback` is public (required for OAuth). If `Origin`/`Referer` missing, `clientOrigin` falls back to `"*"` and `postMessage` uses that — weak origin validation.
  - **Fix:** Never use `"*"` as target origin; use configured app origin or reject missing Origin.
  - **Fixed:** Jun 8 2026 — Returns 400 if Origin/Referer missing instead of falling back to `"*"`.

- [x] **🟠 Reference sync status/settings readable without auth**
  - **File:** `server/src/routes/reference.js`
  - **Routes:**
    - `GET /api/reference/status` (lines 125–134) — repo/sync state
    - `GET /api/reference/settings` (lines 139–148) — allowed source books
  - **Note:** Write/sync/import correctly use `requireDm`.
  - **Fix:** Add `requireDm` or return minimal public status only.
  - **Fixed:** Jun 8 2026 — `requireDm` on GET /api/reference/status and GET /api/reference/settings.

- [x] **🟠 Map upload — no decoded-size cap or content validation**
  - **File:** `server/src/routes/maps.js` (lines 83–101)
  - **Problem:**
    - Base64 `imageData` decoded and written with no per-file size limit beyond global `express.json({ limit: "50mb" })` in `server/src/index.js` line 77
    - No magic-byte / MIME verification after decode
    - `imageUrl` allows any `http(s)://` URL (lines 108–115) — SSRF risk if server ever fetches URLs
  - **Fix:** Cap decoded image size (e.g. 10MB); validate image magic bytes; restrict `imageUrl` to `/uploads/` paths or allowlist.
  - **Fixed:** Jun 8 2026 — 10MB decoded size cap + magic byte validation (PNG/JPEG/WEBP/GIF).

- [x] **🟠 `imageUrl` path validation allows traversal-like stored paths**
  - **File:** `server/src/routes/maps.js` (lines 107–115)
  - **Problem:** Paths like `/uploads/../../../something` pass `startsWith("/uploads/")` validation.
  - **Fix:** Normalize with `path.resolve` + verify result stays under uploads root.
  - **Fixed:** Jun 8 2026 — `path.resolve` + prefix check vs `path.join`.

- [x] **🟠 `copyReferenceImage` — path join without traversal guard**
  - **File:** `server/src/routes/reference.js` (lines 437–476)
  - **Risk:** Low today (inputs from internal lookup); fragile if inputs widen.
  - **Fix:** Resolve absolute path and assert it starts with `root`.
  - **Fixed:** Jun 8 2026 — `path.resolve` + prefix check added.

### 1.3 Low priority — input validation

- [ ] **🟡 Character numeric fields not range-checked**
  - **File:** `server/src/routes/characters.js` (lines 146–157, 202–210)
  - **Fields:** `level`, ability scores, `hp` — no min/max validation.

- [ ] **🟡 NPC/monster `imageUrl` / `largeImageUrl` accept arbitrary strings**
  - **Files:** `server/src/routes/npcs.js`, `server/src/routes/monsters.js`
  - **Fix:** Validate URL format or restrict to `/uploads/` and known CDN patterns.

- [ ] **🟡 Map token `stats` stored without JSON validation**
  - **File:** `server/src/routes/maps.js` (lines 192–199)

- [ ] **🟡 Encounter `PATCH /:id` — no state-machine rules**
  - **File:** `server/src/routes/encounters.js` (lines 296–310)
  - **Problem:** Partial status changes allowed without validating transitions (e.g. DRAFT → COMPLETE).

- [ ] **🟡 User `diceTheme` / `diceColor` — no length/format limits**
  - **File:** `server/src/routes/users.js` (lines 161–164)

- [ ] **🟡 Wiki `content` unbounded on update**
  - **File:** `server/src/routes/wiki.js` (lines 159–161)

- [ ] **🟡 Encounter participant delete — missing ID validation**
  - **File:** `server/src/routes/encounters.js` (lines 274–285)
  - **Problem:** `Number(req.params.id)` not validated before delete; can throw Prisma errors → 500.

- [x] **🟡 AI conversation batch messages — no size limits**
  - **File:** `server/src/routes/ai.js` (lines 2504–2549)
  - **Problem:** No cap on `messages.length` or per-message `text` length.
  - **Fixed:** Jun 8 2026 — Max 50 messages per batch, per-message 10k chars, role validation.

- [x] **🟡 `POST /api/ai/conversations/:id/messages` — unvalidated `role` / `text`**
  - **File:** `server/src/routes/ai.js` (lines 2519–2528)
  - **Problem:** `role` defaults to `"user"` with no enum check; `text` unbounded.
  - **Fixed:** Jun 8 2026 — Part of batch limits fix above.

### 1.4 Backend — positive findings (no action needed)

- [ℹ️] **SQL injection:** No issues found. Prisma parameterized queries throughout.
- [ℹ️] **Unhandled promise rejections:** Most route handlers wrapped in try/catch. No systemic pattern found.
- [ℹ️] **Correctly protected DM routes:** Maps/tokens CRUD, NPC/monster/wiki mutations, sessions mutations, backup (except OAuth callback), encounter mutations, AI generation/settings/test/debug, reference sync/import.

---

## 2. Frontend — Bugs & Reliability

### 2.1 High priority (user-visible)

- [ ] **🔴 Saved AI conversations don't load**
  - **Files:** `client/src/components/AiChatView.jsx` (lines 168–175), `client/src/hooks/useAiChat.js` (lines 27–34)
  - **Problem:** `conversationId` is passed to `useAiChat` but the hook never fetches `GET /api/ai/conversations/:id`. Opening a saved Rules/NPC thread shows only the default greeting or empty state.
  - **Fix:** Add `useEffect` in `useAiChat` to load messages when `initialConversationId` is set.

- [ ] **🔴 MapPanel fetch race condition**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 201–226)
  - **Problem:** `fetchMapDetails(mapId)` has no request sequencing. Rapid map switches let a slower older response overwrite the currently selected map, tokens, and image.
  - **Fix:** AbortController or monotonic request ID; ignore stale responses.

- [ ] **🔴 MapPanel image load race condition**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 211–217)
  - **Problem:** Map `Image.onload` has no map-ID guard. Stale image load can set `imageRef.current`, call `resetViewport`, and show wrong map.
  - **Fix:** Capture `mapId` at load start; ignore `onload` if `mapId` changed.

- [ ] **🔴 No socket state resync after reconnect**
  - **File:** `client/src/context/SocketContext.jsx`
  - **Problem:** No `reconnect` / post-connect state resync. After disconnect, missed `chat:message`, `token:moved`, `fog:updated`, etc. are never replayed.
  - **Fix:** On reconnect, refetch active map, tokens, fog, chat tail, and active encounter.

- [ ] **🔴 Chat messages stuck at "sending" when offline**
  - **File:** `client/src/components/ChatPanel.jsx` (approx. lines 774–870, 862–870)
  - **Problem:** `sendMessage` checks `socket` but not `isConnected`. Optimistic messages added; if offline, socket ack never arrives and status stays `"sending"`. No error/timeout handling.
  - **Fix:** Check `isConnected`; set failed status on timeout or `connect_error`.

- [ ] **🔴 Stale `selectedTokenId` on token delete via socket**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 302–377, 323–325)
  - **Problem:** `handleTokenDeleted` reads `selectedTokenId` from stale closure (`useEffect` deps only `[socket]`). Deleting selected token via socket may leave selection UI stuck.
  - **Fix:** Use ref for `selectedTokenId` or add to effect dependencies.

- [ ] **🔴 MapPanel pointer-move triggers full canvas redraw**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 757–759, 627–639)
  - **Problem:** `handleMove` always calls `setMousePosWorld` on every pointer move. That state is in canvas `useEffect` dependency array → full redraw on every mouse/touch move, even when not drawing fog.
  - **Fix:** Store mouse position in ref; only `setState` when needed for fog drawing.

- [ ] **🔴 Canvas render loop not throttled**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 382–627)
  - **Problem:** Canvas render runs synchronously inside `useEffect` with no `requestAnimationFrame` throttling. Pan/zoom/drag causes expensive full redraws per frame.
  - **Fix:** Use `requestAnimationFrame` batching for draw calls.

### 2.2 Medium priority

- [ ] **🟠 `useAiChat` — no unmount cleanup for SSE stream**
  - **File:** `client/src/hooks/useAiChat.js`
  - **Problem:** In-flight SSE stream continues after unmount; still calls `setMessages` / `setStreaming` via `onToken`.
  - **Fix:** Abort stream in `useEffect` cleanup; guard `onToken` with mounted ref.

- [ ] **🟠 `useAiChat` — `conversationId` from auto-save may never be captured**
  - **File:** `client/src/hooks/useAiChat.js` (lines 89–92)
  - **Problem:** `streamAiChat` returns a string, but code checks `fullText.conversationId` on an object.
  - **Fix:** Align `streamAiChat` return type with consumer expectations.

- [ ] **🟠 AiPanel — stale conversation on NPC switch**
  - **File:** `client/src/components/AiPanel.jsx` (approx. lines 229–235)
  - **Problem:** Changing `selectedNpcId` calls `npcChat.setConversationId(undefined)` but does not clear/reload NPC messages.
  - **Fix:** Clear messages and reload conversation list on NPC change.

- [ ] **🟠 AiPanel — stale closure in `useEffect` deps**
  - **File:** `client/src/components/AiPanel.jsx` (approx. lines 140–152)
  - **Problem:** `useEffect` hooks call `loadConversationList()` but omit it (and `currentRulesConvId` / `currentNpcConvId`) from dependency arrays.

- [ ] **🟠 AiPanel / MapPanel / Autocomplete — async fetch race conditions**
  - **Files:**
    - `client/src/components/AiPanel.jsx` (approx. lines 157–221) — NPC, settings, character, conversation fetches
    - `client/src/components/MapPanel.jsx` (approx. lines 127–199) — parallel loads on mount
    - `client/src/components/Autocomplete.jsx` (approx. lines 47–85, 61–68)
  - **Fix:** AbortController or cancelled flags on all fetches.

- [ ] **🟠 Autocomplete — fetches entire monster bestiary per query**
  - **File:** `client/src/components/Autocomplete.jsx` (approx. lines 61–68)
  - **Problem:** For `category === "monsters"`, each debounced keystroke fetches `GET /api/monsters` with no deduplication or server-side search.
  - **Fix:** Add `GET /api/monsters?search=` with limit, or cache bestiary client-side.

- [ ] **🟠 EncountersPanel — full list refetch on every socket event**
  - **File:** `client/src/components/EncountersPanel.jsx` (approx. lines 199–207)
  - **Problem:** Every `encounter:updated` / `encounter:turnChanged` refetches entire encounter list.
  - **Fix:** Patch single encounter in local state from event payload.

- [ ] **🟠 Token move offline/local divergence**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 808–818)
  - **Problem:** Token moves fall back to local state when offline; no merge/reconcile on reconnect.
  - **Fix:** On reconnect, refetch tokens for active map and reconcile positions.

- [ ] **🟠 Chat auto-scroll ignores streaming AI updates**
  - **File:** `client/src/components/ChatPanel.jsx` (approx. lines 735–750)
  - **Problem:** Auto-scroll effect depends on `messages.length` only. Streaming `chat:message:update` edits do not trigger scroll when user is near bottom.
  - **Fix:** Also depend on last message `text` length or streaming flag.

- [ ] **🟠 `compileMarkdown` XSS fallback — unsanitized raw text**
  - **Files:**
    - `client/src/components/ChatPanel.jsx` (lines 20–27)
    - `client/src/components/AiPanel.jsx` (lines 14–21)
    - `client/src/components/AiChatView.jsx` (lines 16–23)
  - **Problem:** On parse failure, catch block returns raw `text` into `dangerouslySetInnerHTML`, bypassing DOMPurify.
  - **Fix:** Return `DOMPurify.sanitize(text)` or static error HTML in catch block.

- [ ] **🟠 Single top-level ErrorBoundary — whole app crashes on panel error**
  - **Files:** `client/src/App.jsx` (approx. lines 291, 382), `client/src/components/ErrorBoundary.jsx`
  - **Problem:** Only one `ErrorBoundary` with `critical={true}`. Non-critical inline fallback (`critical={false}`) is implemented but never used.
  - **Fix:** Wrap MapPanel, WikiPanel, CharacterSheet, ChatPanel in per-panel boundaries.

- [ ] **🟠 Message list uses array index as React key**
  - **File:** `client/src/components/AiChatView.jsx` (approx. lines 243–244)
  - **Problem:** `key={i}` breaks reconciliation on prepend/reorder.
  - **Fix:** Use stable message IDs from server or generate client-side UUIDs.

### 2.3 Low priority

- [ ] **🟡 MapPanel token image cache never evicts**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 577–586)
  - **Problem:** `tokenImagesRef` caches `Image` objects per token ID; orphaned entries accumulate when tokens deleted or maps change.

- [ ] **🟡 MapPanel — new `Image()` created inside draw loop**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 579–586)
  - **Problem:** Cache miss creates `Image()` in draw loop; `onload` calls local `draw()` directly, bypassing React scheduling.

- [ ] **🟡 Autocomplete debounce not cleared on unmount**
  - **File:** `client/src/components/Autocomplete.jsx` (approx. lines 47–85)

- [ ] **🟡 DiceBoxContext — no mounted guard during async init**
  - **File:** `client/src/context/DiceBoxContext.jsx` (approx. lines 78–124)

- [ ] **🟡 WikiPanel — setTimeout calls lack unmount cleanup**
  - **File:** `client/src/components/WikiPanel.jsx` (approx. lines 837, 857, 1547)

- [ ] **🟡 ChatPanel NPC fetch — no cancelled flag**
  - **File:** `client/src/components/ChatPanel.jsx` (approx. lines 636–649)

- [ ] **🟡 ChatPanel — overlapping pagination requests**
  - **File:** `client/src/components/ChatPanel.jsx` (approx. lines 682–698)

- [ ] **🟡 MessageHub — unread counter under-counts bursty messages**
  - **File:** `client/src/components/MessageHub.jsx` (approx. lines 210–214)

- [ ] **🟡 SocketContext — no `reconnect_failed` handler**
  - **File:** `client/src/context/SocketContext.jsx` (approx. lines 39–45)

- [ ] **🟡 Chat history — no virtualization for long histories**
  - **File:** `client/src/components/ChatPanel.jsx` (approx. lines 20–63, 771)

### 2.4 Accessibility

- [ ] **🟠 VTT canvas inaccessible to keyboard/screen readers**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 1772–1783)
  - **Problem:** `<canvas>` has no `role`, `aria-label`, keyboard handlers, or focus management.

- [ ] **🟡 Connection status not announced to screen readers**
  - **Files:** `client/src/App.jsx` (approx. lines 387–401), `client/src/components/ChatPanel.jsx` (approx. lines 997–1004)
  - **Fix:** Add `aria-live="polite"` region for Offline/Reconnecting states.

- [ ] **🟡 Bottom nav lacks `aria-current` for active tab**
  - **File:** `client/src/App.jsx` (approx. lines 840–920)

- [ ] **🟡 Map selector `<select>` has no label**
  - **File:** `client/src/components/MapPanel.jsx` (approx. lines 1720–1725)

- [ ] **🟡 AI avatars — decorative images without accessible names**
  - **Files:** `client/src/components/AiChatView.jsx` (approx. line 207), `client/src/components/ConversationList.jsx` (approx. line 61)

### 2.5 Technical debt

- [ ] **🟠 Split `MapPanel.jsx` (~3,760 lines, ~40 `useState` calls)**
  - **File:** `client/src/components/MapPanel.jsx`
  - **Problem:** Monolithic component: canvas, fog, encounters, AI builder, modals, socket logic in one file. Any state change can trigger large re-renders.
  - **Suggested split:** `MapCanvas`, `MapToolbar`, `TokenManager`, `FogEditor`, `EncounterOverlay`, `MapModals`.

### 2.6 Frontend — positive findings

- [ℹ️] `SocketContext.jsx` properly registers/unregisters listeners and disconnects on cleanup.
- [ℹ️] `ChatPanel` initial history load and `MessageHub` / `App` user load use `cancelled` flags.
- [ℹ️] Most `dangerouslySetInnerHTML` usage goes through DOMPurify on the happy path.
- [ℹ️] `DiceBoxContext` clears roll-completion timeout on unmount.

---

## 3. Infrastructure & Operations

### 3.1 High priority

- [ ] **🔴 Live SQLite hot-copy during backup**
  - **File:** `server/src/utils/backup.js` (lines 62–80)
  - **Problem:** `createBackupZip()` copies the `.db` file while the server is writing. No `PRAGMA wal_checkpoint` or `sqlite3 .backup` command.
  - **Risk:** Corrupt or inconsistent backups under write load.
  - **Fix:** Run `PRAGMA wal_checkpoint(FULL)` then use SQLite `.backup` API or `sqlite3 .backup` before archiving.

- [ ] **🔴 Local backups not persisted across container restarts**
  - **Files:** `docker-compose.yml`, `.dockerignore` (line 42), `server/src/utils/backup.js`
  - **Problem:** `server/backups/` is created in container filesystem but not a Docker volume. All local zips lost on container recreate.
  - **Fix:** Add `tablecast-backups` volume mounted to `server/backups/`.

- [ ] **🔴 Docker container runs as root**
  - **File:** `Dockerfile` (runtime stage)
  - **Problem:** No `USER` directive. Compromise grants root inside container.
  - **Fix:** Create non-root user; `chown` data dirs; add `USER node` or dedicated app user.

- [ ] **🔴 OAuth/rclone secrets stored in plaintext**
  - **Files:** `server/src/utils/backup.js`, `server/src/routes/backup.js`, `app_settings` table, `server/prisma/data/rclone.conf`
  - **Problem:** `rclone.config` (client_id, client_secret, refresh tokens) saved in SQLite and written to disk on DB volume.
  - **Context:** Acceptable on trusted LAN for convenience; document risk.
  - **Fix (optional):** Encrypt at rest; env-var injection for secrets; restrict `GET /api/backup/config` response fields.

### 3.2 Medium priority

- [ ] **🟠 `DATABASE_URL` not validated at startup**
  - **Files:** `server/src/index.js`, `server/prisma/schema.prisma`, `docker-entrypoint.sh`
  - **Problem:** Server starts without `DATABASE_URL`; Prisma CLI fails at runtime with `P1012`.
  - **Fix:** Fail fast in `index.js` and entrypoint if `DATABASE_URL` missing.

- [ ] **🟠 No `.env.example`**
  - **Problem:** No documented env contract for `DATABASE_URL`, `LOG_LEVEL`, `RCLONE_REMOTE`, `REFERENCE_SYNC_ON_STARTUP`, `FIVE_E_TOOLS_*`, `DEBUG`.
  - **Fix:** Add `.env.example` at repo root with comments.

- [ ] **🟠 No seed on container startup**
  - **File:** `docker-entrypoint.sh`
  - **Problem:** Runs only `prisma migrate deploy`. Fresh deploy has empty DB (no default DM user) unless seed run manually.
  - **Fix:** Run `prisma db seed` on first boot or document required manual seed step.

- [ ] **🟠 `GameSession.wikiLogId` has no foreign key**
  - **File:** `server/prisma/schema.prisma` — `GameSession.wikiLogId`
  - **Problem:** Deleting a `WikiArticle` leaves dangling `wikiLogId` references.
  - **Fix:** Add FK to `WikiArticle` with `onDelete: SetNull`.

- [ ] **🟠 `GameSession` JSON link arrays lack referential integrity**
  - **File:** `server/prisma/schema.prisma` — `linkedWikiIds`, `linkedMapIds`, `linkedEncounterIds`
  - **Problem:** Can reference deleted entities with no validation.

- [ ] **🟠 `Roll` table missing index on `createdAt`**
  - **Files:** `server/prisma/schema.prisma`, `server/src/routes/rolls.js`
  - **Problem:** `orderBy: { createdAt: "desc" }` causes full table scan as history grows.
  - **Fix:** Add `@@index([createdAt])` migration.

- [ ] **🟠 Docker — no security hardening in compose**
  - **File:** `docker-compose.yml`
  - **Missing:** `read_only`, `security_opt: no-new-privileges`, `cap_drop`, non-root user.

- [ ] **🟠 Docker — `git` installed in production image**
  - **File:** `Dockerfile` (lines 23–24)
  - **Problem:** Unnecessary attack surface unless runtime git ops are required.

- [ ] **🟠 Docker — 512MB memory limit may OOM**
  - **File:** `docker-compose.yml` (lines 10–11)
  - **Risk:** During zip backup of large uploads, AI workloads, or Socket.io spikes.

- [ ] **🟠 OAuth state stored in in-memory `Map`**
  - **File:** `server/src/routes/backup.js` (line 24)
  - **Problem:** Lost on container restart; breaks in-flight OAuth; not shared across replicas.

- [ ] **🟠 `GET /api/backup/config` returns full rclone config including secrets**
  - **File:** `server/src/routes/backup.js` (lines 39–51)
  - **Context:** Required for settings UI on LAN; high sensitivity.

- [ ] **🟠 No scheduled/automatic backups**
  - **File:** `server/src/routes/backup.js`
  - **Problem:** Backup is manual DM trigger only.

- [ ] **🟠 `prisma` CLI fragile after `npm prune --omit=dev`**
  - **Files:** `Dockerfile` (line 34), `docker-entrypoint.sh`
  - **Problem:** Startup depends on `npx prisma migrate deploy`; may require network fetch if CLI not bundled.

- [ ] **🟠 Audit/log tables grow unbounded**
  - **Models:** `McpLog`, `AiResponseLog`, `ChatMessage`, `Roll`
  - **Fix:** Retention policy or periodic pruning job.

### 3.3 Low priority

- [ ] **🟡 Missing FK indexes on `Token`**
  - **File:** `server/prisma/schema.prisma` — `characterId`, `npcId`, `monsterId`

- [ ] **🟡 Missing FK indexes on `EncounterParticipant`**
  - **File:** `server/prisma/schema.prisma` — `tokenId`, `npcId`, `characterId`, `monsterId`

- [ ] **🟡 No indexes on `Npc`/`Monster` `name`**
  - **Impact:** Name searches will table-scan.

- [ ] **🟡 `LOG_LEVEL` accepts invalid values silently**
  - **File:** `server/src/utils/logger.js` (line 18)
  - **Fix:** Warn on invalid value; fall back to `info`.

- [ ] **🟡 Optional env vars not documented in compose**
  - **Vars:** `RCLONE_REMOTE`, `REFERENCE_SYNC_ON_STARTUP`, `FIVE_E_TOOLS_SRC_URL`, `FIVE_E_TOOLS_IMG_URL`, `DEBUG`

- [ ] **🟡 No image digest pinning in Dockerfile**
  - **Problem:** Rebuilds pull latest `node:22-alpine` / `node:22-slim` tags (supply-chain drift).

- [ ] **🟡 Node version mismatch across docs and Dockerfile**
  - **Dockerfile:** `node:22` · **server/package.json:** `>=20` · **AGENTS.md:** documents `node:20`

- [ ] **🟡 Backup utility uses `console.log` instead of structured logger**
  - **File:** `server/src/utils/backup.js`

- [ ] **🟡 Cloud sync failure returns HTTP 200 with `success: false`**
  - **File:** `server/src/routes/backup.js` (lines 377–389)
  - **Problem:** UI may misread partial success as full backup.

- [ ] **🟡 rclone upload timeout 120s may be insufficient**
  - **File:** `server/src/utils/backup.js` (line 108)

- [ ] **🟡 No backup retention policy on disk**
  - **File:** `server/src/utils/backup.js` (lines 279–295)
  - **Problem:** `listLocalBackups(8)` limits API display only; zip files accumulate until container destroyed.

### 3.4 Dependencies

- [ ] **🟠 Client dev dependencies — 2 moderate vulnerabilities**
  - **Packages:** `vite` ≤6.4.1 (path traversal in optimized deps `.map` — [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)); `esbuild` ≤0.24.2 (dev server request hijack — [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99))
  - **Scope:** Dev-only toolchain; not in production runtime. Fix requires `vite@8.x` (semver-major).
  - **Fix:** Upgrade Vite when ready; dev server should never be exposed on LAN.

- [ℹ️] **Server dependencies — 0 vulnerabilities** (`npm audit` clean, 261 deps).

### 3.5 opencode.json (dev tooling only)

- [ ] **🟠 Puppeteer MCP — `ALLOW_DANGEROUS: "true"`**
  - **File:** `opencode.json` (line 53)

- [ ] **🟠 Chrome launched with `--no-sandbox` / `--disable-setuid-sandbox`**
  - **File:** `opencode.json` (line 52)
  - **Context:** Required in some CI environments; reduces browser sandbox isolation.

- [ℹ️] **`permission.edit` and `permission.bash` set to `"allow"`** — broad agent permissions; dev-only, not production runtime.

---

## 4. Documentation drift

- [x] **🟠 AGENTS.md says debug endpoints require DM auth — code does not enforce**
  - **Files:** `AGENTS.md`, `server/src/routes/debug.js`
  - **Fix:** Either apply `requireDm` in code or update docs to reflect public access.
  - **Fixed:** Jun 8 2026 — `requireDm` applied to all 3 debug GET routes.

- [ ] **🟠 AGENTS.md says no rate limiting — code has 200 req/min/IP limit**
  - **Files:** `AGENTS.md`, `server/src/index.js` (lines 79–89)
  - **Fix:** Update AGENTS.md to document existing rate limiter.

- [ ] **🟡 AGENTS.md documents Node 20 — Dockerfile uses Node 22**
  - **Files:** `AGENTS.md`, `Dockerfile`, `server/package.json`
  - **Fix:** Align docs and `engines` field with actual runtime image.

---

## 5. Suggested work order

Use this order if tackling the list without a specific priority request:

1. **User-visible bugs** — AI conversation loading, MapPanel races, socket resync, chat send failures
2. **Data integrity** — Safe SQLite backup, persistent backup volume
3. **Spoiler/data leaks** — Encounter fog/status, character reads, NPC AI visibility, debug auth
4. **Security hardening** — Socket identity, MCP auth (if LAN trust is insufficient)
5. **Tech debt** — Split MapPanel, DB indexes, Docker hardening, doc updates

---

## Progress summary

| Section | Total items | Done |
|---------|-------------|------|
| 1. Backend security & auth | 26 | 0 |
| 2. Frontend bugs & reliability | 35 | 0 |
| 3. Infrastructure & operations | 28 | 0 |
| 4. Documentation drift | 3 | 0 |
| **Total actionable** | **92** | **0** |

_Update the Progress summary table as items are completed._
