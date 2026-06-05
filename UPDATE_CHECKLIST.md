# Tablecast Update Checklist

This checklist captures recommended improvements for the Tablecast local D&D server. Each item describes the current issue or risk and the intended outcome so future implementation work can be picked up without needing the original discussion.

## 1. Stability and Correctness

- [x] **Fix garbled text and emoji encoding.**  
  Several UI labels, comments, and server log messages appear with broken character sequences caused by invalid or double-encoded text. Clean these strings up by either restoring valid UTF-8 text or replacing decorative emoji with plain, readable labels. The goal is a polished interface and source files that are easy to read in any editor.

- [x] **Add backend role enforcement for DM-only actions.**  
  The frontend hides DM tools from players, but server routes and socket handlers should also enforce permissions. Add backend checks for actions such as backup triggers, reference sync, wiki editing, fog updates, map deletion, and token administration. This prevents a modified client or accidental request from performing privileged actions.

- [x] **Validate Socket.io event payloads before database updates.**  
  Socket events such as `token:move`, `token:create`, `token:delete`, and `fog:update` currently depend on clients sending valid data. Add explicit validation for required fields, numeric ranges, IDs, and JSON payload shape before calling Prisma. Invalid events should be ignored or return a clear error without corrupting map or token state.

- [x] **Improve frontend reconnect and disconnect state.**  
  The app should clearly show when the phone or browser has lost the Socket.io connection and when it has reconnected. Add a small persistent connection indicator and graceful messaging around reconnection so players know whether dice rolls, chat, and token moves are live.

## 2. Mobile and VTT Experience

- [x] **Persist the selected user session in `localStorage`.**  
  User selection currently lives in React state, so refreshing the page requires joining again. Store the selected user ID locally and restore it on load when the user still exists. This makes phone refreshes and temporary disconnects less disruptive during play.

- [x] **Improve mobile VTT controls.**  
  The VTT should be comfortable to operate on touch screens. Add stronger mobile affordances such as pinch zoom, larger tool buttons, clearer selected-token actions, and improved pan versus token-drag behavior. The goal is to make map interaction reliable during actual table play.

- [x] **Add map and token import helpers.**  
  Campaign prep would be faster with utilities for adding maps and common tokens in fewer steps. Add helpers that support common image paths, default grid settings, and quick token creation from existing character or reference data.

## 3. Data, Assets, and Backups

- [x] **Make 5etools token image lookup reliable.**  
  Token image paths are currently guessed from monster names and source codes, but the imported assets include different folders and file extensions such as `.webp`. Add a backend lookup endpoint that searches or indexes available token image files and returns the real URL for a selected monster. This should remove broken token portraits caused by path mismatches.

- [x] **Harden the backup workflow.**  
  Backups should check whether `rclone` is installed and configured before attempting cloud sync. Add protection against overlapping backup jobs, expose clearer success and failure states, and consider showing recent local backup history in the settings UI. The goal is to make manual backups trustworthy and easy to diagnose.

- [x] **Make reference sync configurable.**  
  Reference repository sync currently runs automatically at server startup. Make this opt-in, configurable, or clearly controlled from DM settings so startup remains predictable on game night. The app should still support manual reference updates from the UI.

## 4. Developer Hygiene

- [ ] **Add API and Socket.io smoke tests.**  
  Add a small test suite or scripted smoke checks for core behavior: health check, user creation, character CRUD, map CRUD, backup route error handling, and token movement over sockets. These checks should catch obvious regressions before rebuilding the Docker container.

- [ ] **Clean generated files and large artifacts from git tracking.**  
  Review `.gitignore` and tracked files for generated or environment-specific artifacts such as `node_modules`, `client/dist`, SQLite database files, backups, and very large imported asset folders. Decide which assets should be versioned and which should be generated or synced locally. This keeps the repository smaller and easier to maintain.

- [ ] **Add Docker healthcheck and startup diagnostics.**  
  Add a Docker healthcheck that calls the backend health endpoint and reports whether the service is ready. Improve startup logs so they clearly show database path, upload path, reference sync mode, backup availability, and LAN binding status. This makes deployment problems easier to spot.

## 5. Future Gameplay Quality of Life

- [ ] **Improve wiki search, filtering, and tag management.**  
  The campaign wiki and player journal should support faster lookup during play. Add better search behavior, tag filters, visible tag editing, and clear handling of player-visible versus DM-only articles.

- [ ] **Add character sheet quality-of-life tools.**  
  Expand the sheet with common play aids such as death saves, conditions, spell slots, hit dice, armor class, initiative, passive perception, and temporary hit points. These should remain mobile-first and quick to adjust at the table.
