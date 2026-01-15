# Implementation Order Recommendation

## Current State Analysis

### 1. Dashboard Assignment Queries
**Finding**: The dashboard currently **does NOT query assignments at all**. It only displays:
- Daily/weekly productivity data
- Streaks
- Grade forecasts
- Preferences

**Impact**: Adding status-based assignment queries would be **new functionality**, not a migration of existing queries. This is **safer** because there's nothing to break.

### 2. Syllabus Parser - Grading Components
**Current behavior**: 
- Writes `grade_weights_json` to `courses` table (line 267 in `upload.ts`)
- Stages grade_weights as JSON in `syllabus_staging_items`
- Does NOT populate `grading_components` table yet

**Impact**: Adding `grading_components` population would be **additive** - we can dual-write (JSON + normalized) without breaking existing flow.

---

## Recommended Implementation Order

### **Phase 1: Dashboard Status Queries (First)** ✅ RECOMMENDED FIRST

**Why First:**
1. **Zero risk** - No existing queries to break
2. **Immediate value** - Users can see their assignments with proper status filtering
3. **Index already exists** - Migration 0009 created the optimized index
4. **Independent** - Doesn't depend on grading components

**What to implement:**
1. Add assignments endpoint to dashboard API
2. Query assignments with status filters using the new index
3. Display assignments in dashboard UI (Inbox, Scheduled, Completed sections)
4. Filter by status, order by due_date (NULLS LAST for Inbox items)

**Files to update:**
- `apps/api/src/routes/dashboard.ts` - Add assignments endpoint
- `apps/web/app/(protected)/dashboard/page.tsx` - Display assignments
- `apps/web/lib/api.ts` - Add fetchAssignments function

**Example query (using new index):**
```typescript
const inboxAssignments = await db
  .select()
  .from(schema.assignments)
  .where(
    and(
      eq(schema.assignments.userId, userId),
      eq(schema.assignments.status, "Inbox")
    )
  )
  .orderBy(
    sql`${schema.assignments.dueDate} NULLS LAST` // Inbox items without due dates come last
  );
```

---

### **Phase 2: Syllabus Parser - Grading Components (Second)** ✅ RECOMMENDED SECOND

**Why Second:**
1. **Additive change** - Can dual-write (JSON + normalized) without breaking existing code
2. **Dependent on dashboard** - Less critical path (grade forecasts can use JSON for now)
3. **Future feature** - Needed for advanced Grade Forecast calculations (drop_lowest, etc.)
4. **Can be tested independently** - After dashboard is stable

**What to implement:**
1. Update syllabus commit endpoint to populate `grading_components`
2. When `grade_weights` are committed, create normalized rows in `grading_components`
3. Keep `grade_weights_json` in sync (dual-write)
4. Link to `parse_run_id` for tracking

**Files to update:**
- `apps/api/src/routes/upload.ts` - Add grading_components population in `/commit` endpoint
- Keep existing `grade_weights_json` write for backward compatibility

**Example implementation:**
```typescript
// After course upsert in upload.ts commit endpoint:
if (body.course.grade_weights && Object.keys(body.course.grade_weights).length > 0) {
  // Clear existing components for this course (or merge strategy)
  await tx.delete(schema.gradingComponents)
    .where(eq(schema.gradingComponents.courseId, courseId));
  
  // Insert normalized components
  const components = Object.entries(body.course.grade_weights).map(([name, weight]) => ({
    courseId,
    name,
    weightPercent: weight,
    source: 'syllabus',
    parseRunId: body.parseRunId,
  }));
  
  if (components.length > 0) {
    await tx.insert(schema.gradingComponents).values(components);
  }
}
```

---

## Alternative Order (If Grade Forecasts are Priority)

If Grade Forecast calculations are more urgent than dashboard assignment display:

### **Phase 1: Grading Components First**
- Unblocks accurate Grade Forecast calculations
- Enables Rebalancing Engine features faster
- Still safe (additive, dual-write)

### **Phase 2: Dashboard Queries Second**
- Less critical (can add later)
- Users can still access assignments through other views

---

## Risk Assessment

### Dashboard Queries (Phase 1)
- **Risk**: 🟢 **LOW** - Adding new functionality, no existing code to break
- **Impact**: ✅ **HIGH** - Users get immediate value (see their assignments)
- **Dependencies**: None (index already exists)

### Grading Components (Phase 2)
- **Risk**: 🟡 **MEDIUM** - Touches working syllabus commit flow
- **Impact**: ✅ **HIGH** - Enables accurate grade calculations
- **Dependencies**: Requires careful dual-write to keep JSON + normalized in sync

---

## Final Recommendation

**Go with Phase 1 → Phase 2 order** (Dashboard first, Grading Components second)

**Rationale:**
1. **Lower risk path**: Dashboard queries are completely new, zero chance of breaking existing functionality
2. **User-visible value**: Dashboard is a high-traffic page, users will immediately see their assignments
3. **Simpler implementation**: Just query and display, no complex dual-write logic
4. **Natural progression**: Once dashboard shows assignments, users will want better grade forecasting (which needs grading_components)

---

## Implementation Checklist

### Phase 1: Dashboard Assignment Queries
- [ ] Add `/api/dashboard/assignments` endpoint with status filtering
- [ ] Use new index `idx_assignments_user_status_due_date` for queries
- [ ] Add assignments section to dashboard UI
- [ ] Group by status (Inbox, Scheduled, Completed)
- [ ] Test with assignments in different statuses
- [ ] Verify index usage with EXPLAIN ANALYZE

### Phase 2: Syllabus Parser - Grading Components
- [ ] Update `/api/upload/commit` to populate `grading_components`
- [ ] Implement dual-write (JSON + normalized)
- [ ] Test with existing grade_weights_json data
- [ ] Verify data consistency between JSON and normalized
- [ ] Update Grade Forecast calculations to use normalized components (optional, can be separate task)

---

## Testing Strategy

### Phase 1 Testing
1. Create test assignments with different statuses
2. Query via new endpoint
3. Verify index is used (EXPLAIN ANALYZE)
4. Test UI displays correctly

### Phase 2 Testing
1. Upload syllabus with grade weights
2. Verify both `grade_weights_json` and `grading_components` are populated
3. Verify data matches between JSON and normalized
4. Test updating grade weights (should sync both)
5. Test Grade Forecast calculations (if implemented)

---

## Rollback Plans

### Phase 1 (Dashboard)
- Simply remove the assignments endpoint/queries
- Dashboard reverts to current state (no assignments shown)
- Zero data impact

### Phase 2 (Grading Components)
- Remove grading_components population code
- Keep using `grade_weights_json` only
- Existing `grading_components` data remains but unused
- Can be cleaned up later if needed



