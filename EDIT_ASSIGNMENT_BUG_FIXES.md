# Edit Assignment Modal - Bug Fixes

**Date:** January 21, 2026  
**Commit:** `e4548de`

## Issues Fixed

### 1. ✅ Scheduled Block Duration Mismatch

**Problem:**
When adding more time to an assignment using "Auto-Schedule", the created focus blocks were not matching the requested duration. For example, requesting a 90-minute block would sometimes create blocks with different durations based on the available free slot size.

**Root Cause:**
The `SlotMatcher` utility returns the entire available free slot (gap between events), not a trimmed slot matching the requested duration. The API was using `match.slot.startAt` and `match.slot.endAt` directly without trimming.

**Fix:**
Modified `/api/assignments/:id/schedule-more` endpoint to:
1. Calculate the correct end time: `slotEnd = new Date(slotStart.getTime() + body.additionalMinutes * 60 * 1000)`
2. Use `slotStart` and `slotEnd` (trimmed values) instead of `match.slot.startAt` and `match.slot.endAt`
3. Applied to both preview mode and actual event creation

**Code Changes:**
```typescript
// Before:
startAt: match.slot.startAt,
endAt: match.slot.endAt,

// After:
const slotStart = match.slot.startAt;
const slotEnd = new Date(slotStart.getTime() + body.additionalMinutes * 60 * 1000);
startAt: slotStart,
endAt: slotEnd,
```

### 2. ✅ Missing Reason in API Response

**Problem:**
The "Schedule More" endpoint was successfully finding slots and generating reasoning, but the `reason` was not being included in the actual creation response (non-preview mode). This meant the frontend confirmation dialog couldn't display why a slot was chosen.

**Fix:**
Added `reason` to the response JSON when creating the event:
```typescript
return c.json({ 
  ok: true, 
  event: { ... },
  reason  // Now included
});
```

## Impact

These fixes ensure:
- ✅ All scheduled blocks will be exactly the requested duration (e.g., 90 minutes will always be 90 minutes)
- ✅ The confirmation dialog can display the reasoning for slot selection
- ✅ Users have better visibility into why the system chose a particular time slot
- ✅ The preview and actual creation use the same trimmed slot logic

## Testing Notes

To test these fixes:
1. Open the "Edit Assignment" modal for any assignment
2. Click "Add More Time"
3. Enter a duration (e.g., 90 minutes)
4. Click "Auto-Schedule"
5. Verify the confirmation dialog shows:
   - The correct duration (should match what you entered)
   - A clear reason for the chosen time slot
6. Click "Confirm & Add Block"
7. Verify the created block in the calendar is exactly the requested duration

## Related Files

- `apps/api/src/routes/assignments.ts` - Schedule More endpoint
- `apps/web/components/AssignmentEditModal.tsx` - Frontend modal
- `apps/api/src/lib/slot-matcher.ts` - Slot matching utility (not modified, but relevant)
- `apps/api/src/lib/schedule-analyzer.ts` - Free slot finder (not modified, but relevant)

## Next Steps

Consider future enhancements:
1. Add visual duration indicator in the confirmation dialog
2. Provide alternative time slots for user to choose from
3. Add "smart suggestions" based on assignment priority and due date
4. Implement manual time selection interface for "Manual Schedule" option



