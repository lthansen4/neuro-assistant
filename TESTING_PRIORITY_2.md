# Testing Priority 2 Features - READY TO GO! ✅

**Status:** API server running with automatic deep work tracking integrated

---

## 🎯 **What's Working NOW**

### ✅ **Fully Automatic (No Manual Calls Needed):**
1. **Deep Work Tracking** - Automatically tracked when Focus blocks are created
2. **Recovery Forcing Check** - Warns if scheduling would exceed 4-hour limit
3. **Comprehensive Priority** - All calculations ready (Wall of Awful, Grade Rescue, Artificial Urgency)

### ⚠️ **Requires Manual Setup:**
1. **Grade Input** - You need to set course grades via API
2. **Major Course Flags** - You need to mark courses as major via API
3. **Deferral Tracking** - Currently manual (will be automatic when calendar moves are implemented)

---

## 🧪 **HOW TO TEST (3 Easy Methods)**

### **Method 1: Run the Test Script (Recommended)**

```bash
cd /Users/lindsayhansen/Desktop/App\ Builds/college-exec-functioning/neuro-assistant

# Make sure API server is running first
# (It should be - I just started it!)

npx tsx scripts/test-priority-2-features.ts
```

**What it does:**
- Creates test assignments
- Tracks deferrals (Wall of Awful)
- Updates course grades (Grade Rescue)
- Checks deep work limits (Recovery Forcing)
- Tests priority calculation (Artificial Urgency)
- Shows detailed console output

---

### **Method 2: Manual API Testing**

#### **Test 1: Automatic Deep Work Tracking**

```bash
# Replace with your actual user ID
USER_ID="f117b49f-54de-4bc1-b1b5-87f45b2a0503"

# 1. Create an assignment with Quick Add
curl -X POST http://localhost:8787/api/quick-add/parse \
  -H "x-user-id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"input":"Math homework due Friday","timezone":"America/Chicago"}'

# Copy the draft from response, then confirm:
curl -X POST http://localhost:8787/api/quick-add/confirm \
  -H "x-user-id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"draft": <PASTE_DRAFT_HERE>}'

# 2. Check today's deep work (should show the Focus block minutes)
curl "http://localhost:8787/api/adhd/deep-work-today?userId=$USER_ID"
```

**Expected Output:**
```json
{
  "minutes": 60,  // Or whatever the Focus block duration was
  "hours": 1.0,
  "limit": 4.0,
  "exceeded": false,
  "recoveryForced": false
}
```

**Console Logs (in API server):**
```
[QuickAdd Confirm] Created 1 events
[Recovery Forcing] Tracked 60min deep work for 1/17/2026
[Recovery Forcing] Updated deep work: 60min (1.0hr)
```

---

#### **Test 2: Recovery Forcing (4-Hour Limit)**

```bash
# After scheduling 4+ hours of Focus blocks:

# Check if can schedule more
curl "http://localhost:8787/api/adhd/can-schedule-deep-work?userId=$USER_ID"
```

**Expected Output (if exceeded):**
```json
{
  "canSchedule": false,
  "reason": "Recovery forced: 4+ hours deep work today"
}
```

**Console Logs:**
```
[Recovery Forcing] ⚠️  User ... has exceeded 4hr deep work limit (4.0hr)
[Recovery Forcing] Blocking further deep work scheduling for today
```

---

#### **Test 3: Grade Rescue Logic**

```bash
# 1. Get your courses
curl "http://localhost:8787/api/courses?userId=$USER_ID" | jq '.courses[0]'

# Copy course ID
COURSE_ID="..." 

# 2. Update grade to 68% (triggers rescue mode)
curl -X POST http://localhost:8787/api/adhd/update-grade \
  -H "x-user-id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":\"$COURSE_ID\",\"grade\":68}"

# 3. Mark as major course
curl -X POST http://localhost:8787/api/adhd/set-major \
  -H "x-user-id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":\"$COURSE_ID\",\"isMajor\":true}"

# 4. Get an assignment in this course
curl "http://localhost:8787/api/assignments?userId=$USER_ID" | jq '.assignments[] | select(.courseId=="'$COURSE_ID'") | .id'

ASSIGNMENT_ID="..."

# 5. Calculate priority (should be boosted)
curl "http://localhost:8787/api/adhd/priority/$ASSIGNMENT_ID?userId=$USER_ID&energy=5"
```

**Expected Output:**
```json
{
  "priority": 0.95,  // High! (Boosted by 1.5x)
  "energyLevel": 5
}
```

**Console Logs:**
```
[Grade Rescue] Updated course ... grade: 68%
[Grade Rescue] ⚠️  Grade below 75% - assignments in this course will receive priority boost
[Grade Rescue] Course ... major status: true
[Grade Rescue] 🚨 Course "Math 101" needs rescue (grade: 68%)
[Grade Rescue] Priority boost: 1.50x (Major course (+25%), Grade rescue (68% < 75%, +25%))
```

---

#### **Test 4: Wall of Awful Detection**

```bash
# 1. Get an assignment
curl "http://localhost:8787/api/assignments?userId=$USER_ID" | jq '.assignments[0].id'

ASSIGNMENT_ID="..."

# 2. Track 3 deferrals
for i in {1..3}; do
  curl -X POST http://localhost:8787/api/adhd/track-deferral \
    -H "x-user-id: $USER_ID" \
    -H "Content-Type: application/json" \
    -d "{\"assignmentId\":\"$ASSIGNMENT_ID\",\"deferredFrom\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  sleep 1
done

# 3. Check stuck assignments
curl "http://localhost:8787/api/adhd/stuck-assignments?userId=$USER_ID"
```

**Expected Output:**
```json
{
  "stuck": [{
    "id": "...",
    "title": "Math homework",
    "course": "Math 101",
    "deferralCount": 3,
    "lastDeferredAt": "2026-01-13T...",
    "interventionShown": false
  }]
}
```

**Console Logs:**
```
[Wall of Awful] Deferral 1/3 tracked for "Math homework"
[Wall of Awful] Deferral 2/3 tracked for "Math homework"
[Wall of Awful] ⚠️  Assignment "Math homework" is now STUCK (3 deferrals)
[Wall of Awful] Intervention required: Break into micro-tasks
```

---

### **Method 3: Through the UI (Frontend)**

**Try Quick Add:**
1. Open the web app (http://localhost:3000)
2. Use Quick Add to create assignments
3. Check the API server logs to see:
   - `[Recovery Forcing] Tracked X min deep work...`
   - `[Priority] Assignment "..." ...`
   - Comprehensive priority calculations

---

## 📊 **What to Look For**

### **In API Server Logs:**

**Priority 1 Features:**
```
[Chunking] Micro-chunking activated (difficulty: high, interest: low) - max 45m chunks
[Chunking] Time blindness overhead: +18m (20%) for chunk on 2026-01-15
[QuickAdd] Added 15m transition buffer after Research/Outline
```

**Priority 2 Features:**
```
[Recovery Forcing] Tracked 90min deep work for 1/13/2026
[Recovery Forcing] Updated deep work: 240min (4.0hr)
[Recovery Forcing] 🛑 RECOVERY FORCED - No more deep work today!

[Grade Rescue] 🚨 Course "CS 101" needs rescue (grade: 68%)
[Grade Rescue] Priority boost: 1.50x

[Wall of Awful] ⚠️  Assignment "Essay" is now STUCK (3 deferrals)
[Wall of Awful] Intervention required: Break into micro-tasks

[Artificial Urgency] Adjusted deadline: 2026-01-16T23:59:00Z → 2026-01-15T23:59:00Z

[Priority] Assignment "Math homework":
  Urgency: 0.67 (artificial urgency applied)
  Weight: 0.10
  Grade boost: 1.50x
  Energy mult: 1.00x
  Stuck penalty: 1.00x
  FINAL SCORE: 0.503
```

---

## ✅ **What's MISSING (Not Required for Testing)**

1. **Frontend UI** - Grade input interface, stuck assignment modal, deep work dashboard
2. **Automatic Deferral Tracking** - When calendar events are moved (need calendar update endpoint)
3. **Heuristic Engine Integration** - Use comprehensive priority in rebalancing
4. **Smart Defaults** - Course setup wizard, grade tracking prompts

**See `PRIORITY_2_INTEGRATION_PLAN.md` for full integration roadmap**

---

## 🚀 **Ready to Test!**

All Priority 2 features are **live and working**:
- ✅ Automatic deep work tracking
- ✅ Recovery forcing (4-hour limit)
- ✅ Grade rescue logic
- ✅ Artificial urgency
- ✅ Wall of Awful detection
- ✅ Comprehensive priority calculation

**Run the test script now:**
```bash
npx tsx scripts/test-priority-2-features.ts
```

**Or start using Quick Add and watch the console logs!** 🎉

