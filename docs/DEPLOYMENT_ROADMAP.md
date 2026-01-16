# Deployment Roadmap: Neuro-Adaptive Scheduling

**Created:** 2026-01-09
**Status:** Post-Refactor Stabilization

---

## Current State

### ✅ Completed (Refactor Phase)
- [x] Explicit mode-based state management (`propose` | `undo`)
- [x] Proposal expiration (1 hour time-based)
- [x] Event existence validation
- [x] Stale proposal prevention
- [x] End-to-end rebalancing flow (propose → apply → undo)
- [x] Frontend UI with persistent undo banner
- [x] Comprehensive logging

### ⚠️ Known Limitations
- Placeholder heuristics (simple time shifts, not policy-aware)
- No constraint enforcement (sleep, protected windows)
- No churn management (daily caps, reason validation)
- Limited error recovery for edge cases
- No data validation for impossible schedules

---

## Phase 1: Stability & Safety (Priority: CRITICAL)
**Goal:** Make it production-safe without breaking user schedules

### 1.1 Hard Constraints (Week 1)
**Why First:** Prevents scheduling disasters (e.g., 3am study sessions)

- [ ] **Sleep Protection** (CRITICAL)
  - Never schedule Focus/DeepWork after 11pm or before 7am
  - Add to `HeuristicEngine.calculateMoves()`
  - Validation: Reject any move that violates sleep window
  
- [ ] **Immovable Events** (CRITICAL)
  - Respect `is_movable=false` (Class, Work, OfficeHours)
  - Filter these out before calculating moves
  - Add test: Verify Class events never move

- [ ] **Protected Windows** (HIGH)
  - Honor `metadata.protected=true` windows
  - Check in `HeuristicEngine.getMovableEvents()`
  - Example: User-defined "No work Sundays"

- [ ] **Minimum Rest** (HIGH)
  - No Focus blocks within 8 hours of prior Focus block
  - Check in conflict detection
  - Prevent burnout scheduling

**Deliverable:** User schedules physically cannot violate core constraints

---

### 1.2 Validation & Error Recovery (Week 1-2)
**Why:** Catch bad proposals before they break user data

- [ ] **Pre-Flight Validation**
  - Check for circular dependencies in moves
  - Validate time math (end > start, duration matches)
  - Ensure no overlapping events after apply
  - Add to `RebalancingService.applyProposal()` before transaction

- [ ] **Conflict Detection Enhancement**
  - Detect scheduling conflicts BEFORE proposing
  - Mark conflicting moves with `feasibilityFlags.conflict=true`
  - Auto-exclude from proposal or warn user

- [ ] **Graceful Degradation**
  - If proposal generation fails, return empty (not 500 error)
  - If apply fails mid-transaction, ensure full rollback
  - Add retry logic for transient DB errors

- [ ] **Idempotency Keys**
  - Use `rebalancing_apply_attempts.idempotency_key`
  - Prevent duplicate applies if user clicks twice
  - Return cached result for duplicate requests

**Deliverable:** System handles errors gracefully; no data corruption

---

### 1.3 Data Integrity & Monitoring (Week 2)
**Why:** Detect issues before users report them

- [ ] **Audit Logging**
  - Log every proposal generation with input params
  - Log every apply/undo with affected event IDs
  - Store in `rebalancing_apply_attempts` with full context

- [ ] **Health Checks**
  - API endpoint: `GET /api/rebalancing/health`
  - Verify: DB connection, proposal generation, snapshot creation
  - Return: Last successful operation timestamps

- [ ] **Proposal Quality Metrics**
  - Track: proposals generated, applied, rejected, undone
  - Calculate: acceptance rate, undo rate
  - Alert if undo rate > 30% (indicates bad heuristics)

- [ ] **Snapshot Validation**
  - Before applying, verify snapshot was created successfully
  - On undo, verify all events in snapshot still exist
  - Log snapshot size and event count

**Deliverable:** Observability into system health and user satisfaction

---

## Phase 2: Core Heuristics (Priority: HIGH)
**Goal:** Implement intelligent scheduling logic per PRD

### 2.1 Constraint-Aware Scheduling (Week 3)
**Replace placeholder logic with policy-based moves**

- [ ] **Transition Tax Implementation**
  - Standard: 15m buffer between any tasks
  - Subject Switch: 30m buffer (Math → English)
  - Read course metadata to detect subject changes
  - Apply in `HeuristicEngine.calculateMoves()`

- [ ] **Energy-Aware Filtering**
  - Accept `energyLevel` in `POST /api/rebalancing/propose`
  - Low: Filter out high-difficulty, prefer quick wins
  - High: Prioritize Major/DeepWork
  - Read `assignments.difficulty` and `courses.is_major`

- [ ] **Block Type Awareness**
  - Deep Work: Max 90min, require 15m buffer after
  - Chill: Only low-cog tasks, no academic reading
  - Detect based on `calendar_events.event_type`
  - Enforce in move generation logic

**Deliverable:** Moves respect cognitive load and context switching

---

### 2.2 Prioritization Formula (Week 3-4)
**Implement the "Advisor Logic"**

```
Score = (Urgency × W) + (Impact × W) + (Fit × W) − Friction
```

- [ ] **Calculate Assignment Priority Scores**
  - Urgency: Days until due date (higher = more urgent)
  - Impact: `courses.is_major` (+25%), `current_grade < 75%` (rescue boost)
  - Fit: Match `assignments.difficulty` to current `energyLevel`
  - Friction: Number of prior deferrals (Wall of Awful detection)

- [ ] **Apply to Move Selection**
  - Sort movable events by priority score
  - Move lower-priority (Chill) before higher (Focus)
  - Prefer creating new Focus blocks over moving existing ones

- [ ] **Artificial Urgency**
  - For chronic procrastinators: treat deadlines as 24h earlier
  - Store user preference: `user_settings.artificial_urgency_offset`
  - Apply in urgency calculation

**Deliverable:** System prioritizes like a benevolent advisor

---

### 2.3 Churn Management (Week 4)
**Prevent schedule thrashing**

- [ ] **Daily Churn Cap**
  - Default: Max 3-5 proposal applies per day
  - Check `rebalancing_apply_attempts` count for today
  - If exceeded, batch suggestions for tomorrow
  - Stored in `churn_settings.daily_cap_proposals`

- [ ] **Reason Code Validation**
  - Ensure every move has valid reason codes
  - Display in UI tooltips
  - Log for analytics to improve heuristics

- [ ] **Churn Cost Tracking**
  - Calculate: total minutes moved per day
  - Update `churn_ledger` on every apply
  - Alert user if churn > 2 hours/day

**Deliverable:** Users not overwhelmed by constant schedule changes

---

## Phase 3: Advanced Features (Priority: MEDIUM)
**Goal:** Implement Wall of Awful, Splitting, Gamification

### 3.1 Wall of Awful Protocol (Week 5)
- [ ] Stuck detection (deferred 3+ times)
- [ ] Prompt for micro-task breakdown
- [ ] Block auto-scheduling until decomposed

### 3.2 Splitting Strategy (Week 5-6)
- [ ] Ghost row creation (`status: Scheduled`)
- [ ] Context overhead (+20% for day splits)
- [ ] Micro-chunking (45m caps for Low Interest + High Difficulty)

### 3.3 Gamification (Week 6)
- [ ] Reward time calculation (`reward_time_minutes`)
- [ ] Guilt-free payload API
- [ ] Frontend reward bar

---

## Phase 4: Polish & Optimization (Priority: LOW)
**Goal:** Performance, UX improvements

### 4.1 Performance
- [ ] Cache frequent queries (user settings, course data)
- [ ] Optimize proposal generation (< 500ms)
- [ ] Background job for expired proposal cleanup

### 4.2 UX Enhancements
- [ ] Calendar diff visualization (before/after)
- [ ] Proposal history view
- [ ] Batch proposal mode (review multiple at once)

---

## Testing Strategy

### Critical Path Tests (Before Phase 1 Deploy)
1. **Constraint Enforcement**
   - Generate 100 proposals, verify none violate sleep/protected windows
   - Apply proposals, verify no Class events moved

2. **Undo Reliability**
   - Apply proposal → Undo → Verify exact restoration
   - Delete event → Apply proposal → Should fail gracefully

3. **Concurrent Operations**
   - Two users apply proposals simultaneously → No deadlocks
   - User applies while another undoes → Correct isolation

4. **Edge Cases**
   - Empty calendar → Should return "no proposals"
   - All events immovable → Should return "no proposals"
   - Proposal applied twice → Should be idempotent

---

## Deployment Checklist

### Phase 1 (Stability) Ready When:
- [x] Refactor complete
- [ ] Hard constraints implemented
- [ ] Validation & error recovery in place
- [ ] Monitoring/logging active
- [ ] All critical path tests passing
- [ ] Rollback plan documented

### Phase 2 (Heuristics) Ready When:
- [ ] Phase 1 stable in production for 1 week
- [ ] < 5% undo rate
- [ ] No constraint violations logged
- [ ] Core heuristics implemented
- [ ] A/B test shows improvement over placeholder

### Phase 3 (Advanced) Ready When:
- [ ] Phase 2 user feedback positive
- [ ] < 10% undo rate
- [ ] Churn cap prevents thrashing
- [ ] Advanced features tested with beta users

---

## Risk Mitigation

### High-Risk Changes
1. **Heuristic Changes** → Deploy behind feature flag, A/B test
2. **Database Migrations** → Test rollback, have backup
3. **Constraint Logic** → Extensive unit tests, manual QA

### Rollback Plan
1. Kill API server
2. Revert to previous git commit
3. Restart API server
4. Cancel all `proposed` proposals in DB
5. Monitor for 15 minutes

### Communication Plan
- Alpha: Internal testing only (you + 2-3 users)
- Beta: 10-20 users, daily check-ins
- GA: Gradual rollout (10% → 50% → 100%)

---

## Success Metrics

### Phase 1 (Stability)
- Zero constraint violations in 1 week
- Zero data corruption incidents
- < 1% error rate in proposal generation

### Phase 2 (Heuristics)
- < 10% undo rate
- > 50% proposal acceptance rate
- Avg churn < 60 min/day per user

### Phase 3 (Advanced)
- > 70% proposal acceptance rate
- Measurable reduction in missed deadlines
- Positive user feedback on "benevolent advisor" feel

---

**Next Steps:**
1. Review this roadmap with team
2. Choose: Stability-first (Phase 1) vs. Feature-first (Phase 2)
3. Set timeline and assign owners
4. Begin implementation

**Recommendation:** Start with Phase 1 (Stability) - a broken fast car is worse than a slow reliable car.





