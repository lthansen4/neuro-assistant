# Migration 0008 Review: Calendar Split

## ⚠️ Issues Found

### 1. **CRITICAL: Event Type Enum Mismatch**

**Problem**: Migration uses lowercase event types, but existing enum uses TitleCase.

**Existing Enum** (`event_type`):
```sql
CREATE TYPE event_type AS ENUM ('Class','Work','OfficeHours','Focus','Chill','Other');
```

**Migration Uses**:
```sql
CHECK (event_type IN ('class','office_hours','focus','chill','work','other'))
```

**Impact**: 
- Constraint violations when inserting data
- Existing `calendar_events` use 'Class', 'OfficeHours', etc.
- New templates won't match existing event types

**Fix**: Use the existing enum type OR update enum values (breaking change).

---

### 2. **CRITICAL: course_office_hours Table Replacement**

**Problem**: Migration does `DROP VIEW IF EXISTS course_office_hours` but `course_office_hours` is currently a **TABLE**, not a view.

**Current State**:
- `course_office_hours` is a physical table
- Has data inserted by `apps/api/src/routes/upload.ts` (lines 297, 306)
- Has index: `idx_office_hours_course_day`

**Migration Attempts**:
```sql
DROP VIEW IF EXISTS course_office_hours;  -- Won't work, it's a TABLE
CREATE VIEW course_office_hours AS ...    -- Will fail if table exists
```

**Impact**: 
- Migration will fail if table has data
- Existing code that inserts into `courseOfficeHours` table will break
- TypeScript schema expects a table, not a view

**Fix**: Need to:
1. Migrate existing `course_office_hours` table data to `calendar_event_templates`
2. Rename old table to `course_office_hours_old` (for safety)
3. Create view for backward compatibility
4. Update TypeScript schema to reflect view

---

### 3. **Missing user_id in calendar_event_templates**

**Problem**: View selects `user_id` but `calendar_event_templates` doesn't have a direct `user_id` column.

**View Code**:
```sql
SELECT
  id,
  user_id,  -- ❌ This column doesn't exist in templates table
  course_id,
  ...
FROM calendar_event_templates
```

**Fix**: Need to either:
- Add `user_id` to `calendar_event_templates` (recommended - denormalized for performance)
- OR join with courses table in the view

---

### 4. **Field Mismatch: office_hours table structure**

**Existing `course_office_hours` Table**:
```sql
- id (uuid)
- course_id (uuid) 
- day_of_week (integer, NOT NULL)
- start_time (time, NOT NULL)
- end_time (time, NOT NULL)
- location (text)
-- NO user_id
-- NO event_type
-- NO rrule, start_date, end_date, color, etc.
```

**View Attempts to Return**:
```sql
- id
- user_id (doesn't exist)
- course_id
- event_type ('office_hours')
- rrule
- day_of_week
- start_time_local (different name)
- end_time_local (different name)
- start_date
- end_date
- location
- color
- is_movable
- metadata
- created_at
- updated_at
```

**Fix**: View needs to map existing columns correctly and provide defaults for new fields.

---

### 5. **Questionable: due_at in calendar_events_new**

**Observation**: `calendar_events_new` has a `due_at` field, which is unusual.

**Questions**:
- Is this for assignments linked to events?
- Should this reference `assignments.due_date` instead?
- Or is this for event-specific deadlines?

**Recommendation**: Clarify purpose or remove if not needed.

---

## Recommended Fixes

### Fix 1: Use Existing Enum

**Option A**: Use the existing enum (recommended)
```sql
-- In calendar_event_templates
event_type event_type NOT NULL,  -- Use existing enum type

-- In calendar_events_new  
event_type event_type NOT NULL,  -- Use existing enum type
```

**Option B**: Create migration to update enum (breaking, but aligns with new naming)
```sql
-- Add new values to enum
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'office_hours';
-- Then update existing 'OfficeHours' to 'office_hours' in data
```

### Fix 2: Proper course_office_hours Migration

```sql
-- Step 1: Add user_id to templates (if not already present in your schema)
ALTER TABLE calendar_event_templates ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);

-- Step 2: Migrate existing data from course_office_hours table to templates
INSERT INTO calendar_event_templates (
  user_id, course_id, event_type, day_of_week, 
  start_time_local, end_time_local, location
)
SELECT 
  c.user_id,  -- Get from courses table
  coh.course_id,
  'OfficeHours'::event_type,  -- Use existing enum value
  coh.day_of_week,
  coh.start_time,
  coh.end_time,
  coh.location
FROM course_office_hours coh
JOIN courses c ON c.id = coh.course_id
ON CONFLICT DO NOTHING;

-- Step 3: Rename old table (keep for rollback safety)
ALTER TABLE course_office_hours RENAME TO course_office_hours_old;

-- Step 4: Create compatibility view
CREATE VIEW course_office_hours AS
SELECT
  id,
  (SELECT user_id FROM courses WHERE id = course_id) as user_id,  -- Derived
  course_id,
  'OfficeHours'::event_type as event_type,  -- Use enum
  rrule,
  day_of_week,
  start_time_local as start_time,  -- Map to old name
  end_time_local as end_time,      -- Map to old name
  NULL::date as start_date,         -- New field, default NULL
  NULL::date as end_date,           -- New field, default NULL
  location,
  NULL::varchar as color,           -- New field, default NULL
  is_movable,
  metadata,
  created_at,
  updated_at
FROM calendar_event_templates
WHERE event_type = 'OfficeHours'::event_type;  -- Use enum
```

### Fix 3: Update TypeScript Schema

If converting to a view, need to update:
```typescript
// Old (table):
export const courseOfficeHours = pgTable("course_office_hours", {...});

// New (view - if Drizzle supports views, or keep as table with different source):
// Option A: Keep as table but point to templates
// Option B: Use manual queries if Drizzle doesn't support views well
```

---

## Migration Strategy

### Safe Migration Path:

1. **Create new tables** (non-breaking)
2. **Backfill data** from existing sources
3. **Dual-write** during transition (write to both old and new)
4. **Create compatibility view** (for reads)
5. **Update application code** to use new tables
6. **Eventually drop** old table/view

---

## Questions to Clarify

1. **Event type naming**: Do you want to keep existing enum values ('Class', 'OfficeHours') or migrate to lowercase ('class', 'office_hours')?

2. **course_office_hours compatibility**: Should the view be read-only or support INSERT/UPDATE? If writeable, need INSTEAD OF triggers.

3. **user_id in templates**: Should templates store `user_id` directly (denormalized) or derive it from `course_id` (normalized)?

4. **due_at in events**: What is the purpose of `due_at` in `calendar_events_new`? Should this reference assignments?

5. **Migration timeline**: Do you need immediate backward compatibility, or can we do a phased rollout?

---

## Recommended Next Steps

1. **Fix enum mismatch** - Use existing enum or plan enum migration
2. **Add data migration** - Migrate existing `course_office_hours` table data
3. **Add user_id** - Add to templates table for direct access
4. **Update view** - Properly map old table structure to new view
5. **Test compatibility** - Ensure existing code still works
6. **Update TypeScript** - Reflect schema changes



