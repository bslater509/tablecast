# Mission: Implement Section 1 - VTT & Combat Enhancements

## M1: Prisma Schema & Backend | agent:Worker
### T1.1: Update Prisma Schema
- [x] S1.1.1: Add walls to Map, conditions/vision/aura to Token, conditions/deathSaves to EncounterParticipant | size:S
- [x] S1.1.2: Generate Prisma migration via npx prisma migrate dev | size:S

### T1.2: Update Backend Routes | depends:T1.1
- [x] S1.2.1: Update maps.js to accept new Token fields (conditions, visionRadius, aura) | size:S
- [x] S1.2.2: Update encounters.js to accept conditions/deathSaves on Participant + turn expiry | size:S
- [x] S1.2.3: Update socket.js token:create handler for new fields | size:XS

## M2: Client-Side Map Enhancements
### T2.1: Measurement/Ruler Tool | agent:Worker
- [x] S2.1.1: Add ruler state + handlers to useMapData.js | size:S
- [x] S2.1.2: Add ruler rendering to MapCanvas.jsx draw loop | size:S
- [x] S2.1.3: Add ruler button to MapToolbar.jsx | size:XS

### T2.2: Token Auras & Condition Rings | agent:Worker | depends:T1.1
- [x] S2.2.1: Add aura/condition ring rendering to MapCanvas.jsx draw loop | size:M
- [x] S2.2.2: Add aura controls to token details | size:S

### T2.3: Dynamic Lighting / Line-of-Sight | agent:Worker | depends:T1.1
- [x] S2.3.1: Create raycasting utility (lines intersection, point-in-polygon) | size:S
- [x] S2.3.2: Add vision polygon rendering to MapCanvas.jsx | size:M
- [x] S2.3.3: Add light/darkvision buttons to MapToolbar | size:XS

## M3: Encounter Enhancements | depends:M1
### T3.1: Death Saves Tracker | agent:Worker
- [x] S3.1.1: Add death save state to encounter turn logic | size:S
- [x] S3.1.2: Add death save UI to EncountersPanel.jsx | size:M

### T3.2: Condition Tracker with Auto-Expiry | agent:Worker
- [x] S3.2.1: Add condition management to EncountersPanel.jsx | size:M
- [x] S3.2.2: Add condition expiry to turn advancement (backend) | size:S

## M4: Verification | agent:Reviewer | depends:M2,M3
- [x] S4.1: Run Vite build | size:S
- [x] S4.2: Run LSP diagnostics | size:S
- [x] S4.3: Verify git status and push | size:S
