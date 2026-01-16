# UX Improvements: ADHD-Friendly Design

**Date:** January 9, 2026  
**Focus:** Reduce friction, maximize automation

---

## ✅ **Improvement 1: Auto-Schedule Syllabus Imports**

### The Problem:
- Syllabus import creates assignments with `status: 'Inbox'`
- User sees 112 assignments requiring manual approval
- ❌ **ADHD barrier:** No one will manually click "Schedule" 112 times

### The Solution:
**Changed:** `status: 'Inbox'` → `status: 'Scheduled'`

**File:** `apps/api/src/lib/syllabus-commit-service.ts`

```typescript
status: 'Scheduled', // Auto-schedule syllabus imports (ADHD-friendly: no manual approval needed)
```

**Impact:**
- ✅ All syllabus assignments immediately show up in "Scheduled" view
- ✅ Zero manual approval needed
- ✅ Ready for rebalancing engine to prioritize and propose Focus blocks

---

## ✅ **Improvement 2: Smart "Add Event" Button**

### The Problem:
- "Create test event" button is not production-ready
- No easy way to quickly add assignments on the fly
- ❌ **ADHD barrier:** Too much friction to capture tasks

### The Solution:
**Replaced:** Test button → **"✨ Add Event"** with AI auto-categorization

**New Files:**
1. `apps/web/components/QuickAddDialog.tsx` - Smart form UI
2. `apps/api/src/routes/assignments.ts` - Quick-add endpoint with AI scoring
3. `apps/api/src/routes/user.ts` - Fetch user courses

**Features:**
- ✅ **AI Auto-Categorization:** Detects if it's homework, exam, project, paper, quiz, reading, discussion
- ✅ **AI Effort Estimation:** Guesses time needed based on category (exam = 3hr, quiz = 30min, etc.)
- ✅ **Auto-Scoring:** Calculates priority based on urgency (days until due) and impact (category)
- ✅ **Auto-Scheduled:** No manual approval needed
- ✅ **Minimal Input:** Just title, course (optional), and due date

---

## 🎯 **How It Works**

### Quick Add Flow:

1. **User clicks:** "✨ Add Event"
2. **Form opens:** 
   - "What do you need to do?" → e.g., "CS midterm exam"
   - Course (optional dropdown)
   - Due date

3. **AI processes:**
   ```typescript
   // Auto-detect category from title
   "CS midterm exam" → category: 'Exam'
   
   // AI effort estimate
   Exam → 180 minutes (3 hours)
   
   // Auto-calculate priority
   Due in 3 days + Exam = priority: 100 (urgent + high-impact)
   ```

4. **Assignment created:**
   - Status: `'Scheduled'` (no approval needed)
   - Shows up in dashboard immediately
   - Ready for rebalancing engine to propose Focus blocks

---

## 📊 **AI Categorization Logic**

```typescript
Title contains:          →  Category:
"exam", "test", "midterm"  →  Exam (3 hours)
"quiz"                     →  Quiz (30 min)
"project"                  →  Project (3 hours)
"paper", "essay"           →  Paper (4 hours)
"reading"                  →  Reading (30 min)
"homework", "hw"           →  Homework (1 hour)
"discussion"               →  Discussion (1 hour)
```

---

## 🚀 **Priority Scoring Formula**

```typescript
// Urgency (days until due)
< 1 day   → +100 (critical!)
< 3 days  → +80  (urgent)
< 7 days  → +50  (moderate)
> 7 days  → +20  (low)

// Impact (category)
Exam/Project  → +20  (high-stakes)
Quiz/Reading  → -10  (quick tasks)

// Final Priority: 0-100 (clamped)
```

---

## 💡 **ADHD Design Principles Applied**

1. **✅ Reduce friction:**
   - Auto-schedule = no manual approval
   - AI guesses = less typing
   - Minimal form fields = less cognitive load

2. **✅ Immediate feedback:**
   - Shows what AI detected: "Category: Exam, Estimated: 180 min"
   - Confirms assignment is scheduled

3. **✅ Smart defaults:**
   - Category auto-detected from title
   - Effort auto-estimated
   - Priority auto-calculated

4. **✅ No overwhelm:**
   - One simple form, not multiple steps
   - Optional fields are truly optional
   - Can't forget to schedule (it's automatic)

---

## 🧪 **Testing**

1. **Test auto-schedule:**
   ```bash
   # Upload a syllabus
   # Check dashboard → Should see assignments in "Scheduled", NOT "Inbox"
   ```

2. **Test Quick Add:**
   ```bash
   # Open calendar
   # Click "✨ Add Event"
   # Enter: "Math 101 midterm exam"
   # Pick due date
   # Submit
   
   # Should show:
   # "Category: Exam"
   # "Estimated: 180 min"
   # "Auto-scored and scheduled!"
   ```

---

## 📝 **Files Changed**

1. **Backend:**
   - `apps/api/src/lib/syllabus-commit-service.ts` - Changed status to 'Scheduled'
   - `apps/api/src/routes/assignments.ts` - New quick-add endpoint
   - `apps/api/src/routes/user.ts` - New courses endpoint
   - `apps/api/src/index.ts` - Registered new routes

2. **Frontend:**
   - `apps/web/components/QuickAddDialog.tsx` - New smart form component
   - `apps/web/app/(protected)/calendar/page.tsx` - Replaced test button with Quick Add

---

## 🎉 **Impact**

**Before:**
- Import syllabus → 112 assignments in Inbox → Manual approval hell ❌
- No easy way to add assignments on the fly ❌

**After:**
- Import syllabus → 112 assignments auto-scheduled ✅
- Quick Add → 3 fields, AI does the rest ✅
- Zero manual approval needed ✅
- Immediate feedback and transparency ✅

---

**ADHD-friendly UX = Frictionless + Intelligent + Transparent** 🧠✨

---

## 🔜 **Next Phase Improvements (Planned)**

### 1) Regenerate Smart Questions on Edits
**Goal:** Keep smart‑question options aligned with user edits (duration, course, due date).

**Planned Behavior:**
- When the user edits **Estimated Duration**, **Course**, or **Due Date**, the UI re-requests smart questions.
- Questions are debounced to avoid UI lag.

**Why:**
- Prevents stale options (e.g., 120‑minute splits shown after editing to 90 minutes).
- Supports longer duration edits (e.g., 240 minutes) with more relevant scheduling questions.

### 2) Context-Aware Question Enrichment (Optional)
**Goal:** Improve question quality for known works/topics (e.g., “Infinite Jest”).

**Planned Behavior:**
- Detect recognizable works/topics in the task title.
- Fetch lightweight context (curated list or heuristic enrichment).
- Pass enriched context to the AI question generator.

**Why:**
- Better prompts = better scheduling questions.
- Helps infer task difficulty and likely time requirements.





