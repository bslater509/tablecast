# Project Context - Section 4.3 Complete

## Environment
- Language: JavaScript (Node.js 22, React 18)
- Build: Vite 5 (client) / Node (server)
- Package Manager: npm, Docker, Prisma 5 (SQLite)

## What Was Built - Section 4.3: Homebrew Content Manager

### Prisma Schema
- New `HomebrewEntry` model with fields: id, type (RACE|CLASS|FEAT|SPELL|MAGIC_ITEM|MONSTER), name, source, version, content (JSON), tags (JSON), isActive, timestamps

### Backend — `/api/homebrew` Routes
- `GET /api/homebrew` — list with optional ?type= and ?active=true filters
- `GET /api/homebrew/:id` — single entry
- `POST /api/homebrew` — create (DM only)
- `PUT /api/homebrew/:id` — update (DM only)
- `DELETE /api/homebrew/:id` — delete (DM only)
- `POST /api/homebrew/export` — export all/selected entries as JSON
- `POST /api/homebrew/import` — import entries with duplicate detection and optional overwrite

### MCP Tools
- `list_homebrew` — list entries by type/active status
- `create_homebrew` — create entry with type-specific content
- `update_homebrew` — update entry fields
- `delete_homebrew` — delete by ID

### Reference Search Integration
- `/api/reference/search` now augments results with homebrew entries matching the category
- Category mapping: spells→SPELL, monsters→MONSTER, items→MAGIC_ITEM, races→RACE, classes→CLASS, feats→FEAT
- `/api/reference/detail` falls back to homebrew entries when 5etools lookup fails

### Frontend — HomebrewManager.jsx (~550 lines)
DM-only panel for managing homebrew content:
- **List view**: Cards with type badge, name, version/source, tags, active toggle, edit/delete buttons
- **Search & filter**: By name/source/tag, and type dropdown filter
- **Create/Edit Modal**: Type-specific form with fields for each content type:
  - RACE: ability bonuses, speed, size, traits, languages
  - CLASS: hit die, spellcasting ability, features
  - FEAT: description, prerequisites
  - SPELL: level, school, casting time, range, components, duration, description, higher levels, damage, save type, attack type
  - MAGIC_ITEM: item type, rarity, attunement, description, properties
  - MONSTER: HP, AC, CR, 6 ability scores, actions, description
- **Export**: Downloads all entries as JSON file
- **Import**: Upload JSON file with overwrite option

### App.jsx Wiring
- Imported `Beaker` icon from lucide-react
- Added DM nav item: id="homebrew", path="/dm/homebrew", icon=Beaker
- Added Route: `<Route path="homebrew" element={<HomebrewManager user={user} />} />`
