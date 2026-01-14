# Dashboard (Chill Bank + Grade Forecast) — Frontend PRD

## Feature Overview
A single dashboard surface showing: (1) weekly Focus minutes and earned Chill minutes with an on-track indicator, and (2) per-course grade forecasts with an "estimates only" label and a toggle for handling missing grades. At-a-glance tiles summarize Today/This Week items, Office Hours, and the current focus streak. All panels update in realtime from Supabase without manual refresh.

## Requirements

### Layout
- **Desktop:** two-column grid (lg and up): left = Chill Bank + At-a-glance; right = Grade Forecast list. Mobile: stacked cards.
- Use shadcn/ui Cards, Progress, Badge/Pill, Toggle, Tooltip. Tailwind for spacing/contrast.

### Chill Bank
- Display this week's Focus minutes (sum of `focus_sessions` within local week, Mon 00:00–Sun 23:59).
- **Earned Chill minutes** = `floor(FocusMinutes / users.target_study_ratio)`. Default ratio = 2.5 if null.
- If chill usage exists (`chill_sessions.duration` this week), show:
  - **Available Chill** = Earned – Spent; **On-track** (green pill) if Available ≥ 0, **Behind** (amber/red pill) if < 0.
- If no chill usage tracking present, hide Available/On-track and show only Focus + Earned.
- **Visuals:** dual metric header (Focus min, Earned Chill min), progress bar indicating proportion of Focus toward next 30 min Chill increment, small text "Calculated at ratio X:Y".
- Tooltips for formulas; aria-live for metric updates.
- **States:** zero-focus (prompt to start a Focus session), large surplus, behind (negative available).

### Grade Forecast (basic)
- **Header with toggle:** "Count missing as 0" (default OFF). Persist per user (`users.settings` JSON).
- **Per-course card list:**
  - Course name/code, projected percent + letter grade, progress bar filled to projected percent.
  - Badge "Estimates only".
- **Calculations:**
  - **Completed-only mode** (toggle OFF): `Projected = sum(grade_i * weight_i) / sum(weights_completed)`.
  - **Missing-as-zero mode** (toggle ON): `Projected = sum(grade_i * weight_i) / sum(total_weights)`, treating missing as 0.
  - `grade_weights_json` is the canonical weight source; if assignment-level overrides exist, use assignment weight > category default.
  - Show "No graded work yet" empty state for courses with no completed items.
- **Expandable details** (accordion): show weighted components with completion %, list last 3 graded items, and next graded items (due date).
- Unknown weight items labeled "Unweighted" and excluded from denominator; show warning icon.

### At-a-glance
- **Today** (next 3) and **This Week** (next 5) from events/assignments; Office Hours flagged with a distinct icon/tag.
- **Current streak** (consecutive days with ≥1 focus session) as a pill with count.
- Clicking an item opens its detail route/sheet.

### Realtime
- Auto-update on new/updated `focus_sessions`, `chill_sessions`, `assignments`, `grades`, and schedule events via Supabase Realtime. No page reload.

### Accessibility
- High-contrast palette (meets WCAG AA). Keyboard navigable: tab order, focus outlines, space/enter to toggle/expand.
- Charts must include text equivalents (percentages, minutes) and aria-labels.
- Live updates announced via `aria-live=polite`; tooltips accessible.

### Responsive
- Mobile: 1-column; Medium: 2-column; keep tap targets ≥44px; truncate long course names with title tooltip.

## User Stories
- As a student, I see how much Chill I've earned from Focus this week and whether I'm on track without opening other pages.
- As a student, I can view my current course grades and understand how missing grades affect the forecast.
- As a student, I see what's due today/this week and my streak, updating in realtime.

## Technical Considerations
- **Data sources** (Supabase): `users.target_study_ratio`; `focus_sessions` (start, end, duration, created_at); `chill_sessions` (duration); `courses`; `assignments` (due_at, weight/category); `grades` (assignment_id, percent/points); `schedule_events` (office_hours boolean/tag).
- **Timezone:** use user profile TZ; week boundary is locale-based (configurable later; default Monday start).
- **Realtime channels:** subscribe to relevant tables; debounce UI updates to ≤1/sec.
- **Persistence:** forecast toggle saved to `users.settings` JSON.
- **Performance:** initial render ≤200ms main thread; list virtualization not required (<20 courses).

## Success Criteria
- Metrics update within 2 seconds of backend change (p95).
- Forecast percent matches backend-calculated value within 0.5%.
- **A11y:** Keyboard-only usable; color contrast AA; screen reader announces metric changes.
- Zero-error console in production; no UI jank on mobile mid-tier devices.
- User can understand forecast assumptions (toggle + "Estimates only" badge) without external help.

