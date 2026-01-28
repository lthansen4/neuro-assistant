# Handling Views in Drizzle Schema - Migration 0008

## Question: Can we keep the existing `courseOfficeHours` definition as-is?

**Answer: Yes, but with important caveats.**

## Why It Works

Drizzle ORM's `pgTable()` function doesn't distinguish between tables and views at the schema definition level. Since our `course_office_hours` view has **INSTEAD OF triggers** for INSERT/UPDATE/DELETE operations, it behaves like a writeable table from Drizzle's perspective.

## Current Schema Definition

```typescript
export const courseOfficeHours = pgTable("course_office_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").references(() => courses.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  location: text("location")
}, (t) => ({
  idx_course_day: index("idx_office_hours_course_day").on(t.courseId, t.dayOfWeek)
}));
```

## What Happens Under the Hood

1. **SELECT queries**: Drizzle generates `SELECT * FROM course_office_hours` which works perfectly on views
2. **INSERT operations**: 
   - Drizzle generates `INSERT INTO course_office_hours (...) VALUES (...)`
   - PostgreSQL's INSTEAD OF trigger intercepts this
   - Trigger function inserts into `calendar_event_templates` instead
3. **UPDATE operations**: Similar - trigger handles the rewrite
4. **DELETE operations**: Trigger handles deletion from underlying table

## Limitations to Be Aware Of

### 1. Index References
The index definition `idx_office_hours_course_day` in the schema is **informational only**. The actual index exists on the underlying `calendar_event_templates` table. Drizzle won't error, but the index won't be used for query planning on the view.

**Impact**: Low - PostgreSQL's query planner will still optimize queries, just using indexes on the underlying table.

### 2. Foreign Key Constraints
The `references(() => courses.id)` in the schema is also **informational**. Views don't support foreign key constraints directly. The constraint is enforced on the underlying `calendar_event_templates.course_id` column.

**Impact**: None - data integrity is still maintained.

### 3. Primary Key Behavior
The `primaryKey()` definition works because the view returns the `id` from `calendar_event_templates`. However, Drizzle's auto-generation (`defaultRandom()`) won't work on inserts through the view - the trigger function handles ID generation.

**Impact**: None - the trigger function already handles ID generation.

## Recommended Approach

### Keep the existing definition ✅

**Reasons:**
1. **Backward compatibility**: Existing code using `courseOfficeHours` continues to work
2. **No breaking changes**: TypeScript types remain the same
3. **Writeable view**: INSTEAD OF triggers make it work seamlessly

### Add documentation comments

The schema now includes comments explaining that it's a view backed by triggers. This helps developers understand:
- Why it works the same way as a table
- What the underlying structure is
- When to use templates directly vs. through the view

## Alternative Approach (If Needed Later)

If you want to be more explicit about the view nature, you could:

1. **Create a separate view definition** (Drizzle doesn't have native support, so you'd use raw SQL):
   ```typescript
   // Raw SQL for view operations
   await db.execute(sql`SELECT * FROM course_office_hours WHERE course_id = ${courseId}`);
   ```

2. **Use the templates table directly** for new code:
   ```typescript
   // New code should use templates directly
   await db.insert(schema.calendarEventTemplates).values({...});
   ```

3. **Gradually migrate** from view to direct table access over time

## Conclusion

**Keep the existing `courseOfficeHours` schema definition as-is.** It works correctly with the writeable view, maintains backward compatibility, and doesn't require any code changes. The INSTEAD OF triggers handle all write operations transparently.

## Migration Path

1. ✅ **Immediate**: Keep `courseOfficeHours` as-is (works with view)
2. **Short-term**: Existing code continues working unchanged
3. **Long-term**: Gradually migrate new code to use `calendarEventTemplates` directly
4. **Future**: Eventually deprecate the view once all code is migrated







