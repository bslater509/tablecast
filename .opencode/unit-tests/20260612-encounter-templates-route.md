# Unit Test Record: encounter-templates.js

## Target File
`server/src/routes/encounter-templates.js`

## Test File (DELETED)
`server/src/routes/__tests__/encounter-templates.isolated.test.js`

## Test Summary
15 isolated tests, all passed:
- POST / creates a template ✓
- POST / rejects missing name ✓
- POST / rejects invalid difficulty ✓
- GET / lists all templates ✓
- GET / filters by difficulty ✓
- GET /:id returns a template ✓
- GET /:id returns 404 for missing ✓
- PUT /:id updates a template ✓
- PUT /:id returns 404 for missing ✓
- DELETE /:id deletes a template ✓
- DELETE /:id returns 404 for missing ✓
- POST /:id/apply creates encounter from template ✓
- POST /:id/apply returns 404 for missing template ✓
- POST /:id/apply accepts name and mapId overrides ✓
- POST /:id/apply returns 400 if no mapId available ✓

## Test Result
- Status: pass
- Session: ses_T5_T9
- Timestamp: 2026-06-12T06:57:15.000Z
