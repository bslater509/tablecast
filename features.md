# Tablecast — Future Feature Roadmap

This document outlines potential new features for the Tablecast D&D companion app.
Features are organized by domain area and include motivation, scope, and rough
implementation notes for each proposal.

---

## 1. VTT & Combat Enhancements

### 1.1 Dynamic Lighting / Line-of-Sight

- [x] **Status:** Implemented

**Motivation:** Adds tactical depth to combat. Players only see map areas their
character has line-of-sight to, based on token position, vision radius, and
walls/obstructions drawn by the DM.

**Scope:** Medium-Large

**Wall Data Model:**
- Stored as JSON on Map model (similar to `fogState`)
- Each wall is a segment: `{ x1, y1, x2, y2, blocking: "movement" | "vision" | "both" }`
- DM draws walls on canvas using line tool (snaps to grid vertices)
- Walls stored in new `walls` JSON field on Map model

**Vision Computation:**
- Per token: `visionRadius` (grid cells), `darkvisionRadius`, `visionAngle` (360° default, cone for facing)
- For each player token, cast N rays (e.g., 360 rays for 1° precision) from token center
- Each ray walks along grid until it hits a wall or reaches vision radius
- Compute visible polygon from ray endpoints using sweep-line algorithm
- Render as overlay using canvas `clip()` path — everything outside polygon is darkened
- DM toggle: "DM Vision" checkbox bypasses all clipping

**Light Tiers:**
- **Bright Light:** Within vision radius, no penalty
- **Dim Light:** Outdoors at dusk, or within darkvision radius — disadvantage on Perception
- **Darkness:** Outside any light source — effectively invisible to that token
- Light sources can be attached to tokens (torch, Light spell) with their own radius

**Performance:**
- Cache visible polygon per token and only recompute on move/fog change
- Limit ray count based on distance (fewer rays for distant tokens)
- Throttle recomputation to 10fps during drag, full refresh on drop

**Depends on:** MapPanel canvas renderer, Token model update (vision fields),
Map model update (walls JSON), raycasting math utility

---

### 1.2 Measurement & Ruler Tool

- [x] **Status:** Implemented

**Motivation:** Essential for D&D combat — players and DMs need to quickly
measure movement ranges, spell radii, and weapon reach on the VTT grid.

**Scope:** Small
- Toggle ruler mode in map toolbar
- Tap/drag start → tap/drag end → show line with pixel/grid distance
- Snap measurement to grid intersections
- Support both Euclidean (Pythagorean) and Chebyshev (grid) distance
- Display measurement as floating label on the canvas

**Depends on:** MapPanel UI only (no backend changes)

---

### 1.3 Token Auras & Status Effect Rings

- [x] **Status:** Implemented

**Motivation:** Visual indicators for ongoing spell effects (Bless, Spirit
Guardians), auras (Paladin aura of protection), and conditions (on fire,
poisoned) make combat state instantly readable.

**Scope:** Small
- Tokens render colored ring/glow effects around their base
- Aura data stored on token: `auraRadius`, `auraColor`, `auraOpacity`
- Status effect icons overlay the token image (poisoned → green skull, etc.)
- Predefined status set: Poisoned, Blessed, Frightened, Invisible, Prone, etc.
- Click token → "Add Condition" popover

**Depends on:** MapPanel canvas token rendering, Token model update (new JSON
field `conditions`)

---

### 1.4 Condition Tracker with Auto-Expiry

- [x] **Status:** Implemented

**Motivation:** Combat has many temporary effects (Hold Person lasts 1 minute,
Bless lasts 1 minute). Manual tracking is error-prone.

**Scope:** Medium
- Encounter participants track active conditions with remaining duration
- Duration expressed in rounds or real time (e.g. "10 rounds" or "60 seconds")
- Auto-decrement at turn end; remove expired conditions automatically
- Log condition application/expiry to chat
- DM can manually remove any condition

**Depends on:** EncounterParticipant model (new JSON `conditions` field),
Socket.io turn advancement logic, chat logging

---

### 1.5 Death Saves Tracker

- [x] **Status:** Implemented

**Motivation:** D&D 5e death saving throws are a critical combat mechanic that
deserves dedicated UI — not just a chat dice roll.

**Scope:** Small
- When a participant reaches 0 HP, auto-mark as "downed"
- Show death save widget: 3 success boxes, 3 failure boxes, clickable
- Auto-calculate: 3 successes → stable, 3 failures → dead, natural 20 → 1 HP
- Broadcast death save results to chat
- Track death save state in encounter participant (JSON field)

**Depends on:** EncountersPanel UI, EncounterParticipant model (new
`deathSaves` JSON field)

---

## 2. Gameplay Systems

### 2.1 Short/Long Rest with Recovery

- [x] **Status:** Implemented

**Motivation:** Core D&D 5e mechanic. Characters need to spend Hit Dice, recover
spell slots, and reset abilities after rests. Currently all manual.

**Scope:** Medium
- Rest button on CharacterSheet (or dedicated rest panel)
- **Short Rest (1hr):** Spend Hit Dice → recover HP; refresh per-short-rest abilities
- **Long Rest (8hr):** Full HP recovery; recover half Hit Dice; restore spell slots;
  remove exhaustion
- Animate HP bar refill and Hit Die consumption
- Log rest events to chat
- DM can restrict rests ("you can't rest here — monsters are near")

**Depends on:** CharacterSheet UI, Character model (Hit Dice tracking fields),
new REST log type in chat, optional socket event for party-wide rest

---

### 2.2 Shopping & Economy System

- [x] **Status:** Implemented

**Motivation:** Players accumulate gold and want to buy/sell gear during downtime.
Currently items have no price or shop context.

**Scope:** Medium-Large

**Shop Data Model:**
- New `Shop` model: `id`, `name`, `location` (text), `shopType` (GENERAL, WEAPONSMITH, ARMORER,
  MAGIC, ALCHEMY, BLACKSMITH), `markupMultiplier` (float, default 1.0)
- `ShopItem` sub-model or JSON array on Shop: `{ itemRef: string, name, price, quantity, isMagic, attunementRequired }`
- `itemRef` links to 5etools equipment reference where possible

**Currency System:**
- Tracking: pp (platinum), gp (gold), ep (electrum), sp (silver), cp (copper)
- Stored as JSON on Character: `{ pp, gp, ep, sp, cp }`
- Auto-conversion: 1gp = 10sp = 100cp, 1pp = 10gp
- UI shows total in gp equivalent with breakdown on hover

**Shopping Flow:**
1. DM creates shop via Settings panel (name, items, prices, markup)
2. DM assigns shop to location (or makes available globally)
3. Player opens "Shop" tab, sees inventory with prices
4. Buy: click item → confirm → deduct gold → add to character inventory
5. Sell: select from inventory → DM approves (optional) → add gold
6. Haggle: Persuasion check (player rolls) → DM sets DC → success reduces price 10-25%

**Restock & Magic Items:**
- Shops have `restockInterval` (daily, tenday, monthly) — DM manually triggers restock
- Magic item availability: roll d100 against DMG magic item tables per shop type
- Attunement slots tracked per character (max 3), shown on item cards

**Depends on:** New `Shop` model (Prisma), Shop CRUD routes, Character model
update (gold/per-currency field), Shopping frontend component, 5etools
equipment reference

---

### 2.3 Party Inventory & Shared Gold

- [x] **Status:** Implemented

**Motivation:** Parties typically share gold, carry common items (rope, torches),
and manage group resources.

**Scope:** Small-Medium
- Party "vault" — separate inventory not owned by any single character
- Shared gold pool (separate from per-character gold)
- DM-managed party fund
- Transfer between character and party inventory
- Visible to all party members
- Configurable: some groups track everything individually

**Depends on:** New `PartyInventory` model or reuse inventory JSON on a shared
entity, frontend Party Vault panel, transfer UI

---

### 2.4 Spellbook & Spell Cards UI

- [x] **Status:** Implemented

**Motivation:** Spellcasters need quick reference to their prepared spells during
combat — school, level, components, description, damage dice.

**Scope:** Medium

**Spell Card Layout:**
```
┌─────────────────────────────┐
│ ★ Fireball        [3rd][Evoc] │
│ Cast: 1 action    Range: 150ft │
│ Comp: V,S,M       Dur: Instant │
│ ───────────────────────────── │
│ A bright streak flashes...    │
│                               │
│ Save: DEX  DC 15              │
│ Damage: 8d6 fire              │
│ Upcast: +1d6 per slot level   │
│ ───────────────────────────── │
│ [Cast at 3rd] ▼ [Prepare]     │
└─────────────────────────────┘
```

**Slot Tracking:**
- Show available/used slots per level (e.g., "3 / 4" for 1st-level)
- Casting deducts from available slots; short/long rest restores
- Upcast: dropdown selects spell slot level → auto-scale damage/healing
- Ritual casting: checkbox → doesn't consume slot, adds 10min cast time

**Combat Integration:**
- Click "Cast" → if save spell, prompt for save type + DC → log to chat
- If attack spell, prompt "Roll attack?" → auto-roll d20 + spell attack bonus
- Concentration spells: auto-mark token with concentration effect, prompt on damage
  for Concentration save (DC 10 or half damage)
- Area-of-effect: show template overlay on map (cone, sphere, line, cube)
  - DM places template, system highlights affected tokens

**Filtering:**
- Tabs: All, Cantrips, Prepared, Concentration, Ritual
- Search by name
- Sort by level (asc/desc), school, name

**Component Tracking:**
- V (verbal): can cast while restrained/gagged?
- S (somatic): can cast with hands full?
- M (material): auto-check component pouch or arcane focus
- Expensive/consumed components flagged (diamond for Revivify, etc.)

**Depends on:** CharacterSheet UI refactor, Character model (existing
`spells`/`spellSlots`/`spellcastingAbility`/`spellSaveDc`/`spellAttackBonus`
fields), 5etools reference for spell details

---

### 2.5 Level-Up Wizard

- [x] **Status:** Implemented

**Motivation:** Leveling up is complex in D&D 5e (hit points, features, spell
slots, ability scores). A guided wizard reduces errors and speeds up downtime.

**Scope:** Medium

**Step Flow:**

1. **Class Selection** — if single-class, auto-continue current class; if
   multiclassing, show eligible classes based on ability score prerequisites
   (e.g., Fighter requires STR 13 or DEX 13)
   - Show XP threshold for next level (from 5etools reference)
   - Warning if multiclass prerequisites not met

2. **Hit Points** — show class hit die + Con mod, roll animation (digital die
   or fixed value option), total HP displayed before/after

3. **Class Features** — auto-granted for standard class progression
   - Feature choices: Fighting Style, Metamagic, Eldritch Invocations, etc.
   - Each choice shows available options from 5etools reference with descriptions
   - Some features have sub-choices (e.g., Battle Master maneuvers)

4. **Spellcasting** (if applicable):
   - New spells known (auto-calculated from class table)
   - New spell slots per level
   - Cantrip changes (some classes swap cantrips on level-up)
   - Replace known spells (one spell replaced with another of same level)

5. **Ability Score Improvement / Feat** (levels 4, 8, 12, 16, 19):
   - Option A: +2 to one ability score
   - Option B: +1 to two ability scores
   - Option C: Choose a feat (list filtered from reference, with descriptions)
   - Validate: no ability score exceeds 20 (PHB cap)

6. **Proficiency Bonus** — auto-calculated from character level
   - Shown as "New PB: +X" with comparison to previous

7. **Review** — summary of all changes before applying

**Character Model Updates on Apply:**
- Increment `level`
- Update `hpMax` (add rolled/incremented HP)
- Update `spells` array (add new spells known)
- Update `spellSlots` JSON
- Update `abilityScores` (if ASI taken)
- Update `features` / `modifiers` JSON (new class features)
- Set `xp` to next threshold (optional)

**Depends on:** CharacterSheet, Character model, class-level progression data
from 5etools reference (classes.json), feat data (feats.json)

---

## 3. Narrative & Worldbuilding

### 3.1 Ambient Soundboard & Background Music

- [x] **Status:** Implemented

**Motivation:** Audio immersion is one of the easiest wins for table feel —
tavern ambience, dungeon drones, combat stingers.

**Scope:** Medium

**File Management:**
- DM uploads MP3/OGG via Settings → Soundboard panel
- Files stored in `server/uploads/audio/`
- Max file size: 50MB (configurable via AppSetting)
- Supported formats: MP3 (preferred), OGG Vorbis, WAV (not recommended, large)
- Automatic bitrate normalization to 128kbps on upload (using ffmpeg if available)

**Soundboard Data Model:**
- New `Soundtrack` model: `id`, `name`, `category`, `filePath`, `duration`, `loop` (bool)
- Categories: COMBAT, EXPLORATION, TOWN, TAVERN, DUNGEON, WILDERNESS, AMBIENT
- Store as filesystem + DB (lightweight model, no heavy metadata)

**Playback Controls (DM Sidebar):**
- Track list by category with play/pause per track
- Volume slider per track (0-100%)
- Crossfade duration slider (0-10 seconds)
- "Play Next" queue: tracks play sequentially when current ends
- "Loop" toggle per track
- Master volume + mute button

**Multi-Client Sync:**
- On play/stop/seek: emit socket event `sound:state` → all clients synchronize
- Sync payload: `{ trackId, action: "play"|"stop"|"seek", position: seconds, volume, timestamp }`
- Clients use `timestamp` to offset playback position (server time vs. client time)
- On reconnect: request `sound:sync`, server broadcasts current state
- All clients maintain `AudioContext` → gapless, synchronized
- DM has "Master Sync" button to force-resync all clients

**Audio Layering:**
- Multiple tracks play simultaneously on different audio channels
- Example: "Tavern Ambience" (ambient) + "Lute Melody" (music) + "Rain" (weather)
- Each channel has independent volume and can be toggled individually
- Up to 4 simultaneous channels (browser performance limit)

**Depends on:** New `Soundtrack` model, file upload route for audio,
`server/uploads/audio/` directory, SoundboardPanel component, AudioContext
management in React, socket events (`sound:state`, `sound:sync`)

---

### 3.2 In-Game Calendar & Weather

- [x] **Status:** Implemented

**Motivation:** Campaign continuity — tracking in-game dates, seasons, holidays,
and random weather makes the world feel alive.

**Scope:** Medium

**Calendar Data Model:**
- Stored as JSON in `AppSetting` with key `calendar`
```json
{
  "yearLength": 365,
  "monthNames": ["Hammer", "Alturiak", "Ches", "Tarsakh", "Mirtul", "Kythorn",
                  "Flamerule", "Eleasis", "Eleint", "Marpenoth", "Uktar", "Nightal"],
  "daysPerMonth": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  "festivals": [
    { "month": 1, "day": 1, "name": "Midwinter", "description": "..." },
    { "month": 6, "day": 20, "name": "Summer Solstice", "description": "..." }
  ],
  "dayNames": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  "currentYear": 1491,
  "currentMonth": 1,
  "currentDay": 1,
  "epoch": "Dalereckoning"
}
```
- DM configures via Calendar Settings panel

**Time Advancement:**
- "Next Day" button → advance 1 day
- "Next Dawn" / "Next Dusk" → advance to next dawn/dusk
- "Next Tenday" → advance 10 days
- "Next Month" → advance to 1st of next month
- Each advancement calculates day of week, checks for festivals
- Festival notifications: toast + chat message ("Today is Midwinter!")

**Weather Generator:**
- Roll on per-season weather table:
  | d20  | Spring     | Summer     | Autumn     | Winter     |
  |------|-----------|-----------|-----------|-----------|
  | 1-4  | Clear      | Clear      | Clear      | Clear/Cold |
  | 5-8  | Cloudy     | Cloudy     | Cloudy     | Cloudy     |
  | 9-12 | Rain       | Hot        | Rain       | Snow       |
  | 13-16 | Windy     | Thunder    | Windy      | Blizzard   |
  | 17-19 | Thunder    | Drought    | Storm      | Freezing   |
  | 20   | Heavy Rain | Heat Wave  | Hurricane  | Whiteout   |
- Temperature range per season + regional modifier
- Weather effects on gameplay:
  - Heavy Rain / Blizzard: difficult terrain, -2 to Perception
  - Extreme Heat: exhaustion on failed Con save every hour
  - Strong Wind: disadvantage on ranged attacks
  - (Effects stored separately, not auto-applied — DM decides)

**Display:**
- DM header bar: "15 Ches, 1491 DR — Clear, 62°F"
- Click header for full calendar modal (month view grid)
- Weather icon next to date
- Visible to players (toggle in Settings)

**Depends on:** Calendar configuration UI, AppSetting storage, weather
generation module, frontend calendar modal component, socket event
(`game:dateChange`)

---

### 3.3 Quest/Journal Log (Player-Facing)

- [x] **Status:** Implemented

**Motivation:** Players need a persistent, structured view of active quests,
completed quests, and personal notes separate from the DM's wiki.

**Scope:** Medium

**Quest Data Model:**
- New `Quest` model:
  - `id`, `title`, `description` (markdown)
  - `status`: ACTIVE | COMPLETED | FAILED
  - `objectives`: JSON array `[{ description, type, isComplete, progress, target }]`
  - `objectiveTypes`: KILL | FETCH | ESCORT | EXPLORE | TALK | CRAFT
  - `rewards`: JSON `{ xp, gold, items: [] }`
  - `questGiverNpcId` (optional, links to NPC)
  - `parentQuestId` (optional, for quest chains)
  - `assignedToCharacterIds` (JSON array of character IDs, or empty = party)
  - `isVisibleToPlayers` (bool, DM publishes quest)

**Objective Completion:**
- KILL: auto-increment when encounter participant of matching type dies
- FETCH: auto-complete when item added to inventory
- TALK: DM manually marks complete when conversation had
- EXPLORE: auto-complete when token reaches target map region
- Progress shown: "3/5 goblins slain" with progress bar

**Player Journal UI:**
- Tab: "Journal" (separate from DM Wiki, visible in player nav)
- Sections: Active Quests, Completed Quests, My Notes
- Quest card: title, brief description, objective list with checkboxes, reward preview
- Click quest → detail view with full description, NPC info, reward details
- "My Notes" per quest: free-form text, visible only to that player
- Notification badge on Journal tab when new quest assigned or objective completed

**DM Tools:**
- Quest creation panel with objective builder
- DM can manually toggle objective completion
- Quest chain visualization (tree view)
- Assign quest to specific characters or entire party

**Depends on:** New `Quest` model (Prisma), Quest CRUD routes, QuestLog
frontend component, integration with Encounter (kill tracking) and Inventory
(fetch tracking)

---

### 3.4 Dialogue Tree Builder for NPCs

- [x] **Status:** Implemented

**Motivation:** DMs often prepare NPC dialogue in advance. A simple tree
structure lets branching conversations play out interactively.

**Scope:** Large

**Node Types:**
| Type | Purpose | Fields |
|------|---------|--------|
| SPEECH | NPC says something | `text` (markdown), `emotion` (happy, angry, sad, neutral) |
| CHOICE | Player picks from options | `options: [{ text, targetNodeId, condition }]` |
| CONDITION | Branch without player choice | `expression`, `trueTarget`, `falseTarget` |
| ACTION | Trigger game effect | `actionType` (giveItem, startQuest, dealDamage, setFlag), `payload` (JSON) |
| RANDOM | Random weighted branch | `branches: [{ weight, targetNodeId }]` |
| SKILL_CHECK | Branch based on roll | `skill`, `dc`, `successTarget`, `failureTarget` |

**Dialogue Data Model:**
- Stored as JSON on Npc model: `{ nodes: [...], startNodeId: "..." }`
- Each node has `id` (UUID), `type`, and type-specific fields
- Max 100 nodes per NPC (performance limit)
- References can point to other nodes by UUID

**Condition Expression Language:**
- Simple syntax for conditions: `{ "operator": "AND"|"OR"|"NOT", "conditions": [...] }`
- Leaf conditions: `{ "type": "hasItem", "itemName": "Silver Key" }`
- Types: `hasItem`, `questCompleted`, `questActive`, `levelGte`, `flagSet`,
  `goldGte`, `skillProficient`, `hasClass`, `hasFeature`
- Evaluated server-side when dialogue branch is resolved

**Editor UX:**
- Node graph with drag-to-connect (similar to Blender/GIMP node editors)
- Add node button → pick type → position on canvas
- Click node → edit properties in side panel
- Delete node → reconnect parents to children (or warn)
- Validate: no orphan nodes, start node exists, all branches reachable
- Auto-layout button (topological sort)

**Runtime (Dialogue Runner):**
- DM opens NPC → "Start Dialogue" button → dialogue panel appears
- Current node text displayed in a chat-like bubble
- Player choices shown as clickable buttons
- DM sees all branches and can override (pick any next node)
- Conditions evaluated automatically, grayed-out choices show tooltip why unavailable
- Roll results from SKILL_CHECK shown in chat with pass/fail
- Chat auto-logs: "{NPC}: {text}"
- `/rollskill perception 15` from player triggers a SKILL_CHECK branch

**AI Integration:**
- If no dialogue tree is defined (or player asks something outside the tree),
  fall back to AI roleplay (existing `/roleplay` command)
- Optional: AI generates dialogue branches on the fly, cached for reuse

**Depends on:** NPC model update (`dialogueTree` JSON), DialogueEditor
component (node graph), DialogueRunner component, skill check roll integration

---

### 3.5 Player Handouts

- [x] **Status:** Implemented

**Motivation:** DMs need to give handouts (images, documents, secret notes) to
specific players without revealing to the whole table.

**Scope:** Small-Medium
- DM creates handout (title, content, image attachment)
- Target: specific character(s) or all players
- Handout appears in the target's "Handouts" tab (new panel)
- Notifications: toast + unread badge when new handout arrives
- Handouts persisted in DB

**Depends on:** New `Handout` model, handout CRUD routes, HandoutPanel
frontend component, socket event for new-handout notification

---

## 4. Quality of Life

### 4.1 Drag & Drop Map Upload

- [x] **Status:** Implemented

**Motivation:** Current map upload requires navigating to Settings → upload
dialog. A drag-and-drop zone directly on the MapPanel would be much faster.

**Scope:** Small
- Drop zone overlay on MapPanel when no map selected (or "+" button)
- Dragging an image file → auto-upload → auto-create map → auto-select
- Supported formats: PNG, JPEG, WEBP, GIF
- Grid size auto-detect (show prompt after upload)

**Depends on:** MapPanel UI, maps.js upload route (already exists)

---

### 4.2 Character Builder Wizard

- [x] **Status:** Implemented

**Motivation:** Creating a D&D 5e character from scratch involves many
decisions. A step-by-step wizard is more approachable than a blank form.

**Scope:** Medium
- Step 1: Name + Race (show racial traits from reference)
- Step 2: Class (show class features, hit die, proficiencies)
- Step 3: Ability Scores (point buy / standard array / rolled)
- Step 4: Skills & Proficiencies (class + background)
- Step 5: Equipment (choose from class starting equipment)
- Step 6: Spells (for spellcasters)
- Review and create

**Depends on:** New CharacterWizard component, 5etools reference data for
races/classes/backgrounds, Character POST route (already exists)

---

### 4.3 Homebrew Content Manager

- [x] **Status:** Implemented

**Motivation:** D&D groups frequently use custom races, subclasses, feats,
spells, and magic items. A manager keeps them organized and searchable.

**Scope:** Large

**Data Model:**
- New `HomebrewEntry` model: `id`, `type` (RACE|CLASS|FEAT|SPELL|MAGIC_ITEM|MONSTER),
  `name`, `source` (text), `version` (semver string, e.g. "1.0.0"),
  `content` (JSON, schema varies by type), `tags` (JSON array),
  `isActive` (bool, defaults true), `createdAt`, `updatedAt`

**Per-Type Content Schemas:**
- **RACE:** `{ abilityBonuses: { str, dex, con, int, wis, cha }, speed, size, traits: [{ name, description }], languages }`
- **CLASS:** `{ hitDie, proficiencies: { armor, weapons, tools, saves }, spellcastingAbility?, features: [{ level, name, description, choices? }] }`
- **FEAT:** `{ prerequisites: [{ type, value }], description, abilityBonus: { str?, dex?, ... } }`
- **SPELL:** `{ level, school, castingTime, range, components, duration, description, higherLevels, damage?, saveType?, attackType? }`
- **MAGIC_ITEM:** `{ type (ARMOR|WEAPON|WAND|RING|...), rarity (COMMON|UNCOMMON|RARE|VERY_RARE|LEGENDARY|ARTIFACT), attunement, description, properties }`
- **MONSTER:** same schema as existing Monster model

**Integration Points:**
- Homebrew spells appear in Spellbook (tagged with "Homebrew" badge)
- Homebrew monsters appear in bestiary alongside imported monsters
- Homebrew feats show up in Level-Up Wizard feat selection
- Homebrew races/classes show up in Character Builder Wizard step 1/2
- All homebrew content searchable via existing reference search

**Export/Import:**
- Export: single JSON file `{ version: 1, entries: [...], exportedAt, source }`
- Import: drag-and-drop JSON file → validate schema → confirm → import
- Duplicate detection: warn on name+type collision, option to overwrite or skip
- Share format: DM can share JSON files with other DMs

**Versioning:**
- Each edit increments minor version
- DM can view version history and roll back to a previous version
- No automatic migration — updated content takes effect on next character edit

**Depends on:** New HomebrewEntry model, CRUD routes, HomebrewManager
component (table + editor forms), integration with character builder, spellbook,
bestiary, and reference search

---

### 4.4 Scenario & Encounter Templates

- [x] **Status:** Implemented

**Motivation:** DMs often reuse encounter structures (goblin ambush, dragon
lair). Templates save setup time.

**Scope:** Medium

**Template Format:**
- New `EncounterTemplate` model or reuse Encounter with `status: "TEMPLATE"`
- Saved fields: `name`, `description`, `mapId` (optional), `participants` (array of
  `{ sourceType: "npc"|"monster"|"character"|"placeholder", sourceId?, name, count }`),
  `difficulty` (easy/medium/hard/deadly), `recommendedLevel`, `tags`
- Placeholder participants: `{ sourceType: "placeholder", name: "Goblin", count: 4, cr: "1/4" }`
  — on load, DM picks specific NPCs/monsters to fill placeholders

**Template Library:**
- DM accesses from Encounters panel → "Templates" tab
- Grid/card view with name, difficulty badge, level range, tags
- Search by name, filter by difficulty/tags
- Pre-generated templates included:
  - "Goblin Ambush (CR 1-2)" — 4 goblins, 1 goblin boss
  - "Bandit Camp (CR 3-4)" — 6 bandits, 1 bandit captain
  - "Kobold Warren (CR 1-2)" — 6 kobolds, traps
  - "Dragon's Lair (CR 5+)" — 1 dragon (placeholder), minions
  - "Orc Raid (CR 2-3)" — 4 orcs, 1 orc eye of Gruumsh
  - Each template has XP budget and difficulty calculation

**Load Template → Encounter:**
1. DM selects template
2. Optional: choose a map (or use template's map)
3. Placeholder resolution: for each placeholder, DM picks from existing NPCs/monsters
   or creates new ones
4. Template participants cloned as EncounterParticipant entries
5. Initiative auto-rolled (or blank for manual)
6. New Encounter created with status SETUP

**Depends on:** New `EncounterTemplate` model or Encounter extension,
template CRUD, template → encounter conversion logic

---

### 4.5 Loot Generator

- [x] **Status:** Implemented (Jun 2026)

**Motivation:** D&D 5e has detailed treasure tables (DMG chapter 7). Automating
loot rolls saves time after combat.

**Scope:** Small-Medium

**Implementation:**
- **Treasure Table Reference:** `server/src/utils/treasureTables.js` (644 lines)
  - DMG treasure tables A-I encoded with full d100 lookup tables
  - Individual Treasure per CR tier (0-4, 5-10, 11-16, 17+)
  - Hoard Treasure per CR tier with coin hoards, gems, art, magic items
  - Magic item tables A-I (consumables, minor, major, weapons, scrolls, rods, wondrous, very rare, legendary)
  - Gem types (10gp–5000gp) and art objects (25gp–7500gp)
  - Dice rolling helpers (`rollDice`, `rollD100`) with multiplier notation support
- **API Endpoints** (`server/src/routes/loot.js`):
  - `POST /api/loot/generate` — Generate loot from CR + type (individual/hoard/both)
  - `POST /api/loot/cache` — Save as unclaimed cache
  - `GET /api/loot/cache` — List unclaimed caches
  - `POST /api/loot/cache/:id/assign` — Assign to party inventory + gold pool
  - `DELETE /api/loot/cache/:id` — Discard cache
- **Frontend** (`client/src/components/LootGeneratorPanel.jsx`):
  - Generate tab: CR input, treasure type selector, formatted result with coins/gems/art/magic items
  - Unclaimed tab: cached loot list, party selector, assign/discard buttons
  - Toast notifications for all actions
- **Prisma:** `LootCache` model added, migration applied
- **Unit Tests:** 31 tests covering treasure tables (getCrTier, calculateTotalValue, rollDice, generateIndividualTreasure, generateHoardTreasure, generateGemsOrArt, rollMagicItems, MAGIC_ITEM_TABLES structure, GEM_TYPES/ART_TYPES)
- **Wiring:** Route mounted at `/api/loot`, frontend nav item + route in DmLayout

**Loot Generation Flow:**
1. DM enters CR (0-30, step 0.25) and selects treasure type (Individual/Hoard/Both)
2. System rolls on DMG tables, returns formatted result with coins, gems, art, magic items
3. Result card shows: coin breakdown with colored dots, gem/art lists with values, magic items with type indicators, total GP value
4. "Keep Unclaimed" → loot stored in `LootCache` table for later assignment
5. "Assign to Party" → coins added to party gold pool, items to party inventory
6. "Regenerate" → re-roll with same parameters

**Art Objects & Gems:**
- Random gemstone type from table (ornamental → gemstone → jewel → precious)
- Random art object from table (painting, statue, jewelry, tapestry, etc.)
- Values per table: 10gp, 25gp, 50gp, 100gp, 250gp, 500gp, 750gp, 1000gp, 2500gp, 5000gp, 7500gp

**Depends on:** Reference data (treasureTables.js), Prisma LootCache model,
party inventory integration via `/api/loot/cache/:id/assign`

---

### 4.6 Campaign Dashboard

- [x] **Status:** Implemented

**Motivation:** DMs benefit from an at-a-glance overview of the entire campaign
state — active quests, upcoming sessions, recent events, unfinished encounters.

**Scope:** Medium
- Dashboard panel shown as the DM landing page (optional)
- Widgets: Active Quests, Upcoming Encounters, Recent Chat, Session Countdown,
  Party Status (HP overview), Next Session Date
- Quick actions: "Start Session", "Run Random Encounter", "Advance Time"
- Data aggregated from multiple models

**Depends on:** New Dashboard component, aggregate query routes or merged
server endpoint, no new models needed

---

## 5. Technical & Platform

### 5.1 Progressive Web App (PWA) Support

- [x] **Status:** Implemented (Jun 2026)

**Motivation:** Players access Tablecast from phones. Adding PWA support means
they can "install" it as a standalone app, get offline loading, and see a
custom splash screen.

**Implementation:**
- `vite-plugin-pwa` configured in `client/vite.config.js` with `registerType: "autoUpdate"`
- Manifest generated at build time (`dist/manifest.webmanifest`):
  - name: "Tablecast", short_name: "Tablecast"
  - display: "standalone", orientation: "portrait-primary"
  - theme/background: `#1e1b2e`
  - Icons: 192×192 and 512×512 (PNG, with maskable variant)
- Icons located at `client/public/pwa-192x192.png` and `client/public/pwa-512x512.png`
- `index.html` includes:
  - `<link rel="manifest" href="/manifest.webmanifest">`
  - `<link rel="apple-touch-icon" href="/pwa-192x192.png">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black">`
  - `<meta name="apple-mobile-web-app-title" content="Tablecast">`
  - `<meta name="theme-color" content="#1e1b2e">`
- Workbox runtime caching: NetworkFirst for API calls (`/api/*`) with 1-hour expiry
- Glob patterns: `**/*.{js,css,html,svg,png,ico,wasm,json}`

---

### 5.2 Chat Command Reference (/help)

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- `/help` command in `ChatPanel.jsx` `sendMessage()` — local-only, works offline
- Sends a system message with markdown-formatted help text listing all available commands
- System messages rendered with `compileMarkdown()` (DOMPurify-sanitized) in `MessageBubble.jsx`
- Commands documented:
  - `/roll <formula>` or `/r <formula>` — Roll dice with 3D animation
  - `/ai <question>` — Ask the D&D AI Assistant
  - `/roleplay <NPC>: <message>` — Roleplay with an NPC
  - `/help` — Show this command reference

---

### 5.3 Text-to-Speech for NPC Dialogue

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- `client/src/utils/ttsManager.js` — Browser `SpeechSynthesis` wrapper with:
  - `speak({ text, voice, pitch, rate, onEnd, onError })` — speaks text with optional voice config
  - `isTtsSupported()` — detects browser support
  - Voice queue management for sequential playback
- `MessageBubble.jsx`: Speaker icon (`Volume2` / `🔊`) on NPC messages
  - Click to play / stop TTS
  - Uses NPC `voice`, `voicePitch`, `voiceRate` from NPC data
  - Auto-strips HTML tags before speaking
  - `touch-target` class for mobile accessibility
- Falls back gracefully if `SpeechSynthesis` unavailable

---

### 5.4 Ping System (Player Map Markers)

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Socket event: `token:ping` (client→server) → `token:pong` (server→all clients)
- Server validates `mapId`, `x`, `y`, `type` (move/attack/look/danger), `sender`
- Color-coded ping types: Move=🟢, Attack=🔴, Look=🔵, Danger=🟡
- Canvas overlay rendering: expanding ring + pulsing dot + sender label
- Ping animation: 2-second lifecycle (expands from 15→55px radius, fades out)
- Long-press gesture on map canvas (800ms hold) triggers ping
- Movement during long-press cancels the ping

---

### 5.5 Offline Resilience Improvements

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**

**Socket Event Queue:**
- `safeEmit(event, data)` wrapper in `SocketContext.jsx`
- Connected → emit immediately; disconnected → push to `pendingQueue` (in-memory array)
- Queue: `[{ event, data, timestamp, retries: 0 }]`
- On reconnect → replay all queued events in FIFO order (100ms between each)
- Events older than 5 minutes discarded (state is stale)

**localStorage Cache:**
- `cacheSet(key, data)` / `cacheGet(key)` / `cacheGetWithAge(key)` / `cacheRemove(key)` / `getCacheAge(key)`
- Prefix: `tablecast:cache:`, max age: 5 minutes
- Safe JSON serialization with try/catch fallback
- `cacheGetWithAge` returns `{ data, age, isStale }` for conditional use

**Reconnection Sync Protocol:**
- Server emits `reconnect:sync` on authentication
- Client sends `reconnect:sync` with `{ lastKnownState: { tokenPositions, fogState, activeEncounterId } }`
- Server responds with `reconnect:state` containing diffs for changed state
- Diffs include: token positions, fog state, encounter state (round, turnIndex, status)
- Server-side diffing avoids sending redundant data

**Socket.io Reconnection:**
- Built-in Socket.io reconnection with exponential backoff
- Pending queue ensures no events lost during disconnect
- `reconnectCount` state tracks reconnection attempts

---

## 6. AI & Intelligence

### 6.1 AI-Triggered Dice Roll Integration

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- **Server-side detection** (`server/src/utils/diceRollDetection.js`, 187 lines):
  - `scanTextForRollChips(text)` — regex scanning for skills, saves, ability checks, attack rolls, and DC values. Returns `[{ type, label, skill?, ability?, dc? }]`.
  - `injectRollChips(text)` — appends chip markers with `data-dice-roll` attributes to markdown text.
  - Integrated into `server/src/ai/chat.js`: after AI generates a reply, `scanTextForRollChips` is called and results are sent as `rollChips` SSE event (streaming) or attached to JSON response.
  - `POST /api/ai/detect-roll-chips` endpoint for server-side scanning.

- **Client-side rendering** (`client/src/components/chat/MessageBubble.jsx`):
  - AI replies and NPC roleplay messages display detected roll chips as clickable button chips below the message text.
  - Each chip shows the skill/check/save label and DC (e.g., "Perception Check (DC 15)").
  - Clicking a chip:
    1. Rolls 1d20 via `useDiceBox()` with the user's dice theme/color.
    2. Posts the result to chat with DC comparison: "Perception Check: 18 vs DC 15 — ✅ Pass".
  - `useAiChat.js`: attaches `rollChips` from AI stream response to the last assistant message object.

**Known Limitation:** Current implementation rolls a flat 1d20 without pulling the character sheet modifier. Modifier lookup requires the roll chip to know which character is active and which skill/ability modifier to apply — pending future enhancement.

---

### 6.2 Quest & Story Hook Generator

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `POST /api/ai/generate-hooks` in `server/src/ai/generation/handlers.js`
  — `handleGenerateHooks` (96 lines)
- SSE-based streaming response with status updates during generation
- Accepts: `partyLevel`, `environment`, `tone`, `constraints`, `includeCombat`,
  `includePuzzles`, `includeNpcs`, `includeMoralDilemma`
- Returns JSON result: `{ hooks: [{ title, pitch, setup, conflict, npcs, complications, rewards }] }`
- Frontend: `client/src/components/QuestHookGenerator.jsx` (809 lines)
  - Environment dropdown (9 options), tone dropdown (5 options)
  - Checkboxes for combat/puzzles/NPCs/moral dilemma
  - Party levels text input (comma-separated)
  - SSE stream reader with real-time status
  - Hook cards with copy-to-clipboard, per-hook regenerate button
  - Route: `/dm/quest-hooks`
- Uses campaign wiki context via `fetchCampaignWikiSnippet()`

---

### 6.3 Name Generator

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `POST /api/ai/generate-names` in `server/src/ai/generation/handlers.js`
  — `handleGenerateNames` (55 lines, JSON response)
- Accepts: `category` (9 valid categories validated server-side), `count` (1-20, default 5),
  `stylePrompt` (optional)
- Response: `{ names: ["name1", "name2", ...] }`
- Frontend: `client/src/components/NameGenerator.jsx` (495 lines)
  - Category dropdown (9 categories)
  - Count slider (1-20)
  - Style/tone text input (optional)
  - Result chips with click-to-copy, copied feedback (green highlight)
  - "Generate More" appends, "Clear" resets
  - Route: `/dm/name-generator`

---

### 6.4 Loot & Treasure Generator

- [x] **Status:** Implemented (Jun 2026)

**Motivation:** After combat, DMs need to quickly determine what the party finds.
AI can roll on DMG treasure tables and present formatted loot.

**Scope:** Medium

**Generation Modes:**
1. **By CR/Monster Type:** "Generate treasure for a CR 5 troll" → individual treasure
2. **By Encounter:** "Generate hoard for the goblin boss encounter" → hoard treasure
3. **Custom:** "Generate a mix of gold, gems, and 1-2 uncommon magic items suitable for level 4"

**Output Format:**
```
┌─── TREASURE ───────────────┐
│ Coins: 143 gp, 310 sp       │
│ Gems: 2 × Jade (100gp each) │
│ Art: Silver ewer (250gp)    │
│ ─────────────────────────── │
│ 🗡️ +1 Shortsword            │
│ 🧪 Potion of Invisibility   │
│ 📜 Scroll of Fireball        │
│ ─────────────────────────── │
│ Total Value: ~1,200 gp       │
│ [Assign to Party] [Reroll]   │
└────────────────────────────┘
```

**Integration Points:**
- Items link to 5etools reference for full descriptions
- "Assign to Party" pushes items to shared party inventory (see §2.2, §2.3)
- Rolls logged to chat; DM can edit/adjust before assigning
- Magic item table rolls follow DMG distribution (Tables A-I by CR tier)

**Depends on:** New `POST /api/ai/generate-loot` route, DMG treasure table
reference data (JSON), chat card rendering, party inventory integration

---

### 6.5 AI-Powered Wiki Article Generation

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `POST /api/ai/generate-wiki-article` in `server/src/ai/generation/handlers.js`
  — `handleGenerateWikiArticle` (76 lines, SSE-based)
- Accepts: `prompt` (required), `category` (optional), `includeSections` (optional array)
- Returns: `{ title, content (markdown), suggestedTags: string[] }`
- Uses campaign wiki context via `fetchCampaignWikiSnippet()` for setting consistency
- Auto-suggests tags from generated content

---

### 6.6 Location & Room Description Generator

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `POST /api/ai/generate-description` in `server/src/ai/generation/handlers.js`
  — `handleGenerateDescription` (79 lines, SSE-based)
- Accepts: `type` (room/building/wilderness/settlement — validated), `prompt` (required),
  `tone` (ominous/peaceful/mysterious/grand/dilapidated — validated)
- Returns: `{ description, sensoryDetails: { sights, sounds, smells }, hiddenDetails }`
- Uses campaign wiki context for setting consistency
- Frontend: `client/src/components/DescriptionGenerator.jsx` (730 lines, SSE streaming)

---

### 6.7 Weather & Travel Montage Generator

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `POST /api/ai/generate-travel` in `server/src/ai/generation/handlers.js`
  — `handleGenerateTravel` (86 lines, SSE-based)
- Accepts: `route` (required), `terrain`, `days` (3-7, clamped), `season`,
  `partyLevel`, `dangerous` (boolean)
- Returns: `{ legs: [{ day, weather, temperature, description, hook }] }`
- Uses campaign wiki context for setting consistency
- Frontend: `client/src/components/TravelGenerator.jsx` (786 lines)
  - Route text input, terrain/season dropdowns, days slider (3-7)
  - Party level number input, dangerous route toggle
  - SSE stream reader with per-day card rendering
  - Weather icons (sunny/cloudy/rainy/snowy/stormy/windy/foggy)
  - Copy single day / Copy all to clipboard
  - Cancel in-flight generation
  - Route: `/dm/travel`

---

### 6.8 NPC Dialogue Phrase Generator

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `POST /api/ai/generate-npc-phrases` in `server/src/ai/generation/handlers.js`
  — `handleGenerateNpcPhrases` (72 lines, JSON response)
- Accepts: `npcId?` (optional — fetches NPC from DB for richer context),
  `name`, `race`, `personality`, `phraseType` (greeting/threat/bargain/combat/rumor/farewell
  — validated), `count` (1-15, clamped, default 5)
- Response: `{ phrases: ["...", "..."] }`
- Graceful fallback if NPC lookup fails (logs warning, continues with provided fields)

---

### 6.9 Image Generation Integration (NPC Portraits & Scene Art)

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `server/src/ai/helpers/imageGeneration.js` (116 lines) — DALL-E 3 image generation via OpenAI API
  - `generateImage(prompt, style, apiKey)` — calls `https://api.openai.com/v1/images/generations`
  - Style mapping: photorealistic, painted, sketch, comic, fantasy-art (descriptors prepended to prompt)
- Backend handler: `POST /api/ai/generate-image` in `routes/ai.js` via `handleGenerateImage` handler
  - Accepts: `{ prompt, style? }` — returns `{ imageUrl, prompt, style }`
  - DM-only (requiresDm middleware)
- Frontend: `client/src/components/GenerateImageModal.jsx` (466 lines)
  - Prompt textarea with default prompt pre-populated from entity context
  - Art style dropdown (5 options + none)
  - Generate button with loading spinner, error display
  - Preview with Accept/Regenerate/Cancel actions
  - Keyboard shortcuts: Ctrl+Enter to generate, Escape to close
  - Supports both `show` and `isOpen` props for compatibility
- Integrated into WikiPanel NPC and Monster detail views (dice gen button opens modal)
- Generated images stored temporarily at `/uploads/ai-generated/`

---

### 6.10 AI Combat Tactician

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `POST /api/encounters/:id/suggest-action` in `routes/encounters.js` (115 lines)
  - DM-only endpoint (requiresDm)
  - Accepts: `{ participantId }` — returns `{ recommended, alternatives: [] }`
  - AI-powered: builds context from participant statblock (monster/NPC/character actions, traits, spells)
  - Encounter state: all participants' initiative, HP, AC, conditions for tactical awareness
  - Custom prompt: "You are an AI Combat Tactician for D&D 5e" with target prioritization, positioning, resource economy reasoning
  - Local fallback: when AI provider not configured, uses heuristic rules (flee at <30% HP, attack nearest, use special abilities)
  - Response parsed from AI JSON output with markdown code block stripping
- Frontend: Suggest Action button (Lightbulb icon) per participant row in EncountersPanel
  - Click opens suggestion popover showing recommended action + alternatives
  - Loading state while AI generates, error handling for failed requests
  - Responsive modal design matching project theme

---

### 6.11 AI Session Co-Pilot (Live DM Assistant)

- [x] **Status:** Implemented (Jun 2026)

**Implementation:**
- Backend: `server/src/ai/copilot.js` — Express router for co-pilot functionality
  - `POST /api/ai/copilot/check` — analyzes chat messages and returns suggestions
    - DM-only endpoint (requiresDm)
    - Accepts: `{ text, encounterId, sessionId }`
    - Rules detection: `isRulesQuestion()` regex patterns (15 patterns for advantage, saving throws, concentration, grappling, etc.)
    - Lore consistency check: uses `performAiCall` + `fetchCampaignWikiSnippet` to detect wiki conflicts
    - Encounter balance warning: CR comparison against party average level (warns if CR > avg level + 4)
    - Round tracker: encounter context summary (round number, active combatants, party count)
    - Rate-limited: 30-second cooldown per session
    - Returns: `{ cooldown: bool, suggestions: [{ type, priority, title, text }] }`
  - `GET /api/ai/copilot/status` — health check
  - Mounted via `routes/ai.js` on the AI router
- Socket.io event: `copilot:check` in `server/src/socket.js`
  - DM-only — checks `socket.data.user`
  - Rate-limited per socket connection
  - Triggers rules check, lore check, and encounter balance check
  - Emits `copilot:suggestion` with suggestions array to the DM's socket only
- Frontend: `client/src/components/CoPilotPanel.jsx` (260+ lines)
  - Collapsible sidebar panel with header "AI Co-Pilot" and connection status indicator
  - Suggestion cards with priority colors (red=high, amber=medium, gray=low)
  - Type icons: 📖 rule, 📜 lore, ⚔️ balance, ⏱️ effect
  - Socket.io listener for `copilot:suggestion` events
  - Auto-dismiss suggestions older than 5 minutes
  - Dismiss single or "Clear all" button
  - Empty state: "Co-Pilot is monitoring the session"
  - Cooldown indicator when rate-limited
- Wired into App.jsx DM_NAV_ITEMS as `copilot` with Bot icon
- Route: `/dm/copilot`

