# Migration 0008: Schema Updates Summary

## ✅ Completed Tasks

### 1. Updated Drizzle Schema (`packages/db/src/schema.ts`)

#### New Tables Added:

**`calendarEventTemplates`** - Recurring event patterns
```typescript
export const calendarEventTemplates = pgTable("calendar_event_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  eventType: eventTypeEnum("event_type").notNull(),
  rrule: text("rrule"),
  dayOfWeek: smallint("day_of_week"),
  startTimeLocal: time("start_time_local").notNull(),
  endTimeLocal: time("end_time_local").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  location: text("location"),
  color: varchar("color", { length: 32 }),
  isMovable: boolean("is_movable").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

**`calendarEventsNew`** - Event instances
```typescript
export const calendarEventsNew = pgTable("calendar_events_new", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  templateId: uuid("template_id").references(() => calendarEventTemplates.id),
  title: text("title").notNull(),
  eventType: eventTypeEnum("event_type").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  isMovable: boolean("is_movable").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

#### Schema Changes:

1. **Added imports**: `smallint`, `varchar` for new field types
2. **Updated `courseOfficeHours`**: Added documentation comment explaining it's now a VIEW
3. **Marked `calendarEvents` as LEGACY**: Added comment for backward compatibility during transition

---

### 2. View Handling Explanation

**Question**: Can we keep the existing `courseOfficeHours` definition as-is?

**Answer**: ✅ **YES** - The existing definition works perfectly!

**Why**: 
- Drizzle ORM's `pgTable()` doesn't distinguish between tables and views
- The view has INSTEAD OF triggers making it writeable
- Existing code continues to work without changes
- TypeScript types remain compatible

**See**: `docs/SCHEMA_VIEW_HANDLING.md` for detailed explanation.

---

### 3. Verification Script Created

**File**: `scripts/verify-migration-0008.ts`

**What it verifies**:

1. **Structure Verification**
   - ✅ `calendar_event_templates` table exists with all required columns
   - ✅ `course_office_hours` view exists with correct columns
   - ✅ INSTEAD OF triggers exist (insert, update, delete)

2. **Data Integrity Verification**
   - ✅ Row counts match between `course_office_hours_old` and `calendar_event_templates`
   - ✅ View returns same count as underlying templates
   - ✅ Sample data comparison (content matches)

3. **View Writability Verification**
   - ✅ View can be queried (SELECT works)
   - ✅ INSTEAD OF triggers are correctly configured
   - ✅ All three triggers (insert, update, delete) exist

**Usage**:
```bash
cd "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant"
npx tsx scripts/verify-migration-0008.ts
```

---

## Schema Type Mapping

### Database → TypeScript Field Names

| Database Column | TypeScript Field | Notes |
|----------------|------------------|-------|
| `event_type` | `eventType` | Uses existing enum |
| `start_time_local` | `startTimeLocal` | Local time (no timezone) |
| `end_time_local` | `endTimeLocal` | Local time (no timezone) |
| `start_at` | `startAt` | Timestamptz for instances |
| `end_at` | `endAt` | Timestamptz for instances |
| `template_id` | `templateId` | FK to templates |
| `day_of_week` | `dayOfWeek` | smallint (0=Sun, 6=Sat) |

---

## Backward Compatibility

### ✅ Preserved

1. **`courseOfficeHours` schema definition** - Works as-is (view with triggers)
2. **Existing code** - No changes required in `upload.ts` or other files
3. **TypeScript types** - All existing types remain valid

### ⚠️ Notes

1. **Index definitions** - Informational only (indexes exist on underlying table)
2. **Foreign key constraints** - Enforced on underlying table, not view
3. **Auto-generated IDs** - Handled by trigger function, not Drizzle's defaultRandom()

---

## Next Steps

1. ✅ **Schema updated** - New tables defined
2. ✅ **View handling documented** - Explained why existing definition works
3. ✅ **Verification script created** - Ready to test migration
4. ⏭️ **Run migration** - Execute `0008_calendar_split_CORRECTED.sql`
5. ⏭️ **Run verification** - Execute `verify-migration-0008.ts`
6. ⏭️ **Update application code** - Gradually migrate to new tables (optional, backward compatible)

---

## Files Modified

1. ✅ `packages/db/src/schema.ts` - Added new tables, updated comments
2. ✅ `docs/SCHEMA_VIEW_HANDLING.md` - View handling explanation
3. ✅ `docs/MIGRATION_0008_SCHEMA_UPDATES.md` - This file
4. ✅ `scripts/verify-migration-0008.ts` - Verification script

---

## Testing Checklist

- [ ] Run migration: `0008_calendar_split_CORRECTED.sql`
- [ ] Run verification: `npx tsx scripts/verify-migration-0008.ts`
- [ ] Test existing code: Verify `upload.ts` still works with `courseOfficeHours`
- [ ] Test new tables: Try inserting into `calendarEventTemplates` directly
- [ ] Test view writes: Verify INSERT/UPDATE/DELETE through view works

---

**Status**: ✅ Schema updates complete and ready for migration







