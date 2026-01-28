# Schedule More Time - Graduated Buffer System Fix

## Issue Summary
Auto-scheduling was failing with "no free slot" for assignments with approaching deadlines. The system was applying a fixed 4-hour buffer before the due date whenever there was more than 24 hours remaining. This was too aggressive for assignments with tight deadlines (e.g., 45 hours remaining), causing all available time slots to be excluded.

## Root Cause
**Previous Logic (Binary):**
- If `hoursUntilDue > 24`: Apply 4-hour buffer
- Else: No buffer

**Problem with 45-hour deadline:**
- Current time: Jan 21, 2:39 AM UTC
- Due date: Jan 22, 11:59 PM UTC
- Hours until due: ~45 hours
- System applied 4-hour buffer → Search constrained to Jan 22, 7:59 PM
- ScheduleAnalyzer found 7 free slots in 14-day window
- **All 7 slots were after Jan 22, 7:59 PM** → Result: "no free slot"

## Solution: Graduated Buffer System

Implemented a more intelligent, graduated buffer system that adjusts based on how much time remains:

```typescript
if (hoursUntilDue > 72) {
  // More than 3 days: use 4-hour buffer for quality scheduling
  bufferMs = 4 * 60 * 60 * 1000;
} else if (hoursUntilDue > 48) {
  // 2-3 days: use 2-hour buffer
  bufferMs = 2 * 60 * 60 * 1000;
} else if (hoursUntilDue > 24) {
  // 1-2 days: use 30-minute buffer (just enough to wrap up)
  bufferMs = 30 * 60 * 1000;
} else if (hoursUntilDue > 6) {
  // 6-24 hours: no buffer, schedule right up to deadline
  bufferMs = 0;
} else {
  // Less than 6 hours: allow scheduling up to the deadline
  bufferMs = 0;
}
```

## Benefits

1. **Quality Scheduling for Early Planning:**
   - When deadline is >3 days away, maintains 4-hour buffer for optimal scheduling
   - Encourages working ahead with breathing room

2. **Flexibility for Approaching Deadlines:**
   - 2-3 days: 2-hour buffer (reasonable cushion)
   - 1-2 days: 30-minute buffer (time to wrap up)
   - <24 hours: No buffer (maximize available time)

3. **Better User Experience:**
   - System can now find slots for assignments with tight deadlines
   - User receives more helpful error messages with time-until-due context

4. **Enhanced Logging:**
   - Now logs: `[SlotMatcher] Constraining search to {time} ({buffer description}, {hours}h until due)`
   - Example: `[SlotMatcher] Constraining search to 2026-01-22T23:29:00.000Z (30m buffer, 45.3h until due)`

## For the 45-Hour Deadline Case

**Before:**
- 45 hours until due
- Applied 4-hour buffer (because > 24 hours)
- Effective search window: Jan 21, 2:39 AM - Jan 22, 7:59 PM
- Result: 0 slots found

**After:**
- 45 hours until due
- Applied 2-hour buffer (because 48-72 hour range)
- Effective search window: Jan 21, 2:39 AM - Jan 22, 9:59 PM
- Expected result: Should find slots in the additional 2-hour window

If still not found, will apply 30-minute buffer on next attempt (if deadline moves into 24-48 hour range).

## Files Changed
- `apps/api/src/lib/slot-matcher.ts`: Implemented graduated buffer logic

## Testing Recommendations
1. Test auto-scheduling with various deadline distances (3+ days, 2 days, 1 day, 12 hours)
2. Verify that appropriate buffer is logged
3. Confirm that slots are found when available within the adjusted window
4. Check that error messages provide helpful context when no slots found



