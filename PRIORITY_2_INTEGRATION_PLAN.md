# Priority 2 Integration Plan - What's Missing

## 🔍 **Current Status**

✅ **Implemented:**
- Database schema (assignments, courses, deferrals, deep work tracking)
- Business logic (ADHD Guardian library)
- API endpoints (Wall of Awful, Grade Rescue, Recovery Forcing)

❌ **Missing for Intelligent Operation:**

---

## 1. **AUTOMATIC TRACKING** (Critical!)

**Problem:** Features require manual API calls. We need automatic tracking.

### **Missing Integrations:**

#### **A) Track Deep Work Automatically**
When Focus blocks are **scheduled** (not just completed), we need to:
```typescript
// In quickAdd.ts after creating Focus blocks:
for (const focusBlock of focusEvents) {
  if (focusBlock.eventType === 'Focus') {
    await ADHDGuardian.trackDeepWork(
      userId,
      focusBlock.startAt,
      focusBlock.durationMinutes
    );
  }
}
```

**Why:** Prevents over-scheduling (recovery forcing) at schedule time, not after burnout.

#### **B) Track Deferrals Automatically**
When calendar events are **moved/rescheduled**, we need to:
```typescript
// In calendar update endpoint:
if (eventIsBeingMoved && event.linkedAssignmentId) {
  await ADHDGuardian.trackDeferral(
    userId,
    event.linkedAssignmentId,
    originalStartTime,
    newStartTime,
    "User rescheduled"
  );
}
```

**Why:** Wall of Awful detection only works if deferrals are tracked automatically.

#### **C) Respect Recovery Forcing in Scheduling**
Before scheduling new Focus blocks:
```typescript
// In Quick Add / Rebalancing:
const canSchedule = await ADHDGuardian.hasExceededDeepWorkLimit(userId, targetDate);
if (canSchedule.exceeded) {
  throw new Error("Recovery forced: 4+ hours deep work today");
  // OR: Skip this day and try next day
}
```

**Why:** Enforces 4-hour limit BEFORE user tries to cram 8 hours.

---

## 2. **PRIORITY CALCULATION INTEGRATION**

**Problem:** Comprehensive priority calculation exists but isn't used by the scheduler.

### **Missing Integration:**

#### **Update Heuristic Engine to Use New Priority**
```typescript
// In heuristic-engine.ts:
import ADHDGuardian from './adhd-guardian';

async findBestSlots(userId: string, assignmentId: string, energy: number) {
  // OLD: const score = this.calculatePriority(assignment, energy);
  
  // NEW: Use comprehensive priority
  const score = await ADHDGuardian.calculateComprehensivePriority(
    assignmentId,
    assignment.gradeWeight || 0.1,
    energy
  );
  
  // This automatically includes:
  // - Artificial urgency (deadline treated as 24h earlier)
  // - Grade rescue boost (if course grade < 75%)
  // - Major course boost (if flagged as major)
  // - Stuck penalty (if deferred 3+ times)
}
```

**Why:** Makes Priority 2 features actually affect scheduling decisions.

---

## 3. **FRONTEND UI** (User-facing)

**Problem:** Users can't see or interact with Priority 2 features.

### **Missing UI Components:**

#### **A) Stuck Assignment Intervention Modal**
```tsx
// StuckAssignmentModal.tsx
// Shows when user has stuck assignments
// Prompts: "Let's break this into 15-minute micro-tasks"
// Lists stuck assignments with deferral counts
```

#### **B) Grade Tracking Interface**
```tsx
// CourseGradePanel.tsx
// For each course:
// - Current grade input (0-100%)
// - Major/Minor toggle
// - Shows "🚨 Grade rescue active" if < 75%
```

#### **C) Deep Work Dashboard**
```tsx
// DeepWorkWidget.tsx
// Shows today's deep work: "2.5 / 4.0 hours"
// Progress bar
// Warning: "⚠️ 30 minutes until recovery forced"
```

#### **D) Recovery Forced Banner**
```tsx
// RecoveryForcedBanner.tsx
// Shows when user tries to schedule more after 4hr
// Message: "🛑 Recovery forced! You've done 4 hours of deep work today."
// Suggests: Chill blocks, admin tasks, or rest
```

---

## 4. **SMART DEFAULTS & ONBOARDING**

**Problem:** Users won't manually input grades or flag courses as major.

### **Missing Onboarding Flow:**

#### **A) Course Setup Wizard**
When user adds a course:
```
1. "Is this a major course?" [Yes / No]
2. "Current grade (optional):" [____%]
3. "This helps us prioritize assignments in struggling courses"
```

#### **B) Grade Tracking Prompts**
After assignments are graded:
```
"You got 85% on Math Midterm! Update your current grade?"
[Yes, update to 85%] [No, thanks]
```

#### **C) Artificial Urgency Setting**
User preference:
```
"Treat deadlines as 24 hours earlier?"
- Helpful for chronic procrastinators
- Creates healthy pressure without panic
[Enable] [Disable]
```

---

## 5. **REBALANCING ENGINE INTEGRATION**

**Problem:** Rebalancing engine doesn't use Priority 2 features.

### **Missing Integration:**

#### **A) Priority-Based Scheduling**
```typescript
// In generateComprehensiveProposal:
const assignments = await db.query.assignments.findMany({...});

// Sort by comprehensive priority (not just urgency)
const sortedByPriority = await Promise.all(
  assignments.map(async (a) => ({
    assignment: a,
    priority: await ADHDGuardian.calculateComprehensivePriority(a.id, 0.1, energyLevel)
  }))
);

sortedByPriority.sort((a, b) => b.priority - a.priority);
```

#### **B) Recovery Forcing in Rebalancing**
```typescript
// Before proposing a move to a specific day:
const deepWorkMinutes = await ADHDGuardian.getDeepWorkMinutes(userId, targetDate);
if (deepWorkMinutes >= 240) {
  // Skip this day, try next day
  continue;
}
```

---

## 6. **DATA PERSISTENCE & SYNC**

**Problem:** No grade data, no major/minor flags set yet.

### **Required Setup:**

#### **A) Set Initial Course Flags**
```sql
-- Mark CS courses as major (for example)
UPDATE courses 
SET is_major = TRUE 
WHERE name LIKE '%Computer Science%' 
   OR name LIKE '%CS %';
```

#### **B) Input Current Grades**
User needs to manually input (or we can prompt):
```
Math 101: 72% (🚨 Grade rescue active!)
English 201: 85% (Good standing)
CS 101: 68% (🚨 Grade rescue active!)
History 101: 78% (Good standing)
```

---

## 🧪 **COMPREHENSIVE TEST PLAN**

### **Test 1: Wall of Awful Detection**

**Setup:**
1. Create an assignment
2. Track 3 deferrals manually

**Commands:**
```bash
# 1. Create assignment (use Quick Add or manual)
curl -X POST http://localhost:8787/api/quick-add/parse \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"input":"Math homework due Friday"}'

# 2. Get assignment ID, then track deferrals
ASSIGNMENT_ID="..." # from step 1

curl -X POST http://localhost:8787/api/adhd/track-deferral \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"assignmentId\":\"$ASSIGNMENT_ID\",\"deferredFrom\":\"2026-01-13T10:00:00Z\"}"

# Repeat 2 more times (total 3 deferrals)

# 3. Check stuck assignments
curl http://localhost:8787/api/adhd/stuck-assignments?userId=YOUR_USER_ID
```

**Expected Result:**
```json
{
  "stuck": [{
    "id": "...",
    "title": "Math homework",
    "deferralCount": 3,
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

### **Test 2: Grade Rescue Logic**

**Setup:**
1. Update a course grade to 68% (below 75% threshold)
2. Mark it as a major course
3. Calculate priority for an assignment in that course

**Commands:**
```bash
# 1. Get course ID
curl http://localhost:8787/api/courses?userId=YOUR_USER_ID | jq '.courses[0].id'

COURSE_ID="..." # from above

# 2. Update grade to 68% (triggers rescue mode)
curl -X POST http://localhost:8787/api/adhd/update-grade \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":\"$COURSE_ID\",\"grade\":68}"

# 3. Mark as major course
curl -X POST http://localhost:8787/api/adhd/set-major \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":\"$COURSE_ID\",\"isMajor\":true}"

# 4. Get assignment in that course
curl http://localhost:8787/api/assignments?userId=YOUR_USER_ID | jq '.assignments[] | select(.courseId=="'$COURSE_ID'") | .id'

ASSIGNMENT_ID="..." # from above

# 5. Calculate priority
curl "http://localhost:8787/api/adhd/priority/$ASSIGNMENT_ID?userId=YOUR_USER_ID&energy=5"
```

**Expected Result:**
```json
{
  "priority": 0.95,  // High priority due to rescue + major boost
  "energyLevel": 5
}
```

**Console Logs:**
```
[Grade Rescue] Updated course ... grade: 68%
[Grade Rescue] ⚠️  Grade below 75% - assignments in this course will receive priority boost
[Grade Rescue] Course ... major status: true
[Grade Rescue] 🚨 Course "CS 101" needs rescue (grade: 68%)
[Grade Rescue] Priority boost: 1.50x (Major course (+25%), Grade rescue (68% < 75%, +25%))
```

---

### **Test 3: Recovery Forcing**

**Setup:**
1. Schedule 4+ hours of Focus blocks for today
2. Try to schedule more

**Commands:**
```bash
# 1. Check current deep work (should be 0)
curl "http://localhost:8787/api/adhd/deep-work-today?userId=YOUR_USER_ID"

# 2. Create Focus blocks totaling 4+ hours
# (Use Quick Add or manually create calendar events)

# 3. Check deep work again (should be >= 240 minutes)
curl "http://localhost:8787/api/adhd/deep-work-today?userId=YOUR_USER_ID"

# 4. Try to schedule more
curl "http://localhost:8787/api/adhd/can-schedule-deep-work?userId=YOUR_USER_ID"
```

**Expected Result:**
```json
{
  "minutes": 240,
  "hours": 4.0,
  "limit": 4.0,
  "exceeded": true,
  "recoveryForced": true
}

{
  "canSchedule": false,
  "reason": "Recovery forced: 4+ hours deep work today"
}
```

**Console Logs:**
```
[Recovery Forcing] Updated deep work: 240min (4.0hr)
[Recovery Forcing] 🛑 RECOVERY FORCED - No more deep work today!
[Recovery Forcing] ⚠️  User ... has exceeded 4hr deep work limit (4.0hr)
[Recovery Forcing] Blocking further deep work scheduling for today
```

---

### **Test 4: Artificial Urgency**

**Setup:**
1. Create an assignment due in 3 days
2. Calculate its urgency with artificial urgency enabled

**Commands:**
```bash
# 1. Create assignment due in 3 days
DUE_DATE=$(date -u -v+3d +"%Y-%m-%dT23:59:00Z")

curl -X POST http://localhost:8787/api/quick-add/parse \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"input\":\"Essay due in 3 days\"}"

# 2. Get assignment ID and calculate priority
ASSIGNMENT_ID="..." # from response

curl "http://localhost:8787/api/adhd/priority/$ASSIGNMENT_ID?userId=YOUR_USER_ID&energy=5"
```

**Expected Result:**
Priority should be **higher** than normal because the deadline is treated as 24 hours earlier internally.

**Console Logs:**
```
[Artificial Urgency] Adjusted deadline: 2026-01-16T23:59:00Z → 2026-01-15T23:59:00Z
[Priority] Assignment "Essay":
  Urgency: 0.45 (artificial urgency applied)  <- Would be ~0.33 without
  Weight: 0.10
  Grade boost: 1.00x
  Energy mult: 1.00x
  Stuck penalty: 1.00x
  FINAL SCORE: 0.275
```

---

## ✅ **WHAT TO IMPLEMENT NEXT**

**Priority Order:**

1. **Automatic Deep Work Tracking** (CRITICAL)
   - Integrate into Quick Add when Focus blocks are created
   - Update `quickAdd.ts` to call `ADHDGuardian.trackDeepWork()`

2. **Automatic Deferral Tracking** (HIGH)
   - Add to calendar event update endpoint
   - Detect when events with `linkedAssignmentId` are moved

3. **Priority Calculation Integration** (HIGH)
   - Update heuristic engine to use `calculateComprehensivePriority()`
   - Makes grade rescue and artificial urgency actually work

4. **Recovery Forcing in Scheduling** (MEDIUM)
   - Check deep work limit before scheduling in Quick Add
   - Check deep work limit in rebalancing engine

5. **Frontend UI** (MEDIUM)
   - Stuck assignment modal
   - Grade tracking interface
   - Deep work dashboard

6. **Smart Defaults** (LOW)
   - Course setup wizard
   - Grade tracking prompts

---

## 🚀 **Quick Win: Test Script**

I can create a test script that:
1. Sets up test data (course with grade, stuck assignment, etc.)
2. Runs all API calls
3. Shows console output
4. Verifies expected behavior

**Want me to create this test script now?**







