# Phase 2 Implementation: Syllabus Parser - Grading Components

## ✅ Implementation Complete

### What Was Implemented

Updated the `/api/upload/commit` endpoint in `apps/api/src/routes/upload.ts` to:

1. **Populate `grading_components` table** when grade weights are committed
2. **Dual-write** with `grade_weights_json` (both tables stay in sync)
3. **Link to `parse_run_id`** for tracking and rollback capability
4. **Replace strategy** - Syllabus grade weights overwrite existing components for that course

### Code Changes

**Location:** `apps/api/src/routes/upload.ts` (lines 295-320)

```typescript
// Normalize grading components (dual-write with grade_weights_json)
// This creates normalized rows in grading_components table for Grade Forecast calculations
if (body.course.grade_weights && Object.keys(body.course.grade_weights).length > 0) {
  // Clear existing components for this course (replace strategy - syllabus overwrites)
  await tx
    .delete(schema.gradingComponents)
    .where(eq(schema.gradingComponents.courseId, courseId));

  // Insert normalized components from grade_weights
  const components = Object.entries(body.course.grade_weights).map(([name, weight]) => ({
    courseId,
    name: name.trim(),
    weightPercent: Number(weight), // Ensure it's a number
    source: 'syllabus' as const,
    parseRunId: body.parseRunId,
    dropLowest: null, // Not extracted from syllabus yet - can be added later
    sourceItemId: null, // Not needed for direct commits (only for staged items)
  }));

  if (components.length > 0) {
    await tx.insert(schema.gradingComponents).values(components as any);
  }
} else {
  // If no grade_weights provided, we keep existing components (no deletion)
  // This allows manual additions to persist even if syllabus doesn't include weights
}
```

### Key Features

#### 1. Dual-Write Strategy
- **`grade_weights_json`** continues to be written (line 267) for backward compatibility and fast UI loading
- **`grading_components`** is now also populated (lines 295-320) for normalized Grade Forecast calculations
- Both are updated in the same transaction, ensuring consistency

#### 2. Replace Strategy
- When grade weights are provided in the commit:
  - **Existing components for the course are deleted** (line 299-301)
  - **New components are inserted** from the syllabus (lines 304-315)
- This ensures syllabus data overwrites previous data for accuracy

#### 3. Preservation Strategy
- If `grade_weights` is null/undefined/empty:
  - **Existing components are preserved** (no deletion)
  - This allows manual additions to persist even if syllabus doesn't include weights

#### 4. Tracking & Rollback
- Each component is linked to `parse_run_id` (line 309)
- This enables:
  - Tracking which syllabus import created which components
  - Rollback capability (can delete components by parse_run_id)
  - Audit trail for grade weight changes

### Data Flow

```
Syllabus Upload → AI Parse → Review → Commit
                                              ↓
                                    ┌─────────────────┐
                                    │  Commit Endpoint│
                                    └────────┬────────┘
                                             │
                     ┌───────────────────────┼───────────────────────┐
                     │                       │                       │
                     ↓                       ↓                       ↓
            grade_weights_json      grading_components      Other tables
            (JSONB for UI)          (Normalized for calc)   (assignments, etc.)
                     │                       │
                     │                       │
                     └───────────┬───────────┘
                                 │
                          Both in sync
                          (dual-write)
```

### Example Data Transformation

**Input (from AI parse):**
```json
{
  "course": {
    "grade_weights": {
      "Midterm": 30,
      "Final Exam": 40,
      "Homework": 20,
      "Participation": 10
    }
  }
}
```

**Output - `grade_weights_json` (courses table):**
```json
{
  "Midterm": 30,
  "Final Exam": 40,
  "Homework": 20,
  "Participation": 10
}
```

**Output - `grading_components` table (4 rows):**
```
| id  | course_id | name           | weight_percent | source  | parse_run_id |
|-----|-----------|----------------|----------------|---------|--------------|
| ... | abc-123   | Midterm        | 30.00          | syllabus| parse-456    |
| ... | abc-123   | Final Exam     | 40.00          | syllabus| parse-456    |
| ... | abc-123   | Homework       | 20.00          | syllabus| parse-456    |
| ... | abc-123   | Participation  | 10.00          | syllabus| parse-456    |
```

### Testing Checklist

- [ ] **Test with grade weights in syllabus:**
  - Upload syllabus with grade weights
  - Commit the syllabus
  - Verify `grade_weights_json` is populated in `courses` table
  - Verify rows are created in `grading_components` table
  - Verify weights match between JSON and normalized rows

- [ ] **Test without grade weights:**
  - Upload syllabus without grade weights
  - Verify existing components are preserved (not deleted)

- [ ] **Test updating existing course:**
  - Commit syllabus for existing course with different weights
  - Verify old components are deleted and new ones inserted
  - Verify `grade_weights_json` is updated

- [ ] **Test data consistency:**
  - Verify sum of weights doesn't exceed 100% (if needed, add validation)
  - Verify component names are trimmed
  - Verify weights are numbers (not strings)

- [ ] **Test parse_run_id tracking:**
  - Verify each component has correct `parse_run_id`
  - Test rollback capability (delete by parse_run_id)

### Future Enhancements

1. **Extract `drop_lowest` from syllabus:**
   - Currently set to `null`
   - Could parse from syllabus text if mentioned (e.g., "Drop lowest 2 homework scores")

2. **Merge strategy option:**
   - Currently uses replace strategy (overwrites)
   - Could add option to merge with existing components

3. **Validation:**
   - Add check that weights sum to 100% (or warn if not)
   - Validate weight values are between 0-100 (database constraint exists, but could add app-level check)

4. **Source tracking:**
   - Track `source_item_id` if coming from staged items
   - Currently only tracks `parse_run_id`

### Rollback Strategy

If grading components need to be rolled back:

```sql
-- Delete components for a specific parse run
DELETE FROM grading_components 
WHERE parse_run_id = 'parse-run-uuid-here';

-- Or delete all components for a course (if course is deleted)
DELETE FROM grading_components 
WHERE course_id = 'course-uuid-here';
-- (CASCADE delete already handles this automatically)
```

### Files Modified

- ✅ `apps/api/src/routes/upload.ts` - Added grading_components population logic

### Files NOT Modified (Backward Compatibility)

- ✅ `grade_weights_json` write remains unchanged (line 267)
- ✅ Existing code continues to work (reads from JSON for UI)
- ✅ No breaking changes to API contract

---

## Summary

Phase 2 is complete! The syllabus commit endpoint now:
- ✅ Populates normalized `grading_components` table
- ✅ Maintains dual-write with `grade_weights_json`
- ✅ Links to `parse_run_id` for tracking
- ✅ Uses replace strategy (syllabus overwrites)
- ✅ Preserves existing components when no weights provided

**Status:** ✅ Ready for testing and integration with Grade Forecast calculations



