# Project Context - Section 4.2 Complete

## Environment
- Language: JavaScript (Node.js 22, React 18)
- Build: Vite 5 (client) / Node (server)
- Test: No frontend unit tests (project pattern)
- Package Manager: npm, Docker, Prisma 5 (SQLite)

## What Was Built - Section 4.2: Character Builder Wizard

### Backend Changes
- **`server/src/routes/reference.js`**: `GET /api/reference/search` now supports `summary=false` query param. When set, returns full item data (not summarized) — needed by the wizard for complete race/class data (traits, features, proficiencies, ability bonuses, equipment).

### Frontend — CharacterBuilderWizard.jsx (~960 lines)
A 7-step guided character creation wizard with D&D 5e rules, mobile-first (44px min touch targets):

| Step | Content |
|------|---------|
| **1. Name & Race** | Name input + 5etools race search → full detail via `/api/reference/detail` → racial traits, ability bonuses, speed, size, subrace selection |
| **2. Class** | 5etools class search → full detail → hit die, proficiencies (armor/weapons/tools/saves), skill choices, level 1 features, spellcasting detection |
| **3. Ability Scores** | Three methods: Standard Array (click-to-assign), Point Buy (27pts, 8-15 range), Rolled (4d6 drop lowest, re-roll). Racial+subrace bonuses applied. |
| **4. Skills** | Class auto-proficiencies shown. Skill choices from `startingProficiencies.skills[{choose, from}]`. 18 D&D skills grid with limited picks. |
| **5. Equipment** | Class starting equipment auto-loaded. 5etools item search for additional gear. Quantity adjust + remove. |
| **6. Spells** | Only for spellcasting classes (detected via classFeatures). Cantrip/Level 1 tabs. 5etools spell search. Shows spellcasting ability, save DC, attack bonus. |
| **7. Review & Create** | Full summary: ability scores (base+racial), skills, equipment, HP (max hit die + CON), spellcasting. Create button → POST /api/characters → navigates to sheet. |

**Navigation**: Progress dots, step labels, back/next buttons, step counter.

### CharacterList.jsx Integration
- Removed simple create form (name/race/class fields)
- Imported `CharacterBuilderWizard`, shows it when "Create" is clicked
- `onComplete` callback adds character to list + navigates to sheet
- Button icon changed to `Wand2` icon

### Deployment
- Client build verified (npm run build — 1802 modules, 4.61s)
- Server syntax verified (node -c)
