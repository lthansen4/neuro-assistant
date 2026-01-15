# Breaking Changes Risk Assessment

## ⚠️ Risk Level: **HIGH** for `due_date` → `due_at` rename

### Summary
Renaming `due_date` to `due_at` would require changes across **5 code layers** and break **active features**. **Recommendation: KEEP `due_date`**.

---

## Detailed Analysis

### 1. Database Column References

**Risk Level: 🔴 CRITICAL**

#### Direct SQL References:
- `packages/db/migrations/0001_unified.sql:49` - Column definition
- `packages/db/migrations/0001_unified.sql:61-62` - **Two indexes** reference `due_date`:
  ```sql
  create index idx_assignments_user_due on assignments(user_id, due_date);
  create index idx_assignments_course_due on assignments(course_id, due_date);
  ```

**Impact**: Indexes would need to be dropped and recreated, causing:
- Temporary query performance degradation during migration
- Potential downtime if not handled carefully

---

### 2. TypeScript/Drizzle ORM Schema

**Risk Level: 🟡 MEDIUM** (but requires coordinated change)

#### Files Affected:
- `packages/db/src/schema.ts:58` - Schema definition
  ```typescript
  dueDate: timestamp("due_date", { withTimezone: true })
  ```
- `packages/db/src/schema.ts:70-71` - Index definitions using `t.dueDate`
  ```typescript
  idx_user_due: index("idx_assignments_user_due").on(t.userId, t.dueDate),
  idx_course_due: index("idx_assignments_course_due").on(t.courseId, t.dueDate)
  ```

**Impact**: 
- Drizzle maps `dueDate` (TypeScript) ↔ `due_date` (database)
- If we rename DB column but not the TypeScript field, ORM breaks
- Must change both simultaneously
- All code using `assignment.dueDate` would need updates

---

### 3. API Endpoints

**Risk Level: 🟡 MEDIUM**

#### Files Affected:
- `apps/api/src/routes/upload.ts`:
  - Line 225: JSON payload type uses `due_date`
  - Line 236: Type definition uses `due_date`
  - Line 316: References `a.due_date` from parsed payload
  - Line 327: Uses `eq(schema.assignments.dueDate, ...)` for deduplication
  - Line 339: Inserts with `dueDate: due`
  
- `apps/api/src/routes/quickAdd.ts`:
  - Line 199: Uses `body.parsed.dueDateISO` (different field, but related)
  - Line 207: Inserts with `dueDate: due`

**Impact**: 
- API endpoints would break if payload format changes
- Deduplication logic relies on `dueDate` field comparison
- Breaking change for any API consumers (if external)

---

### 4. Frontend Components

**Risk Level: 🟡 MEDIUM**

#### Files Affected:
- `apps/web/components/SyllabusReview.tsx`:
  - Line 16: Type definition uses `due_date`
  - Line 67: State initialization uses `a.due_date`
  - Lines 142, 265, 267, 325, 327: Multiple references to `due_date` in UI state and form handling

- `apps/web/app/upload/review/page.tsx`:
  - Line 198-200: Displays `item.payload.due_date`

- `apps/web/components/SyllabusUploader.tsx`:
  - Line 16: Type definition uses `due_date`

**Impact**: 
- Frontend would break if API payload format changes
- User-facing features (syllabus upload, review) would fail
- Form state management would break

---

### 5. AI/JSON Schema Definitions

**Risk Level: 🟡 MEDIUM**

#### Files Affected:
- `apps/web/lib/ai.ts:29`:
  ```typescript
  due_date: z.string().nullable(),  // Zod schema for OpenAI parsing
  ```

**Impact**: 
- AI parsing would break if schema changes
- All existing parsed syllabi would have wrong field names
- Would need to reprocess all stored parse results or migrate them

---

### 6. Seed Scripts

**Risk Level: 🟢 LOW** (test/dev only)

#### Files Affected:
- `scripts/seed.ts:47, 57` - Uses `dueDate` in seed data

**Impact**: Only affects development/testing, but still needs update

---

## Other Potential Breaking Changes

### Calendar Events
**Risk: 🟢 LOW** - No column renames proposed, only additions

### Courses (`schedule_json`, `office_hours_json`, `grade_weights_json`)
**Risk: 🟢 LOW** - These are JSONB fields, no renames proposed
- Can be queried/extended without breaking existing code
- Proposed changes are additive (templates table, not replacing JSON)

### Assignments (`effort_estimate_minutes`)
**Risk: 🟢 LOW** - Already correct name, no change needed
- Current: `effort_estimate_minutes` ✅
- Proposed: `estimated_effort_minutes` ❌ (would be wrong direction)

---

## Recommendation

### ❌ DO NOT rename `due_date` → `due_at`

**Reasons:**
1. **High risk, low reward**: Semantic clarity improvement doesn't justify breaking 5 code layers
2. **Active usage**: Field is used in working features (Quick Add, Syllabus Upload, Deduplication)
3. **API contract**: Changing field name breaks API contracts (even if internal)
4. **Migration complexity**: Requires coordinated changes across DB, ORM, API, Frontend, AI schemas
5. **Rollback difficulty**: If something breaks, hard to rollback cleanly

### ✅ Alternative: Keep `due_date`, add better naming conventions going forward

**Strategy:**
- Keep `due_date` as-is (it's already `timestamptz`, which is correct)
- For **new** fields, use `_at` suffix for timestamps (e.g., `created_at`, `updated_at`)
- Document naming convention: `_date` for dates, `_at` for timestamps
- The semantic difference is minor (both represent "when something is due")

### ✅ What CAN be safely changed:

1. **Calendar Split (Migration 0008)**: ✅ SAFE
   - Adds new tables, doesn't rename existing ones
   - Can use compatibility views for transition

2. **Assignments Indexes (Migration 0009)**: ✅ SAFE  
   - Add new indexes, don't rename columns
   - Can add `(user_id, status, due_date)` index without breaking anything

3. **Grading Components (Migration 0010)**: ✅ SAFE
   - Add new normalized table
   - Keep `grade_weights_json` for backward compatibility
   - Dual-write pattern during transition

---

## Migration Risk Summary

| Change | Risk Level | Breaking? | Recommendation |
|--------|-----------|-----------|----------------|
| `due_date` → `due_at` | 🔴 HIGH | ✅ YES | ❌ **DO NOT DO** |
| Calendar templates (new table) | 🟢 LOW | ❌ NO | ✅ Safe to proceed |
| Assignment indexes (add) | 🟢 LOW | ❌ NO | ✅ Safe to proceed |
| Grading components (new table) | 🟢 LOW | ❌ NO | ✅ Safe to proceed |
| `schedule_json` (keep + extend) | 🟢 LOW | ❌ NO | ✅ Safe to proceed |

---

## Conclusion

**The `due_date` → `due_at` rename is a HIGH-RISK change that would break active features.** The current name is functional and semantically acceptable. The benefit (slightly better naming convention) does not justify the cost (breaking 5+ code layers, migration complexity, rollback risk).

**Recommendation**: Proceed with migrations 0008-0010, but **skip the `due_date` rename**. Focus on the high-value changes (calendar templates, indexes, grading components) that are additive and non-breaking.



