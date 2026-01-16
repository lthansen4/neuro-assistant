# Epic: AI Intelligence Layer - Pattern Learning & Predictions

**Status:** Backlogged for after current UI epic  
**Priority:** HIGH (Core differentiator)  
**Goal:** Transform Gesso from a calendar app into an AI-powered executive function prosthetic that learns from student behavior and provides actionable insights.

---

## 🎯 Vision

Every interaction with Gesso should make the AI smarter about THIS student. We're not building generic productivity advice - we're building a personalized coach that learns:
- How long things ACTUALLY take (not how long they think it will take)
- When they're most productive
- What language motivates them
- What types of tasks cause friction
- What patterns lead to success

**Success Metric:** Students on academic probation become straight-A students within 1-2 semesters.

---

## 📊 Current State

**What We Have:**
- ✅ Time tracking infrastructure (Migration 0031) - logs estimated vs actual time
- ✅ Focus session logging (tracks when students actually work)
- ✅ Deferral tracking (Wall of Awful detection)
- ✅ Improved Wall of Awful questions (better diagnostic prompts)

**What We're Missing:**
- ❌ Personalized time predictions
- ❌ Productivity pattern analysis
- ❌ Adaptive nudge system
- ❌ Risk prediction & early warnings
- ❌ Energy-aware scheduling
- ❌ Insights dashboard
- ❌ Smart question regeneration on edits (duration/course/due date)
- ❌ Context-aware question enrichment for known works/topics

---

## 🎯 User Stories

### 1. **Personalized Time Predictions** (HIGH PRIORITY)
**As a student, I want accurate time estimates based on MY past performance**  
**So I don't underestimate workload and can plan realistically**

**Acceptance Criteria:**
- [ ] When creating an assignment, show "AI suggests X min based on your past Y assignments"
- [ ] Display confidence level (e.g., "85% confidence based on 8 similar tasks")
- [ ] Learn per course (Math homework ≠ History homework)
- [ ] Learn per category (Reading vs Homework vs Projects)
- [ ] Show comparison: "You estimated 60 min, but similar tasks took you 90 min"

**Technical Requirements:**
- Query `assignment_time_logs` grouped by category/course
- Calculate average `accuracyRatio` for similar tasks
- Apply learning to Quick Add suggestions
- Show in UI when user is estimating time

**API Endpoints:**
- `GET /api/insights/time-prediction?category=Homework&courseId=abc` → Returns avg time, confidence
- Response: `{ suggestedMinutes: 90, confidence: 0.85, basedOnCount: 8, yourAvgRatio: 1.5 }`

---

### 2. **Productivity Patterns Dashboard** (MEDIUM PRIORITY)
**As a student, I want to see when I'm most productive**  
**So I can schedule hard work during my peak hours**

**Acceptance Criteria:**
- [ ] Show "Your best focus hours: 2-5 PM (85% completion rate)"
- [ ] Display "Best day for deep work: Tuesday"
- [ ] Track "Average focus session: 47 minutes"
- [ ] Show weekly trends: "You completed 12 tasks this week (up from 8)"

**Technical Requirements:**
- Analyze `sessions` table by time of day, day of week
- Calculate completion rates per time slot
- Track trends over time (weekly/monthly)
- Create new table: `productivity_patterns` (cached aggregates)

**UI Location:**
- New widget on Dashboard: "Your Patterns"
- Expandable to full "Insights" page

---

### 3. **Smart Start Reminders** (HIGH PRIORITY)
**As a student, I want to know WHEN to start working on something**  
**So I don't wait until it's too late**

**Acceptance Criteria:**
- [ ] Calculate optimal start date: `due_date - (estimated_time / daily_capacity) - 2_day_buffer`
- [ ] Send push notification: "🚨 Start your History Essay TODAY. Waiting until Thursday = 40% success rate"
- [ ] Update probability daily as due date approaches
- [ ] Show in assignment card: "Risk Level: MEDIUM - Start by Wednesday"

**Technical Requirements:**
- Calculate `daily_capacity` from historical focus session data
- Query calendar for available time slots
- Use past completion rates to estimate success probability
- Integration with OneSignal for push notifications

**API Endpoints:**
- `GET /api/insights/start-recommendation/:assignmentId` → Returns optimal start date, risk level
- `POST /api/nudges/send` → Trigger push notification

---

### 4. **Improved Wall of Awful Interventions** (DONE ✅)
**As a student, I want better questions when I'm stuck**  
**So I can actually get unstuck (not just feel bad)**

**Status:** ✅ COMPLETED - New prompt deployed with friction-focused questions

---

### 5. **Motivational Progress Tracking** (MEDIUM PRIORITY)
**As a student, I want to see my improvement over time**  
**So I stay motivated and see that the system is working**

**Acceptance Criteria:**
- [ ] Display "On-time completion rate: 65% → 78% (last 4 weeks)"
- [ ] Show "You're deferring tasks 40% less than last month"
- [ ] Track "Avg time from 'create' to 'complete': 3.2 days (down from 5.1)"
- [ ] Celebrate wins: "🎉 7-day streak! You completed tasks on time all week"

**Technical Requirements:**
- Weekly/monthly aggregates of key metrics
- Trend calculations (% change over time)
- Streak tracking (consecutive days with completions)
- Visual charts (simple line graphs)

**UI Location:**
- "Your Progress" widget on Dashboard
- Expandable to full "Stats" page

---

### 6. **Adaptive Nudge System** (LOW PRIORITY - FUTURE)
**As a student, I want notifications that actually work for ME**  
**So I take action instead of ignoring them**

**Acceptance Criteria:**
- [ ] Track which nudge types lead to action (open rate, completion rate)
- [ ] A/B test messaging styles (encouraging vs data-driven vs urgent)
- [ ] Personalize tone per student (some need "You got this!", some need "Risk: HIGH")
- [ ] Learn optimal send times (not during class, not at midnight)

**Technical Requirements:**
- New table: `nudge_effectiveness` (track open/action rates)
- A/B testing framework
- Sentiment analysis on nudge variants
- Integration with push notification delivery tracking

---

### 7. **Risk Prediction & Early Warnings** (MEDIUM PRIORITY)
**As a student, I want to know when I'm overcommitted**  
**So I can adjust BEFORE I fail**

**Acceptance Criteria:**
- [ ] Analyze upcoming week: "You have 4 assignments due Friday = 8 hrs work, but only 6 hrs free time. ⚠️ OVERCOMMITTED"
- [ ] Weekly risk report: "This week is 30% over capacity"
- [ ] Suggest actions: "Ask for extension on History Essay" or "Use 2 chill hours to catch up"
- [ ] Predict: "Based on your patterns, you have a 60% chance of completing all tasks on time"

**Technical Requirements:**
- Calendar capacity analysis (available time slots)
- Time prediction from historical data
- Risk scoring algorithm
- Actionable recommendations engine

---

### 8. **Energy-Aware Scheduling** (LOW PRIORITY - FUTURE)
**As a student, I want AI to suggest optimal work times**  
**So I work when I'm most effective (not at 9 PM when I'm exhausted)**

**Acceptance Criteria:**
- [ ] Track when focus sessions are successfully completed
- [ ] Learn: "You're 3x more likely to finish tasks between 2-5 PM"
- [ ] When Quick Add suggests "work on essay tonight", recommend: "Move to tomorrow at 2 PM? 90% completion rate"
- [ ] Auto-suggest best time slots when creating focus blocks

**Technical Requirements:**
- Completion rate analysis by time of day
- Success probability calculation per time slot
- Calendar optimization algorithm
- Smart scheduling suggestions

---

### 9. **Automatic Task Breakdown** (FUTURE - Needs Discussion)
**As a student, I don't want to manually break down large tasks**  
**So I can start immediately without planning overhead**

**Note:** This is complex because it requires understanding assignment context (syllabus, rubric, etc.). Parking for now.

---

### 10. **Smart Question Regeneration** (HIGH PRIORITY)
**As a student, I want smart questions to update when I edit duration/course/due date**  
**So the suggested session splits and scheduling options always match my changes**

**Acceptance Criteria:**
- [ ] Editing estimated duration refreshes smart questions
- [ ] Editing course or due date refreshes smart questions
- [ ] Regeneration is debounced and does not block the UI

**Technical Requirements:**
- Add endpoint to regenerate smart questions from the current draft
- Frontend debounce and refresh logic on edited fields

---

### 11. **Context-Aware Question Enrichment** (MEDIUM PRIORITY)
**As a student, I want questions to reflect known works/topics (e.g., "Infinite Jest")**  
**So scheduling advice reflects task difficulty and scope**

**Acceptance Criteria:**
- [ ] Detect common books/works/topics from assignment titles
- [ ] Enrich prompt with brief context to improve questions
- [ ] Fall back gracefully when context is unknown

**Technical Requirements:**
- Lightweight context lookup (curated list or heuristic enrichment)
- Inject enrichment into smart-question generation prompt

---

## 🛠️ Technical Implementation

### Phase 1: Foundation (Week 1) ✅ DONE
- [x] Create `assignment_time_logs` table
- [x] Add time tracking to completion flow
- [x] Improve Wall of Awful prompt

### Phase 2: Predictions (Week 2)
- [ ] Build time prediction algorithm
- [ ] Create `/api/insights/time-prediction` endpoint
- [ ] Add prediction UI to Quick Add
- [ ] Show "AI suggests X min" when estimating

### Phase 3: Patterns Dashboard (Week 3)
- [ ] Analyze historical session data
- [ ] Calculate productivity patterns
- [ ] Create "Your Patterns" widget
- [ ] Build full "Insights" page

### Phase 4: Smart Start Reminders (Week 4)
- [ ] Build start date recommendation algorithm
- [ ] Calculate risk levels
- [ ] Integrate push notifications
- [ ] Add "Optimal Start" to assignment cards

### Phase 5: Progress Tracking (Week 5)
- [ ] Weekly/monthly metric aggregates
- [ ] Trend calculations
- [ ] Streak tracking
- [ ] "Your Progress" widget

### Phase 6: Risk Prediction (Week 6)
- [ ] Calendar capacity analysis
- [ ] Risk scoring algorithm
- [ ] Weekly risk report
- [ ] Actionable recommendations

---

## 📐 Data Schema

### Existing Tables (Already Created)
```sql
-- Migration 0031
assignment_time_logs (
  id, user_id, assignment_id, course_id,
  title, category,
  estimated_minutes, actual_minutes, accuracy_ratio,
  completed_at, created_at
)
```

### Future Tables (To Be Created)
```sql
-- Cached productivity patterns (for performance)
productivity_patterns (
  id, user_id,
  time_slot, -- e.g., "14:00-15:00"
  day_of_week, -- 0-6
  completion_rate, -- 0.0-1.0
  avg_focus_duration_minutes,
  last_calculated_at
)

-- Nudge effectiveness tracking
nudge_effectiveness (
  id, user_id, nudge_id,
  message_variant, -- "encouraging" | "data-driven" | "urgent"
  sent_at, opened_at, action_taken_at,
  assignment_id, -- if nudge was for specific task
  effectiveness_score -- 0.0-1.0
)

-- Weekly capacity snapshots
weekly_capacity_snapshots (
  id, user_id, week_start_date,
  total_assignments, total_estimated_minutes,
  available_time_minutes, capacity_ratio,
  risk_level, -- "low" | "medium" | "high" | "critical"
  calculated_at
)
```

---

## 🎨 UI Mockups

### "Your Patterns" Widget (Dashboard)
```
┌─────────────────────────────────────┐
│ 📊 Your Patterns                    │
├─────────────────────────────────────┤
│ 🔥 Best focus hours: 2-5 PM         │
│    85% completion rate              │
│                                     │
│ 📅 Best day: Tuesday                │
│                                     │
│ ⏱️  Avg focus session: 47 min       │
│                                     │
│ [View Full Insights →]             │
└─────────────────────────────────────┘
```

### Time Prediction (Quick Add)
```
┌─────────────────────────────────────┐
│ Estimated time:                     │
│ [ 60 ] minutes                      │
│                                     │
│ 🤖 AI suggests 90 min               │
│    Based on your past 8 math        │
│    homeworks (85% confidence)       │
│    You usually take 1.5x longer     │
│    than estimated.                  │
└─────────────────────────────────────┘
```

---

## 📈 Success Metrics

**Quantitative:**
- Time prediction accuracy improves by 30% after 2 weeks of data
- On-time completion rate increases by 20% within 1 month
- Deferral rate decreases by 40% within 1 month
- Focus session completion rate increases by 25%

**Qualitative:**
- Students report feeling "less overwhelmed"
- Students trust AI suggestions ("It knows me")
- Students proactively check insights dashboard

---

## 🚧 Risks & Mitigations

**Risk:** Not enough data for accurate predictions in first 1-2 weeks  
**Mitigation:** Show generic averages initially, then personalize as data accumulates

**Risk:** Students game the system (mark things complete without doing them)  
**Mitigation:** Focus on helping, not policing. If they game it, predictions get worse for them.

**Risk:** Privacy concerns about tracking behavior  
**Mitigation:** Clear messaging that data is private, never shared, only used to help THEM

---

## 🎯 Next Steps (After Current Epic)

1. **Today:** ✅ Fix Wall of Awful prompt, add time tracking
2. **Tomorrow:** Continue current UI epic
3. **After UI epic:** Start Phase 2 (Time Predictions)

---

**Questions? Feedback?**  
This is a living document. Update as we learn more about what students actually need.


