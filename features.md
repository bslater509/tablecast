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

- [ ] **Status:** Planned

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

- [ ] **Status:** Planned

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

- [ ] **Status:** Planned

**Motivation:** D&D 5e has detailed treasure tables (DMG chapter 7). Automating
loot rolls saves time after combat.

**Scope:** Small-Medium

**Treasure Table Reference:**
- DMG treasure tables encoded as JSON (stored in reference data or AppSetting)
- **Individual Treasure:** per CR tier (0-4, 5-10, 11-16, 17+)
  - Roll d100: coin amounts (cp, sp, gp, pp)
- **Hoard Treasure:** per CR tier
  - Roll d100 for coin hoard (significant amounts)
  - Roll d100 for art objects / gems (count and value)
  - Roll d100 for magic items (by table: A, B, C, D, E, F, G, H, I)
- Magic item tables: each has a d100 roll mapping to specific items

**Magic Item Distribution:**
| Table | CR 0-4 | CR 5-10 | CR 11-16 | CR 17+ |
|-------|--------|---------|----------|--------|
| A (consumables) | 6% | 10% | 12% | 15% |
| B (minor items) | 4% | 8% | 10% | 12% |
| C (major items) | 2% | 5% | 8% | 10% |
| D (weapons/armor) | 2% | 4% | 6% | 8% |
| E (scrolls) | 3% | 6% | 8% | 10% |
| F (rods/staves) | — | 2% | 4% | 6% |
| G (wondrous) | — | 1% | 3% | 5% |
| H (very rare+) | — | — | 2% | 4% |
| I (legendary) | — | — | — | 2% |

**Loot Generation Flow:**
1. DM selects encounter (or monster CR/type)
2. System suggests: "Individual Treasure" (per monster) or "Hoard Treasure" (per encounter)
3. Auto-roll: animate coin rolls, gem reveals, item cards flipping
4. Result displayed as formatted loot card in chat:
   ```
   ┌─── LOOT ─────────────────┐
   │ 250 gp, 120 sp, 30 pp     │
   │ 3 gems (100gp each)       │
   │ ──────────────────────────│
   │ 🎲 Potion of Healing      │
   │ 🎲 Wand of Magic Missiles │
   │ 🎲 +1 Longsword           │
   │ ──────────────────────────│
   │ [Assign to Party] [Reroll]│
   └──────────────────────────┘
   ```
5. DM can modify: add/remove items, adjust coin amounts, reroll individual slots
6. "Assign to Party" → items added to party inventory, coins added to gold pool
7. "Keep Unclaimed" → loot stored as loot cache, assignable later

**Art Objects & Gems:**
- Random gemstone type from table (ornamental → gemstone → jewel → precious)
- Random art object from table (painting, statue, jewelry, tapestry, etc.)
- Values per table: 10gp, 25gp, 50gp, 100gp, 250gp, 500gp, 750gp, 1000gp, 2500gp, 5000gp, 7500gp

**Depends on:** Reference data for treasure tables (encoded in
`server/uploads/5etools-cache/` or custom JSON), loot generation function,
chat card rendering for loot (markdown or custom component), integration with
party inventory

---

### 4.6 Campaign Dashboard

- [ ] **Status:** Planned

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

- [ ] **Status:** Planned

**Motivation:** Players access Tablecast from phones. Adding PWA support means
they can "install" it as a standalone app, get offline loading, and see a
custom splash screen.

**Scope:** Small

**Manifest (`public/manifest.json`):**
```json
{
  "name": "Tablecast",
  "short_name": "Tablecast",
  "description": "D&D 5e Virtual Tabletop Companion",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Service Worker:**
- Generated/managed with `vite-plugin-pwa`
- Cache strategy:
  - **Cache First:** app shell (HTML, JS, CSS, fonts, icons)
  - **Network First:** API calls (`/api/*`), WebSocket data
  - **Stale While Revalidate:** reference data, map images
- Offline fallback: static "You are offline" page with reconnect status
- Reconnection: on online event, ping server, if connected → clear SW cache, reload

**Icon Sizes:**
| Size | Name |
|------|------|
| 48×48 | `icon-48.png` |
| 72×72 | `icon-72.png` |
| 96×96 | `icon-96.png` |
| 144×144 | `icon-144.png` |
| 192×192 | `icon-192.png` |
| 512×512 | `icon-512.png` |
| 1024×1024 | `icon-1024.png` (Apple) |

**Meta Tags:**
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<link rel="apple-touch-icon" href="/icons/icon-192.png">`
- `<meta name="mobile-web-app-capable" content="yes">`

**Depends on:** Vite build config (`vite-plugin-pwa`), icon assets, no
significant application code changes

---

### 5.2 Chat Command Reference (/help)

- [ ] **Status:** Planned

**Motivation:** Users don't know what commands are available (/ai, /roleplay).
An in-app reference reduces friction.

**Scope:** Small
- `/help` command in chat → system message listing all available commands
- `/ai <query>` — Ask the D&D AI Assistant
- `/roleplay <NPC>: <message>` — Roleplay with an NPC
- `/roll <formula>` — Roll dice via text command (if not using dice box)
- `/whisper <name>: <message>` — Private message to a specific user (future)

**Depends on:** ChatPanel command parsing, no new models

---

### 5.3 Text-to-Speech for NPC Dialogue

- [ ] **Status:** Planned

**Motivation:** Hearing NPCs speak — especially in roleplay-heavy sessions —
adds a layer of immersion that text alone doesn't provide.

**Scope:** Medium

**Voice Selection:**
- Uses browser `SpeechSynthesis` API (Web Speech API) — no server cost
- Voice stored per NPC in new `voice` field (string, e.g. "Google UK English Female")
- Fallback: if exact voice not available, pick closest match
- Predefined voice archetypes:
  - "Deep" (male, low pitch) — for orcs, giants, villains
  - "Soft" (female, gentle) — for healers, merchants, quest givers
  - "Raspy" (male, rough) — for rogues, goblins, veterans
  - "High" (female, bright) — for children, fairies, excited NPCs
  - "Elderly" (male, slow) — for sages, village elders
- Pitch and rate tunable per NPC: `voicePitch` (0.5-2.0), `voiceRate` (0.5-2.0)

**Playback Controls:**
- Speaker icon next to NPC chat messages → click to play
- Auto-play toggle ("Play NPC voices automatically")
- Stop button in header when TTS active
- Queue: multiple NPC messages in a row are queued and played sequentially
- Language support: auto-detect from NPC voice locale, or fall back to browser default

**Implementation Notes:**
- `window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))`
- Set `utterance.voice`, `.pitch`, `.rate`, `.volume` before speaking
- Listen for `onend` event to trigger next queued message
- Chrome requires user interaction before first use (click to enable)
- iOS Safari limits: requires silent audio context unlock (user tap first)
- SSML not supported by Web Speech API — use plain text only

**Depends on:** Browser SpeechSynthesis API, Npc model update (`voice` field,
`voicePitch`, `voiceRate`), ChatPanel UI button, TTS queue manager

---

### 5.4 Ping System (Player Map Markers)

- [ ] **Status:** Planned

**Motivation:** Players need to communicate "I move here," "Look at this," or
"That's the trap!" without physical pointing.

**Scope:** Small
- Long-press or double-tap on map canvas → ping (ripple animation + sound)
- Ping type: Move, Attack, Look, Danger (color-coded)
- Ping visible to all connected clients for ~3 seconds then fades
- Socket event: `token:ping` → `token:pong`
- DM sees player name on ping labels

**Depends on:** Socket.io event (`token:ping`), MapPanel canvas overlay
(animated circle + label)

---

### 5.5 Offline Resilience Improvements

- [ ] **Status:** Planned

**Motivation:** Connection drops during a session break immersion. The app
should gracefully handle and recover from offline states.

**Scope:** Medium

**Socket Event Queue:**
- Every outbound socket emit goes through a wrapper: `safeEmit(event, data)`
- If socket is connected → emit immediately
- If socket is disconnected → push to `pendingQueue` (in-memory array)
- Queue structure: `[{ event, data, timestamp, retries: 0 }]`
- On reconnect → replay all queued events in FIFO order (max 10s delay between each)
- Events older than 5 minutes are discarded (state is stale)
- Replayed events check server for conflicts before applying (see below)

**localStorage Cache Schema:**
```
{
  "cache:map:{mapId}:tokens": Token[],
  "cache:map:{mapId}:fog": fogState,
  "cache:encounter:{encounterId}": Encounter,
  "cache:character:{characterId}": Character,
  "cache:lastSync": timestamp
}
```
- Cache written on every successful server sync
- On disconnect, UI reads from cache instead of showing empty state
- Stale indicator: faded overlay on cached elements with "Last synced: Xm ago"
- Cache size limit: 5MB (localStorage quota warning)

**Reconnection Strategy:**
| Attempt | Delay | Notes |
|---------|-------|-------|
| 1st | 1s | Immediate retry |
| 2nd | 2s | Exponential backoff |
| 3rd | 4s | |
| 4th | 8s | |
| 5th | 16s | |
| 6th+ | 30s | Cap at 30s between retries |
| After 2min | Show "Reconnecting..." banner | |
| After 5min | Show "Connection Lost" with manual reload button | |

**Conflict Resolution on Reconnect:**
- Client sends `reconnect:sync` with `{ lastKnownState: { tokenPositions: {...}, fogState: {...} } }`
- Server compares its current state with client's last known
- Server responds with `reconnect:state` containing only the diffs
- Client applies diffs to local cache, discards stale queued events
- Dice roll queued events are never discarded (critical game state)

**Offline Dice Rolling:**
- `@3d-dice/dice-box` requires WebGL → may not initialize without connectivity
- Fallback: pseudo-random number generator (seeded with timestamp) for `/roll` command
- Results queued with `safeEmit` and sent when reconnected
- Visual: text-based result "🎲 1d20 → 15" instead of 3D animation

**Depends on:** Socket event queue wrapper (`safeEmit`), localStorage cache
strategy, `reconnect:sync`/`reconnect:state` socket events, MapPanel state
serialization, DiceBoxContext fallback

---

## 6. AI & Intelligence

### 6.1 AI-Triggered Dice Roll Integration

- [ ] **Status:** Planned

**Motivation:** Bridges the two biggest mechanics — AI chat and dice rolling.
When the Rules Scholar or NPC roleplay AI recommends a check or save, the user
should be able to roll directly from the chat message.

**Scope:** Small

**Detection:**
- AI replies are scanned server-side after generation for D&D check patterns:
  `{skill|ability|save} check`, `DC N`, `saving throw`, `attack roll`
- Matched spans are flagged with a `data-dice-roll` attribute in the markdown output
- Client renders a clickable chip: e.g. `[🎲 Roll Perception DC 15]` inline in the message

**Dice Roll Chips:**
- Each chip carries: `{ type, skill/ability, dc, advantage? }`
- Clicking the chip:
  1. Sends `/roll 1d20+{modifier}` (modifier pulled from active character sheet)
  2. Dice box animates the roll
  3. Result posted to chat with DC comparison: "✅ Success (18 vs DC 15)" or "❌ Fail (9 vs DC 15)"
- DMs get an extra "Roll for monster/NPC" variant using NPC stats if in NPC roleplay

**Refinements:**
- Advantage/disadvantage detection: AI says "with advantage" or "at disadvantage"
- Critical success/failure callout for natural 20/1
- Auto-damage roll for attacks: "make a melee attack (1d8+3 slashing)"
- Configurable: toggle auto-detection on/off per conversation

**Depends on:** Server-side regex/pattern scanning in chat handler, `data-dice-roll`
attribute convention, DiceBoxContext integration, CharacterSheet modifier lookup

---

### 6.2 Quest & Story Hook Generator

- [ ] **Status:** Planned

**Motivation:** DMs spend hours brainstorming adventure hooks. An AI-assisted
hook generator produces multiple distinct ideas from a brief prompt, saving
prep time and sparking creativity.

**Scope:** Medium

**Input Format:**
- DM provides: party level, environment (forest/urban/dungeon/etc.), tone
  (heroic/dark/horror/mystery/comedy), optional constraints ("must involve a hag")
- Configuration checkboxes: include combat, include puzzles, include NPCs,
  include moral dilemma

**Output:**
- 3-4 distinct hooks, each with:
  - **Hook title** and **one-line pitch**
  - **Setup scene** (2-3 sentences setting the stage)
  - **Conflict** (what's at stake)
  - **Key NPCs** (2-3 named NPCs with one-line personality/motivation)
  - **Possible complications** (2-3 twists the DM can deploy)
  - **Rewards** (suggested XP, gold, and 1-2 magic items)
- DM picks one → option to "expand" into a full session agenda
- "Regenerate" button per hook; "Mix & Match" to combine elements from different hooks

**AI Integration:**
- Uses campaign wiki context for consistency (existing `fetchCampaignWikiSnippet`)
- Ties into existing party data (character levels, classes)
- Generated hooks are copyable/editable; optionally saved as new Wiki article

**Depends on:** New `POST /api/ai/generate-hooks` route, `performAiCall`, existing
wiki context fetching, frontend QuestGeneratorPanel or modal

---

### 6.3 Name Generator

- [ ] **Status:** Planned

**Motivation:** One of the most common DM tasks — naming NPCs, taverns, towns,
shops, factions, and landmarks. A simple but high-utility generator.

**Scope:** Small

**Name Categories:**
| Category | Example Output |
|---|---|
| NPC (Dwarf) | Durgan Ironvein, Helga Stonebrow |
| NPC (Elf) | Caelynn Moonshadow, Tharion Starweaver |
| NPC (Human) | Aldric Vance, Mira Thornwell |
| Tavern | The Rusty Flagon, The Wandering Wisp |
| Town/City | Thornhaven, Silverfall Crossing |
| Shop | Glimmer & Gear (magic items), The Sharpened Edge (weapons) |
| Faction | The Iron Concord, Order of the Ashen Hand |
| Landmark | The Weeping Cairn, Thunderpeak Ridge |
| Monster Lair | Skullfang Den, The Rotwood Hive |

**Endpoint:** `POST /api/ai/generate-names`
- Body: `{ category, count (default 5), style/tone prompt (optional) }`
- Response: `{ names: ["...", "..."] }`

**UI:**
- Simple card in AI panel: category dropdown + count slider + "Generate" button
- Results displayed as chips; tap a chip to copy to clipboard
- "Generate More" appends results; "Replace" clears and regenerates

**Depends on:** New route, `performAiCall`, frontend name generator sub-component

---

### 6.4 Loot & Treasure Generator

- [ ] **Status:** Planned

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

- [ ] **Status:** Planned

**Motivation:** DMs can quickly scaffold wiki articles by describing what they
want. The AI fills in structured, markdown-formatted content in the appropriate
wiki category.

**Scope:** Small-Medium

**Workflow:**
1. DM opens Wiki → "Generate Article" button
2. Prompt: "Write an article about the city of Neverwinter" or "Describe the Thieves' Guild"
3. DM selects category (LORE, NPC, LOCATION, FACTION, etc.)
4. AI generates structured markdown with:
   - **Title** and **short description**
   - **History** section
   - **Notable Locations/NPCs** section
   - **Plot Hooks** section (for DM-eyes-only)
   - **Tags** auto-suggested from content
5. Pre-fills the wiki editor — DM reviews, edits, and publishes

**Endpoint:** `POST /api/ai/generate-wiki-article`
- Body: `{ prompt, category?, includeSections: string[] }`
- Response: `{ title, content (markdown), suggestedTags: string[] }`

**Campaign Awareness:**
- Existing wiki articles of the same category are included as context (summary only,
  not full content) to maintain consistency
- Example: if generating a location article, existing location wiki articles are
  sent as reference so the AI doesn't contradict established lore

**Depends on:** New route, `performAiCall`, wiki context fetching, WikiPanel
integration (pre-fill editor with generated content)

---

### 6.6 Location & Room Description Generator

- [ ] **Status:** Planned

**Motivation:** DMs need evocative, read-aloud descriptions for rooms,
buildings, and outdoor locations. AI generates prose ready for the table.

**Scope:** Small

**Description Types:**
- **Room:** "Describe a dusty alchemist's laboratory with bubbling vats"
- **Building:** "Describe the exterior of the Temple of Pelor in a small village"
- **Wilderness:** "Describe the approach to a dragon's lair in volcanic mountains"
- **Settlement:** "Describe the market square of Waterdeep at noon"

**Endpoint:** `POST /api/ai/generate-description`
- Body: `{ type ("room"|"building"|"wilderness"|"settlement"), prompt, tone ("ominous"|"peaceful"|"mysterious"|"grand"|"dilapidated") }`
- Response: `{ description (markdown), sensoryDetails: { sights, sounds, smells } }`

**UI:**
- "Generate Description" button in MapPanel and Wiki editor
- Result shown in chat panel with "Read Aloud" voice toggle (see §5.3)
- DM can copy, edit, or attach to a map marker

**Senses-Based Output:**
- Each description includes what the characters see, hear, and smell
- Optional "hidden detail" section (perception-check-gated) the DM can reveal

**Depends on:** New route, `performAiCall`, MapPanel/WikiPanel integration

---

### 6.7 Weather & Travel Montage Generator

- [ ] **Status:** Planned

**Motivation:** Overland travel is a D&D staple but narrating every day of a
long journey is tedious. AI generates day-by-day travelogues with weather,
scenery, and encounter hooks.

**Scope:** Small-Medium

**Input:**
- Route: "from Phandalin to Neverwinter"
- Terrain: forest, mountains, plains, swamp, desert
- Days of travel: 3-7
- Season: spring/summer/autumn/winter
- Party level (for encounter scaling)
- Optional: "dangerous route" / "peaceful route" toggle

**Output:**
- Day-by-day entries:
  ```
  Day 1 — Spring, 14°C / 57°F, Light Rain
  The road winds through the Neverwinter Wood. The canopy
  drips with last night's rainfall. Deer tracks are visible
  in the mud — fresh, perhaps an hour old.
  🎲 Encounter Hook: A merchant's wagon is stuck in the mud (DC 12 Strength)
  ```
- Each day includes: weather, temperature, scenery description, optional encounter hook
- Encounter hooks are lightweight (not full encounters) — just a prompt for the DM
- Optional: roll for random encounters using DMG wilderness encounter tables
- "Add to Session Agenda" button → appends travel log to current session

**Endpoints:**
- `POST /api/ai/generate-travel` — generate travel montage
- Body: `{ route, terrain, days, season, partyLevel, dangerous }`
- Response: `{ legs: [{ day, weather, temperature, description, hook }] }`

**Depends on:** New route, `performAiCall`, session agenda integration, weather
tables reference data

---

### 6.8 NPC Dialogue Phrase Generator

- [ ] **Status:** Planned

**Motivation:** In-session, DMs need quick flavorful lines for NPCs — combat
taunts, bargaining phrases, common sayings. Generating a bank of lines per NPC
saves improv pressure during live play.

**Scope:** Small

**Endpoint:** `POST /api/ai/generate-npc-phrases`
- Body: `{ npcId?, name, race, personality, phraseType ("greeting"|"threat"|"bargain"|"combat"|"rumor"|"farewell"), count (default 5) }`
- Response: `{ phrases: ["...", "..."] }`

**Phrase Types:**
- **Greeting:** "Welcome to the Lazy Lantern, travelers. Ale or trouble?"
- **Threat:** "You've got about three seconds to rethink that decision."
- **Bargain:** "Two hundred gold? Ha! I could buy a *real* adventurer for that."
- **Combat:** "Should've stayed in whatever hole you crawled out of!"
- **Rumor:** "Word is the old mill's been haunted since last midsummer."
- **Farewell:** "Keep your blade sharp and your wits sharper."

**UI Integration:**
- Button on NPC detail panel: "Generate Phrases"
- Results displayed as list of chips; tap to copy to clipboard
- "Insert into roleplay" → pushes a selected phrase into active NPC chat as a
  DM-sent NPC message

**Depends on:** New route, `performAiCall`, NPC model or profile context,
NPC detail panel UI

---

### 6.9 Image Generation Integration (NPC Portraits & Scene Art)

- [ ] **Status:** Planned

**Motivation:** Visuals enhance immersion. AI-generated NPC portraits, monster
art, and scene illustrations give the VTT tabletop presence.

**Scope:** Large

**Generators:**
1. **NPC Portraits:** "Generate a portrait of a female tiefling rogue with silver hair"
2. **Monster Art:** "Generate art for a young green dragon in a swamp"
3. **Scene Illustrations:** "Generate a moody illustration of a haunted crypt entrance"
4. **Token Art:** "Generate a top-down token for a dwarf cleric" (circular, suitable for VTT)

**Provider Support:**
- OpenAI DALL-E 3 (via existing API key)
- Stability AI / Stable Diffusion (via new provider option)
- Local Stable Diffusion (via Ollama-style local endpoint, future)

**Image Storage:**
- Generated images stored in `server/uploads/ai-generated/`
- Associated with the NPC, monster, map, or wiki article
- Image URL stored as `imageUrl` on the entity
- Max resolution: 1024×1024 (configurable)

**UI Flow:**
1. DM clicks "Generate Image" button on NPC form, monster form, or map detail
2. Prompt field pre-populated from entity data (race, class, description)
3. DM edits prompt, selects style (photorealistic, painted, sketch, comic)
4. Single generation → preview → DM accepts or regenerates
5. Accepted image becomes the entity's `imageUrl`

**Cost Awareness:**
- Each generation calls out estimated API cost before confirming
- DM sets monthly budget cap in AI settings
- Generation counter + cost tracker in AI settings panel

**Depends on:** Image generation API integration, `server/uploads/ai-generated/`
directory, entity image URL update, frontend generation UI (modal or panel
section)

---

### 6.10 AI Combat Tactician

- [ ] **Status:** Planned

**Motivation:** During combat, DMs manage many creatures simultaneously. An AI
tactician suggests actions for controlled monsters/NPCs in the encounter,
reducing cognitive load.

**Scope:** Medium-Large

**Workflow:**
1. DM is in an active encounter
2. Clicks "Suggest Action" on an EncounterParticipant (monster/NPC)
3. AI receives:
   - Monster/NPC statblock (actions, traits, spells, HP, AC)
   - Current encounter state (all participants, positions, HP, conditions)
   - Map context (if available: distances, terrain features)
4. AI returns a ranked list of 1-3 suggested actions:
   - **Recommended:** "Multiattack: Bite against the wounded wizard (low HP, low AC)"
   - **Alternative 1:** "Breath weapon — can hit 3 clustered characters"
   - **Alternative 2:** "Withdraw to cover behind the pillar and use Ranged attack on the cleric"
5. DM selects action → AI rolls relevant dice → applies results to encounter

**Tactical Reasoning:**
- Target prioritization: low HP, low AC, concentrating on a spell, highest threat
- Positioning: flanking, opportunity attacks, avoiding AoE clusters
- Resource economy: use limited-use abilities (breath weapons, spells) when impactful
- Flee/de-escalate: intelligent creatures retreat when bloodied

**Local Fallback:**
- Without AI, a rule-based fallback uses simple heuristics (attack nearest, flee
  at 25% HP) for basic auto-pilot

**Depends on:** Encounter context aggregation, `performAiCall`, encounter
participant action resolution, optional rule-based fallback

---

### 6.11 AI Session Co-Pilot (Live DM Assistant)

- [ ] **Status:** Planned

**Motivation:** During a live session, the DM juggles many things. An always-on
AI assistant that listens to the game state (or chat) can proactively offer
reminders, rules lookups, and suggestions — like a co-DM.

**Scope:** Large

**Triggers (proactive suggestions pushed to DM, not broadcast):**
- **Rule Reminder:** Chat mentions "grappled" → AI pushes: "Grappled: speed 0,
  ends if grappler is incapacitated. Escape DC = Athletics vs. Athletics/Acrobatics."
- **Forgotten Effect:** "3 rounds since Bless was cast on the fighter — expires
  in 7 rounds" (tie into condition tracker)
- **NPC Stat Lookup:** DM types "The guard captain..." → AI suggests relevant NPC
  or monster stats
- **Encounter Balance Warning:** Party is level 2, but the DM just added a CR 8
  monster → AI warns "This encounter is Deadly — expected TPK"
- **Lore Consistency Check:** DM describes a location that contradicts existing
  wiki → AI suggests "The wiki says the castle was burned down in 1487 DR"

**UI:**
- Collapsible sidebar panel: "Co-Pilot"
- Suggestions appear as cards (dismissable, expandable)
- DM-only — never visible to players
- Sound/vibration alert for high-priority warnings
- Rate-limited to avoid spamming (max 1 suggestion per 30 seconds)

**Optional "Auto-Rule" Mode:**
- When a player in chat asks a rules question (e.g., "How far can I jump?"),
  the co-pilot auto-replies in the DM's private panel with the relevant rule
- DM can choose to forward the answer to public chat or ignore

**Depends on:** Chat event listener + debounce, `findRelevantRules` integration,
encounter/condition state monitoring, wiki consistency checker, CoPilotPanel
component, websocket events for DM-private messages

