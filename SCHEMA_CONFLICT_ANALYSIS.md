# Schema Conflict Analysis: Approved Canonical vs Current Implementation

## Executive Summary

**Status:** ⚠️ **SIGNIFICANT CONFLICTS DETECTED**

The approved canonical schema introduces several breaking changes that conflict with existing TypeScript definitions and database migrations. A migration strategy is required.

---

## 1. Users Table

### Conflicts
| Field | Approved | Current | Status |
|-------|----------|---------|--------|
| `target_study_ratio` | Numeric(4,2) | Numeric(4,2) | ✅ **MATCH** |
| `timezone` | Varchar(64) | Text | ⚠️ **MINOR** (text is compatible) |
| `updated_at` | Timestamptz | ❌ Missing | ❌ **MISSING** |
| `clerk_user_id` | Not mentioned | Text (unique) | ⚠️ **EXTRA** (likely needed) |

**Impact:** Low - `updated_at` can be added without breaking changes.

---

## 2. Courses Table

### Conflicts
| Field | Approved | Current | Status |
|-------|----------|---------|--------|
| `code` | Varchar | ❌ Missing | ❌ **MISSING** |
| `term` | Varchar | ❌ Missing | ❌ **MISSING** |
| `year` | Int | ❌ Missing | ❌ **MISSING** |
| `credits` | Numeric(3,1) | Integer | ❌ **TYPE MISMATCH** |
| `grade_weights_json` | JSONB | JSONB | ✅ **MATCH** |
| `professor` | Not mentioned | Text | ⚠️ **EXTRA** (may be deprecated) |
| `color_code` | Not mentioned | Text | ⚠️ **EXTRA** (may be deprecated) |
| `schedule_json` | Not mentioned | JSONB | ⚠️ **EXTRA** (may move to templates) |
| `office_hours_json` | Not mentioned | JSONB | ⚠️ **EXTRA** (may move to templates) |

**Impact:** High - Missing required fields (`code`, `term`, `year`) and type mismatch on `credits`.

**Code References:**
- `apps/api/src/routes/upload.ts` - Uses `courses.name` for upsert
- `apps/web/app/upload/actions.ts` - Creates courses with `name`, `professor`, `credits`
- `apps/api/src/routes/quickAdd.ts` - May reference courses

---

## 3. Assignments Table

### Conflicts
| Field | Approved | Current | Status |
|-------|----------|---------|--------|
| `due_at` | Timestamptz | `due_date` (Timestamptz) | ❌ **NAME MISMATCH** |
| `status` | Varchar: ['Inbox', 'Planned', 'In_Progress', 'Done'] | Enum: ['Inbox', 'Scheduled', 'Locked_In', 'Completed'] | ❌ **BREAKING CHANGE** |
| `estimated_effort_minutes` | Int | `effort_estimate_minutes` (Int) | ❌ **NAME MISMATCH** |
| `source` | Varchar | ❌ Missing | ❌ **MISSING** |
| `updated_at` | Timestamptz | ❌ Missing | ❌ **MISSING** |
| `graded` | Not mentioned | Boolean | ⚠️ **EXTRA** |
| `points_earned` | Not mentioned | Numeric(10,2) | ⚠️ **EXTRA** |
| `points_possible` | Not mentioned | Numeric(10,2) | ⚠️ **EXTRA** |
| `weight_override` | Not mentioned | Numeric(5,2) | ⚠️ **EXTRA** |
| `submitted_at` | Not mentioned | Timestamptz | ⚠️ **EXTRA** |

**Impact:** **CRITICAL** - Field name changes and status enum values are completely different.

**Code References:**
- `packages/db/src/schema.ts:56` - `dueDate` field
- `packages/db/src/schema.ts:58` - `effortEstimateMinutes` field
- `packages/db/src/schema.ts:60` - `status: assignmentStatusEnum` with values ['Inbox', 'Scheduled', 'Locked_In', 'Completed']
- `apps/api/src/routes/upload.ts:350` - Sets `status: 'Inbox'`
- `apps/api/src/routes/quickAdd.ts:210` - Sets `status: "Inbox"`
- `scripts/seed.ts:50,60` - Uses `status: "Inbox"`
- All queries using `dueDate` or `effortEstimateMinutes` will break

---

## 4. Calendar Events - Two-Layer Model

### CRITICAL: Missing Template Layer

**Approved Schema:**
- **Layer 1 (Templates):** `event_templates` table with `rrule`, `day_of_week`, `start_time_local`, `end_time_local`
- **Layer 2 (Instances):** `calendar_events` with `template_id` FK, `start_at`, `end_at`

**Current Implementation:**
- ❌ **No template table exists**
- Single `calendar_events` table with `startTime`, `endTime` (not `start_at`, `end_at`)
- No `template_id` field
- Uses `type` enum: ['Class', 'Work', 'OfficeHours', 'Focus', 'Chill', 'Other']
- Has `isMovable`, `metadata` fields

**Impact:** **CRITICAL** - Complete architectural change required.

**Code References:**
- `packages/db/src/schema.ts:88-103` - `calendarEvents` table definition
- `apps/api/src/routes/upload.ts:392-433` - Creates calendar events directly (no templates)
- `apps/web/components/Calendar.tsx` - Consumes calendar events
- `apps/web/app/(protected)/calendar/page.tsx` - Displays events
- `packages/db/migrations/0003_calendar_events_dedupe_index.sql` - Index on current structure

---

## 5. Status Enum Values Conflict

### Assignment Status

**Approved:** `['Inbox', 'Planned', 'In_Progress', 'Done']`  
**Current:** `['Inbox', 'Scheduled', 'Locked_In', 'Completed']`

**Mapping Question:**
- `Inbox` → `Inbox` ✅ (matches)
- `Scheduled` → `Planned`? (semantic difference)
- `Locked_In` → `In_Progress`? (semantic difference)
- `Completed` → `Done`? (semantic difference)

**Impact:** All existing data with status values will need migration.

---

## 6. Field Naming Conventions

### Approved Standard: `_at` suffix for timestamps

**Conflicts:**
- `due_date` → `due_at` ❌
- `start_time` → `start_at` ❌
- `end_time` → `end_at` ❌
- `created_at` → `created_at` ✅ (already correct)
- `updated_at` → Missing in many tables ❌

**Impact:** Medium - Requires code changes throughout codebase.

---

## 7. Missing Fields Summary

### Required by Approved Schema:
1. **Users:** `updated_at`
2. **Courses:** `code`, `term`, `year`
3. **Assignments:** `source`, `updated_at`
4. **Calendar Events:** `template_id`, rename `startTime`→`start_at`, `endTime`→`end_at`
5. **Calendar Templates:** Entire table missing

### Extra Fields in Current (Not in Approved):
1. **Courses:** `professor`, `color_code`, `schedule_json`, `office_hours_json`
2. **Assignments:** `graded`, `points_earned`, `points_possible`, `weight_override`, `submitted_at`
3. **Calendar Events:** `metadata` (may be kept for flexibility)

---

## 8. Type Mismatches

| Table | Field | Approved | Current | Impact |
|-------|-------|----------|---------|--------|
| Courses | `credits` | Numeric(3,1) | Integer | ❌ **BREAKING** |
| Users | `timezone` | Varchar(64) | Text | ⚠️ **MINOR** (compatible) |

---

## 9. Migration Strategy Recommendations

### Phase 1: Add Missing Fields (Non-Breaking)
1. Add `updated_at` to `users`, `courses`, `assignments`
2. Add `code`, `term`, `year` to `courses` (nullable initially)
3. Add `source` to `assignments` (nullable initially)
4. Change `credits` from integer to numeric(3,1)

### Phase 2: Create Template Layer
1. Create `event_templates` table
2. Migrate recurring events from `calendar_events` to templates
3. Add `template_id` to `calendar_events` (nullable initially)

### Phase 3: Rename Fields (Breaking)
1. Create migration to rename:
   - `due_date` → `due_at`
   - `effort_estimate_minutes` → `estimated_effort_minutes`
   - `start_time` → `start_at`
   - `end_time` → `end_at`
2. Update all TypeScript code references
3. Update all API endpoints

### Phase 4: Status Enum Migration
1. Create new status enum or varchar field
2. Migrate existing data:
   - `Inbox` → `Inbox`
   - `Scheduled` → `Planned` (or map based on business logic)
   - `Locked_In` → `In_Progress`
   - `Completed` → `Done`
3. Update all code references
4. Drop old enum

### Phase 5: Cleanup
1. Decide on extra fields (keep or deprecate)
2. Update indexes for new field names
3. Remove deprecated fields if not keeping

---

## 10. Code Impact Assessment

### High Impact Files (Require Updates):
1. `packages/db/src/schema.ts` - Complete rewrite needed
2. `apps/api/src/routes/upload.ts` - Field name changes
3. `apps/api/src/routes/quickAdd.ts` - Field name changes
4. `apps/web/app/upload/actions.ts` - Field name changes
5. `apps/web/components/Calendar.tsx` - Event structure changes
6. All migration files - Need new migrations

### Medium Impact Files:
1. `scripts/seed.ts` - Update field names
2. `apps/api/src/routes/dashboard.ts` - May reference assignments
3. Any other files querying assignments or calendar_events

---

## 11. Immediate Action Items

1. ✅ **Document conflicts** (this file)
2. ⏳ **Decide on extra fields** - Keep `professor`, `graded`, etc. or remove?
3. ⏳ **Create migration plan** - Phased approach
4. ⏳ **Update TypeScript schema** - After migration plan approved
5. ⏳ **Update API endpoints** - After schema changes
6. ⏳ **Update frontend components** - After API changes

---

## 12. Questions for Product/Design

1. **Status values:** Should `Scheduled` map to `Planned` or a different value?
2. **Extra fields:** Keep `professor`, `graded`, `points_earned`, etc. or remove?
3. **Template migration:** How should existing `calendar_events` be migrated to templates?
4. **Backward compatibility:** Do we need to support both old and new field names during transition?
5. **Course code:** Is `code` required or optional? What format? (e.g., "MATH 101")

---

## Summary

**Total Conflicts:** 15+ breaking changes  
**Critical:** 5 (status enum, field renames, template layer, credits type, missing required fields)  
**High Impact:** 3 (assignments field names, calendar structure, status values)  
**Medium Impact:** 4 (missing optional fields, type mismatches)  
**Low Impact:** 3 (extra fields, minor type differences)

**Recommendation:** Implement phased migration strategy to avoid breaking production.





