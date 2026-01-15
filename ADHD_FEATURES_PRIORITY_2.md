# Priority 2 ADHD-Friendly Features - IMPLEMENTED ✅

**Implementation Date:** January 13, 2026
**Status:** Live in API

---

## 🎯 **What We Just Implemented**

### **1. Wall of Awful Detection** 🧱✅

**Problem:** ADHD brains experience "task paralysis" when repeatedly avoiding a task. The accumulating shame and anxiety create a "Wall of Awful" that becomes insurmountable.

**Solution:**
- **Automatic deferral tracking** - Every time an assignment is postponed, we track it
- **3-strike rule** - After 3 deferrals, flag assignment as "STUCK"
- **Intervention prompt** - Show user a prompt to break stuck task into 15-minute micro-tasks
- **Shame reduction** - System recognizes stuck patterns BEFORE user feels like a failure

**How it Works:**
```
User postpones paper → Deferral 1/3 tracked
User postpones again → Deferral 2/3 tracked
User postpones third time → ⚠️ STUCK FLAG + Intervention prompt:

"This task seems overwhelming. Let's break it into tiny pieces:
 - [ ] Open Word document (5 min)
 - [ ] Write thesis statement (10 min)
 - [ ] Write opening paragraph (15 min)
 
Which feels easiest to start with?"
```

**Database Schema:**
```sql
assignments:
  - deferral_count: Number of times deferred
  - is_stuck: TRUE after 3 deferrals
  - last_deferred_at: Timestamp of most recent deferral
  - stuck_intervention_shown: TRUE after intervention shown

assignment_deferrals:
  - Track every deferral with timestamps
  - Optional user-provided reason
```

**API Endpoints:**
- `GET /api/adhd/stuck-assignments` - Get all stuck assignments
- `POST /api/adhd/track-deferral` - Record a deferral
- `POST /api/adhd/intervention-shown/:id` - Mark intervention as shown
- `POST /api/adhd/reset-stuck/:id` - Reset after breaking into micro-tasks

**Code Location:** 
- Logic: `apps/api/src/lib/adhd-guardian.ts` (lines 21-111)
- API: `apps/api/src/routes/adhd-features.ts` (lines 20-97)

---

### **2. Artificial Urgency** ⏰✅

**Problem:** ADHD brains struggle with time perception. Deadlines feel distant until they're suddenly "tomorrow." Chronic procrastination leads to last-minute panic.

**Solution:**
- **Internal deadline adjustment** - Treat ALL deadlines as 24 hours earlier
- **Urgency gradient** - Priority score increases exponentially as (adjusted) deadline approaches
- **User never sees it** - This is an internal calculation only
- **Prevents "the wall"** - Creates urgency BEFORE panic mode

**How it Works:**
```
REAL deadline: Friday 11:59 PM
INTERNAL deadline: Thursday 11:59 PM (24hr earlier)

System schedules work based on Thursday deadline → User finishes early → Avoids panic
```

**Urgency Calculation:**
```typescript
// Without artificial urgency:
Due in 3 days → Urgency: 0.25 (low)
Due in 1 day → Urgency: 0.50 (medium)
Due in 12 hours → Urgency: 0.67 (high)

// WITH artificial urgency (24hr earlier):
Due in 3 days → Urgency: 0.33 (perceived as 2 days)
Due in 1 day → Urgency: 0.67 (perceived as same-day)
Due in 12 hours → Urgency: 0.83 (perceived as overdue soon)
```

**Why This Matters:**
- Creates healthy pressure WITHOUT panic
- Builds in natural buffer time
- Prevents "I work best under pressure" trap
- Reduces all-nighters and rushed work

**Code Location:** 
- Logic: `apps/api/src/lib/adhd-guardian.ts` (lines 113-151)

---

### **3. Recovery Forcing** 🛑✅

**Problem:** ADHD hyperfocus leads to burnout. Your daughter might schedule 8 hours of deep work, crash hard, and lose momentum for days.

**Solution:**
- **4-hour daily limit** - Maximum deep work per day
- **Automatic blocking** - System REFUSES to schedule more after 4hr
- **Guilt-free enforcement** - "Recovery forced" message (not "you failed")
- **Burnout prevention** - Protects long-term productivity

**How it Works:**
```
Daily Deep Work Tracking:

9 AM - 10:30 AM: Paper research (90 min) ← Total: 1.5hr
11 AM - 12:30 PM: Math homework (90 min) ← Total: 3hr
2 PM - 3 PM: Study for exam (60 min) ← Total: 4hr

3 PM: User tries to schedule more work
System: "🛑 Recovery forced! You've done 4 hours of deep work today.
        Time for Chill blocks, admin tasks, or rest."
```

**What Counts as "Deep Work":**
- Focus blocks (homework, papers, problem sets)
- Studying for exams
- Research
- Writing

**What DOESN'T Count:**
- Chill blocks
- Classes (you're listening, not actively working)
- Office hours
- Admin tasks (submitting, organizing)

**Database Schema:**
```sql
daily_deep_work_summary:
  - user_id, date
  - total_deep_work_minutes
  - recovery_forced: TRUE if blocked scheduling
  - Updated in real-time as Focus blocks are scheduled
```

**API Endpoints:**
- `GET /api/adhd/deep-work-today` - Get current deep work minutes
- `GET /api/adhd/can-schedule-deep-work` - Check if can schedule more

**Code Location:** 
- Logic: `apps/api/src/lib/adhd-guardian.ts` (lines 153-231)
- API: `apps/api/src/routes/adhd-features.ts` (lines 99-134)

---

### **4. Grade Rescue Logic** 🚨✅

**Problem:** Your daughter has a 1.65 GPA. Some courses need URGENT attention, but the system treats all assignments equally.

**Solution:**
- **Current grade tracking** - Store grade for each course
- **Automatic priority boost** - Assignments in struggling courses get +25% priority
- **Major course boost** - Assignments in major courses get +25% priority
- **Compound boosts** - Major course with low grade = +50% total

**How it Works:**
```
Course: English 101
Current Grade: 68% (< 75% threshold)
Is Major: No

English essay due Friday:
  Base priority: 0.65
  Grade rescue boost: +25%
  FINAL PRIORITY: 0.81 ← Moves to top of schedule

---

Course: Computer Science 201
Current Grade: 72% (< 75% threshold)
Is Major: Yes

CS project due Friday:
  Base priority: 0.65
  Grade rescue boost: +25%
  Major course boost: +25%
  FINAL PRIORITY: 0.97 ← URGENT, scheduled ASAP
```

**Grade Thresholds:**
- **< 75%**: Rescue mode activated (+25% priority)
- **≥ 75%**: Good standing (no boost)

**Database Schema:**
```sql
courses:
  - current_grade: 0-100 (NULL if not tracked)
  - is_major: TRUE/FALSE
  - grade_updated_at: Timestamp of last update
```

**API Endpoints:**
- `POST /api/adhd/update-grade` - Update course grade
- `POST /api/adhd/set-major` - Flag course as major
- `GET /api/adhd/priority/:assignmentId` - Calculate comprehensive priority

**Code Location:** 
- Logic: `apps/api/src/lib/adhd-guardian.ts` (lines 233-310)
- API: `apps/api/src/routes/adhd-features.ts` (lines 136-211)

---

## 🧮 **Comprehensive Priority Calculation**

All Priority 2 features combine into a **single priority score**:

```typescript
PRIORITY = (Urgency × 0.4 + GradeWeight × 0.4) 
           × GradeRescueBoost 
           × EnergyMultiplier 
           × StuckPenalty

Where:
- Urgency: 0.0-1.0 (with artificial urgency applied)
- GradeWeight: 0.0-1.0 (assignment weight in course)
- GradeRescueBoost: 1.0-1.5 (1.25 if grade < 75%, 1.25 if major, 1.5 if both)
- EnergyMultiplier: 0.1-1.5 (0.1 if exhausted, 1.5 if energized)
- StuckPenalty: 0.5 if stuck (needs intervention, not more pressure)
```

**Example:**

```
Assignment: English Essay
Due: Tomorrow (with artificial urgency → "today")
Course Grade: 68% (< 75%)
Major Course: No
Energy Level: 5/10 (medium)
Stuck: No

Calculation:
  Urgency: 0.67 (due "today" after artificial urgency)
  GradeWeight: 0.15 (15% of course grade)
  GradeRescueBoost: 1.25 (grade < 75%)
  EnergyMultiplier: 1.0 (medium energy)
  StuckPenalty: 1.0 (not stuck)

PRIORITY = (0.67 × 0.4 + 0.15 × 0.4) × 1.25 × 1.0 × 1.0
         = 0.41 × 1.25
         = 0.51 ← MEDIUM-HIGH priority
```

**Code Location:** `apps/api/src/lib/adhd-guardian.ts` (lines 312-369)

---

## 🧪 **How to Test**

### **Test 1: Wall of Awful Detection**

1. Create an assignment
2. Call `POST /api/adhd/track-deferral` three times with the same assignment ID
3. Check `GET /api/adhd/stuck-assignments` - should show the assignment as stuck
4. Look for console log: `⚠️ Assignment "..." is now STUCK (3 deferrals)`

### **Test 2: Artificial Urgency**

1. Create an assignment due in 3 days
2. Call `GET /api/adhd/priority/:assignmentId`
3. Check priority score - should be higher than normal (treating deadline as 24h earlier)
4. Look for console log: `[Artificial Urgency] Adjusted deadline: ... → ...`

### **Test 3: Recovery Forcing**

1. Schedule 4 hours of Focus blocks for today
2. Try to schedule more: `GET /api/adhd/can-schedule-deep-work`
3. Should return `canSchedule: false` with reason "Recovery forced"
4. Look for console log: `🛑 RECOVERY FORCED - No more deep work today!`

### **Test 4: Grade Rescue Logic**

1. Update a course grade to 68%: `POST /api/adhd/update-grade`
2. Create an assignment in that course
3. Call `GET /api/adhd/priority/:assignmentId`
4. Priority should be boosted by 1.25x
5. Look for console log: `🚨 Course "..." needs rescue (grade: 68%)`

---

## 📊 **Success Metrics**

Your daughter should experience:

✅ **Fewer task paralysis episodes** - Wall of Awful catches stuck patterns early  
✅ **Less last-minute panic** - Artificial urgency creates earlier pressure  
✅ **Sustained energy** - Recovery forcing prevents burnout cycles  
✅ **Improved struggling grades** - Grade rescue prioritizes rescue courses  
✅ **Higher completion rates** - System protects long-term productivity  

---

## 🎓 **The "Benevolent Advisor" Philosophy**

These features embody the core principle: **The system protects the user from themselves.**

The ADHD Guardian:
- 🧠 **Recognizes patterns** (deferrals, burnout, grade struggles)
- 🛡️ **Intervenes early** (before crisis/shame/panic)
- 💪 **Enforces boundaries** (4hr limit, not "suggestions")
- 🎯 **Prioritizes rescue** (boost struggling courses)
- 🚫 **Reduces shame** ("stuck" not "lazy", "recovery" not "failure")

**This is executive function support as a service.** 🧠✨

---

## 🚀 **What's Next**

Now that Priority 1 & 2 are complete, future features:

- **Before-Class Review Optimization** - Schedule 15m review before each class
- **Spaced Repetition** - Auto-schedule exam study sessions
- **Subject Switching Tax** - Enforce 30m buffer between different subjects
- **Wall of Awful Auto-Chunking** - Automatically break stuck tasks into micro-tasks
- **Burnout Detection** - Track multi-day patterns, force rest days

---

## 📝 **API Reference**

### **Wall of Awful**
```
GET    /api/adhd/stuck-assignments          - Get stuck assignments
POST   /api/adhd/track-deferral             - Record deferral
POST   /api/adhd/intervention-shown/:id     - Mark intervention shown
POST   /api/adhd/reset-stuck/:id            - Reset stuck flag
```

### **Recovery Forcing**
```
GET    /api/adhd/deep-work-today            - Get deep work minutes
GET    /api/adhd/can-schedule-deep-work     - Check if can schedule more
```

### **Grade Rescue**
```
POST   /api/adhd/update-grade               - Update course grade
POST   /api/adhd/set-major                  - Set course as major
GET    /api/adhd/priority/:assignmentId     - Calculate comprehensive priority
```

### **Health Check**
```
GET    /api/adhd/health                     - Service status
```

---

## ✅ **Implementation Complete!**

**Priority 1:** ✅ Micro-Chunking, Time Blindness Overhead, Transition Tax  
**Priority 2:** ✅ Wall of Awful, Artificial Urgency, Recovery Forcing, Grade Rescue

**Your daughter now has a system that:**
- Breaks overwhelming tasks into manageable pieces
- Accounts for ADHD time perception issues
- Protects against burnout
- Catches stuck patterns early
- Prioritizes courses that need rescue
- Enforces healthy boundaries

**This isn't just a calendar app. It's an ADHD-specific executive function support system.** 🎯🧠✨



