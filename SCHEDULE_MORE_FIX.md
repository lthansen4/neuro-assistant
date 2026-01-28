# Schedule More Time - Slot Finding Improvements

**Date**: January 20, 2026  
**Commit**: `4155b13`

## Issue
When clicking "Auto-Schedule" to add more time to an assignment, the system was returning "No suitable time slot found in the next 14 days" even when free slots should exist.

## Root Cause Analysis
The `SlotMatcher` was only searching within a 14-day window, which could be too restrictive for:
- Users with packed calendars
- Assignments with close due dates
- Longer duration blocks (e.g., 90 minutes)

## Changes Made

### 1. Extended Lookahead Window (`assignments.ts`)
- **Before**: Single attempt with 14-day lookahead, immediate failure if no slots found
- **After**: Progressive retry strategy:
  1. Try 14-day lookahead (optimal slots)
  2. If no match, retry with 30-day lookahead (more lenient)
  3. If still no match, provide detailed error message

### 2. Improved Error Messages (`assignments.ts`)
- Added context-aware error messages
- Check if assignment has a very close due date (< 48 hours)
- Suggest alternative actions (shorter duration, manual scheduling)
- Log diagnostic information for debugging

### 3. Enhanced Logging (`slot-matcher.ts`, `schedule-analyzer.ts`)
Added detailed logging to diagnose slot finding issues:
- Search window dates and duration
- Number of free slots found before/after filtering
- Sample free slots with their properties
- Assignment due date constraints
- Why slots were rejected

## Code Changes

### `apps/api/src/routes/assignments.ts`
```typescript
// Progressive retry with extended lookahead
let match = await matcher.findOptimalSlot(/* 14 days */);

if (!match) {
  console.log(`[Schedule More] No slot found in 14 days, trying 30 days`);
  match = await matcher.findOptimalSlot(/* 30 days, less restrictive */);
}

if (!match) {
  let errorMsg = `No ${body.additionalMinutes}-minute slot found in the next 30 days.`;
  
  // Add helpful context if due date is very close
  if (assignment.dueDate) {
    const hoursUntilDue = (assignment.dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60);
    if (hoursUntilDue < 48) {
      errorMsg += ' This assignment is due very soon - consider a shorter duration or manually scheduling.';
    }
  }
  
  return c.json({ error: errorMsg }, 404);
}
```

### `apps/api/src/lib/slot-matcher.ts`
```typescript
// Added detailed search window logging
console.log(`[SlotMatcher] Search window: ${now.toISOString()} to ${endDate.toISOString()} (${lookaheadDays} days)`);

// Added diagnostic info when no slots found
if (freeSlots.length === 0) {
  console.log(`[SlotMatcher] No free slots found for "${focusBlock.title}" (${focusBlock.duration}min) between ${now.toISOString()} and ${endDate.toISOString()}`);
  if (assignment?.dueDate) {
    console.log(`[SlotMatcher] Assignment due: ${assignment.dueDate.toISOString()}, constraining search`);
  }
  return null;
}
```

### `apps/api/src/lib/schedule-analyzer.ts`
```typescript
// Log sample slots for debugging
if (freeSlots.length > 0) {
  console.log(`[ScheduleAnalyzer] Sample free slots:`, freeSlots.slice(0, 3).map(s => ({
    start: s.startAt.toISOString(),
    duration: s.durationMinutes,
    timeOfDay: s.timeOfDay,
    quality: s.quality
  })));
}
```

## Testing
To verify the fix:
1. Open an assignment in the Edit Assignment modal
2. Click "Add More Time"
3. Enter a duration (e.g., 90 minutes)
4. Click "Auto-Schedule"
5. Check Railway API logs for diagnostic information
6. Verify that the system tries both 14-day and 30-day windows
7. If successful, confirm the proposed slot; if not, review the error message for helpful guidance

## Expected Behavior
- **Success Case**: System finds a slot within 30 days and shows confirmation dialog with reasoning
- **Failure Case**: System provides helpful error message explaining why no slot was found and suggesting alternatives

## Monitoring
Check Railway logs for:
- `[SlotMatcher] Finding optimal slot for` - Shows search initiation
- `[ScheduleAnalyzer] Found X free slots` - Shows available slots before filtering
- `[Schedule More] No slot found in 14 days, trying 30 days` - Shows retry attempt
- Error messages with assignment context

## Next Steps (If Issue Persists)
If users still see "no free slot" errors after this fix:
1. Check the Railway logs for the diagnostic information
2. Verify the user's calendar density (how many events they have)
3. Check if sleep window protection is too aggressive
4. Consider adjusting the minimum slot duration requirements
5. Review assignment due date constraints



