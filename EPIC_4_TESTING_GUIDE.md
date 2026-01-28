# Epic 4 Implementation - Testing Guide

## 🚀 Deployment Steps

### 1. Apply Changes
The migration has been added to the internal migration runner and will run automatically when the API server restarts.

**Option A: Automatic (Restart API)**
```bash
# The migration will run automatically on API startup
# Just restart your API server
```

**Option B: Manual Trigger**
```bash
curl "https://your-api-url.railway.app/api/admin/migrate?secret=FORCE_MIGRATE"
```

---

## 🧪 Testing Checklist

### Test 1: Buffer Time Earning ✨
**What to test:** Completing a focus session awards 15 minutes of buffer time

1. Open the app dashboard
2. Click "Lock In" to start a focus timer
3. Let it run for at least 1 minute
4. Click "Stop" to complete the session
5. **Expected**: 
   - ChillBank should show "15m" in the **Buffer** column (gold/amber color)
   - Success toast: "Focus logged! Xm earned 🔥"

**API Check:**
```bash
curl "https://your-api-url.railway.app/api/timer/context" \
  -H "x-clerk-user-id: YOUR_USER_ID"
```
Should return: `bufferTime.available: 15`

---

### Test 2: Timer Auto-Population 📅
**What to test:** Focus timer pre-populates with next scheduled block

1. Use Quick Add to schedule a focus block:
   - "Work on math homework tomorrow at 2pm for 45 minutes"
2. Tomorrow at 1:55pm, open the dashboard
3. **Expected**:
   - Lock In button shows: "Lock In 45m"
   - Small badge above button: "Next: 45m" with calendar icon
   - Assignment name displayed if linked

**API Check:**
```bash
curl "https://your-api-url.railway.app/api/timer/context" \
  -H "x-clerk-user-id: YOUR_USER_ID"
```
Should return: 
```json
{
  "nextFocusBlock": {
    "suggestedDuration": 45,
    "title": "Math homework"
  }
}
```

---

### Test 3: Buffer Time Usage 🎨
**What to test:** Using buffer time shows gold/amber indicator

1. Earn 15 minutes of buffer time (complete a focus session)
2. Click "Redeem" on the Chill timer
3. **Expected**:
   - Progress ring is **GOLD/AMBER** (not teal)
   - Label below timer: "Buffer (expires tonight)"
   - Countdown from 15:00

4. Let timer run to 0:00 (or stop early)
5. Start another chill session
6. **Expected**:
   - If buffer exhausted, ring is now **TEAL** 
   - Label: "Earned"

---

### Test 4: Buffer Stacking Behavior 🔄
**What to test:** Multiple focus sessions refresh (don't stack) buffer time

1. Complete a focus session → Buffer shows 15m
2. Complete another focus session
3. **Expected**: Buffer STILL shows 15m (not 30m)
   - It refreshes to 15, doesn't accumulate

---

### Test 5: Accomplishment Modal - Scheduled Assignments 📋
**What to test:** Scheduled assignments appear first with badges

1. Schedule a focus block for "Math homework" at 2pm-2:45pm
2. At 2:00pm, start the Lock In timer
3. At 2:30pm, stop the timer
4. **Expected**:
   - Modal opens: "Session Complete! You locked in for 30m. What did you accomplish?"
   - "Math homework" appears under **"You had these scheduled"** header
   - Has calendar icon badge + "Scheduled" label
   - Shows "(45m)" next to the badge

5. Add an ad-hoc assignment via search
6. **Expected**:
   - New section appears: **"Other work you did"**
   - Separated by border

---

### Test 6: Buffer Expiration (Cron) 🌙
**What to test:** Buffer time expires at midnight

1. Earn 15 minutes of buffer time today
2. Don't use it
3. Wait until after midnight
4. **Expected**: Buffer shows 0m (expired silently)

**Manual Trigger (for testing):**
```bash
curl -X POST "https://your-api-url.railway.app/api/cron/buffer-reset" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 🎯 Visual Reference

### ChillBank Layout (New)
```
┌─────────────────────────────────────────┐
│         Chill Bank - Rest Balance        │
├─────────────────┬───────────────────────┤
│   Focus Timer   │    Chill Timer        │
│   [160m icon]   │    [60m icon]         │
│   "Lock In 45m" │    "Redeem"           │
│   📅 Next: 45m  │    Using buffer time  │
└─────────────────┴───────────────────────┘
│ Buffer │ Earned │ Total                 │
│  15m   │  45m   │  60m                  │
│ 🟡Gold │ 🟦Teal │                       │
│ Expires│ Perm   │                       │
└─────────────────────────────────────────┘
```

### Color Codes
- **Buffer Time**: `#F59E0B` (Amber/Gold) - "Expires tonight"
- **Earned Chill**: `#14B8A6` (Teal) - "Permanent"

---

## 🐛 Troubleshooting

### Issue: Migration doesn't apply
**Solution**: Check API logs for migration errors, or call `/api/admin/migrate?secret=FORCE_MIGRATE`

### Issue: Buffer time not showing
**Solution**: 
1. Check network tab - ensure session POST returns `bufferBalance`
2. Verify migration applied: Check database for `buffer_minutes_earned` column
3. Check console for errors in TimerContext

### Issue: Timer context not loading
**Solution**:
1. Check `/api/timer/context` endpoint manually
2. Verify `loadTimerContext()` is being called in ChillBank
3. Check browser console for errors

---

## 📊 API Endpoints Added

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/timer/context` | GET | Get next focus block + buffer balance |
| `/api/timer/use-chill` | POST | Record chill usage (auto-prioritizes buffer) |
| `/api/sessions` | POST | **Updated**: Now returns `bufferBalance` |
| `/api/dashboard/summary` | GET | **Updated**: Includes buffer time in daily data |
| `/api/cron/buffer-reset` | POST | Expire buffer time (midnight job) |
| `/api/cron/health` | GET | Check cron service status |

---

## ✅ Success Criteria

All of these should work after deployment:

- ✅ Focus session completion awards 15 min buffer
- ✅ Buffer time displays in gold/amber color
- ✅ Lock In button shows suggested duration from calendar
- ✅ Chill timer shows which type is being used (buffer vs earned)
- ✅ Scheduled assignments appear first in accomplishment modal
- ✅ Buffer time refreshes (doesn't stack) on multiple focus sessions
- ✅ Buffer time expires at midnight (silent)

---

**Implementation Status**: 🎉 **COMPLETE**
**All Todos**: ✅ 7/7 Complete
**Linter Errors**: ✅ 0 Errors

Ready to test! 🚀



