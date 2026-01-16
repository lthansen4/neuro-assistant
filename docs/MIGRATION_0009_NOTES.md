# Migration 0009: Assignments Standardization - Notes

## What This Migration Does

### 1. CHECK Constraint on Status
- **What**: Adds explicit CHECK constraint enforcing status values
- **Why**: 
  - Defense in depth (enum already enforces, but CHECK is extra validation)
  - Query optimization hints for PostgreSQL planner
  - Explicit documentation of allowed values
- **Values**: `('Inbox', 'Scheduled', 'Locked_In', 'Completed')`
- **Impact**: ✅ None - enum already enforces these values

### 2. New Composite Index
- **Name**: `idx_assignments_user_status_due_date`
- **Columns**: `(user_id, status, due_date)`
- **Type**: Partial index (only rows where `due_date IS NOT NULL`)
- **Purpose**: Optimize dashboard queries that filter by user, status, and order by due_date

### 3. Index Strategy

#### Existing Indexes (Kept):
- `idx_assignments_user_due` on `(user_id, due_date)`
- `idx_assignments_course_due` on `(course_id, due_date)`

#### New Index:
- `idx_assignments_user_status_due_date` on `(user_id, status, due_date)` (full index)

#### Why Keep Old Indexes?
1. **Backward compatibility**: Existing queries may rely on them
2. **PostgreSQL is smart**: It will choose the best index for each query
3. **No harm**: Having multiple indexes is fine, PostgreSQL manages them efficiently
4. **Safety**: Can drop old indexes later after verifying new one works well

#### Why Full Index (Not Partial)?
This is a **full index** (not partial) because:
- **Inbox triaging**: Assignments in "Inbox" status often don't have due dates yet
- **Complete coverage**: Need to efficiently query all status values, including Inbox items without due dates
- **NULL handling**: PostgreSQL indexes NULL values and can sort them (NULLS LAST by default)
- **Dashboard queries**: Need to show all Inbox items, not just those with due dates

## Query Patterns Optimized

### Pattern 1: User Dashboard - Inbox Items (Including No Due Date)
```sql
SELECT * FROM assignments 
WHERE user_id = $1 
  AND status = 'Inbox' 
ORDER BY due_date NULLS LAST;
```
✅ Uses: `idx_assignments_user_status_due_date` (includes assignments without due dates)

### Pattern 2: User Dashboard - Multiple Statuses
```sql
SELECT * FROM assignments 
WHERE user_id = $1 
  AND status IN ('Inbox', 'Scheduled')
ORDER BY due_date;
```
✅ Uses: `idx_assignments_user_status_due_date` (index scan + filter)

### Pattern 3: User Dashboard - All by Due Date
```sql
SELECT * FROM assignments 
WHERE user_id = $1 
ORDER BY due_date;
```
✅ Uses: `idx_assignments_user_status_due_date` OR `idx_assignments_user_due` (PostgreSQL chooses)

### Pattern 4: Course View
```sql
SELECT * FROM assignments 
WHERE course_id = $1 
ORDER BY due_date;
```
✅ Uses: `idx_assignments_course_due` (existing index)

## Potential Future Optimization

If course-based queries also filter by status frequently, consider adding:
```sql
CREATE INDEX IF NOT EXISTS idx_assignments_course_status_due_date
  ON assignments(course_id, status, due_date)
  WHERE course_id IS NOT NULL;
```
(Note: Full index, not partial, to include Inbox items without due dates)

**Decision**: Not included in this migration because:
- Course-based queries are less frequent than user-based
- Can add later if query analysis shows it's needed
- Keeps migration simple and focused

## Schema Updates Needed

### TypeScript Schema
No changes needed! The CHECK constraint is database-level only.

The existing schema already has:
```typescript
status: assignmentStatusEnum("status").default("Inbox")
```

The enum type already enforces the values, so the CHECK constraint is redundant but harmless.

## Verification

After running the migration, verify with:

```sql
-- Check constraint exists
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'assignments_status_chk';

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'assignments' 
ORDER BY indexname;

-- Test query performance
EXPLAIN ANALYZE 
SELECT * FROM assignments 
WHERE user_id = '...'::uuid 
  AND status = 'Inbox' 
ORDER BY due_date;
```

## Rollback Plan

If needed, rollback with:

```sql
BEGIN;
DROP INDEX IF EXISTS idx_assignments_user_status_due_date;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_status_chk;
COMMIT;
```

**Note**: Removing the CHECK constraint is safe - the enum still enforces values.

## Summary

✅ **Safe**: No breaking changes  
✅ **Additive**: Only adds constraint and index  
✅ **Backward Compatible**: Existing indexes and queries still work  
✅ **Optimized**: New index improves dashboard query performance  
✅ **Future-Proof**: Can add more indexes later if needed  





