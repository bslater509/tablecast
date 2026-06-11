# Sync Issues (Unresolved Only)

*All M5 Shopping & Economy System defects have been resolved:*
- SYNC-3 (field name mismatches): ✅ Fixed — all routes use correct Prisma field names
- SYNC-4 (sell API contract mismatch): ✅ Fixed — backend now accepts `itemName` matching frontend
- SYNC-5 (missing haggle endpoint): ✅ Fixed — haggle + buy-custom endpoints added
- SYNC-6 (shop edit form fields ignored): ✅ Fixed — PUT /:id accepts description, markup, isActive
- SYNC-7 (buy response missing shop data): ✅ Fixed — both buy and sell return `shop` for UI refresh

*No unresolved sync issues.*
