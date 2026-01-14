# Dashboard (Chill Bank + Grade Forecast) — Backend PRD

## Feature Overview
Backend service powering the Dashboard's Chill Bank and Grade Forecast. Returns a single aggregated payload for the current (or specified) period with: weekly Focus minutes, earned vs. spent Chill minutes, on-track status versus user's target study ratio; basic per-course grade forecast; at-a-glance upcoming items and current focus streak. Supports realtime updates via Supabase Realtime.

## Requirements

### Authentication and scope
- Require Clerk-authenticated user. Map to `users.id` via Clerk `user_id`.
- Enforce RLS: user can only read own records.

### Endpoint

#### GET `/api/dashboard`

**Query params:**
- `period`: `week|custom` (default: `week`)
- `start`: ISO8601 (required if `period=custom`)
- `end`: ISO8601 (required if `period=custom`, inclusive of end day at 23:59:59 in user timezone)
- `tz`: IANA timezone (default from `users.timezone`; fallback UTC)
- `unknownPolicy`: `zero|ignore` (default: `zero`) for grade forecast
- `limitToday`: integer (default 5) max items in `today_upcoming`

**Response fields:**

```json
{
  "period": {
    "start": "ISO8601",
    "end": "ISO8601",
    "tz": "IANA"
  },
  "chill_bank": {
    "focus_minutes_week": 0,
    "earned_chill_minutes_week": 0,
    "spent_chill_minutes_week": 0,
    "net_chill_minutes_week": 0,
    "target_ratio": 2.5,
    "ratio_achieved": null,
    "status": "on_track|behind",
    "notes": "optional warnings"
  },
  "grade_forecast": {
    "policy": "zero|ignore",
    "courses": [
      {
        "course_id": "UUID",
        "course_name": "string",
        "weights_valid": true,
        "current_score_percent": 0-100,
        "projected_score_percent": 0-100,
        "missing_count": 0,
        "warnings": ["string"]
      }
    ],
    "label": "Estimates only"
  },
  "at_a_glance": {
    "today_upcoming": [
      {
        "id": "UUID",
        "type": "assignment|exam|event",
        "title": "string",
        "due_at": "ISO8601",
        "dt_start": "ISO8601",
        "is_office_hours": false
      }
    ],
    "week_upcoming_count": 0,
    "current_focus_streak_days": 0
  },
  "accessibility": {
    "summaries": {
      "chill_bank_text": "string",
      "grade_forecast_text": "string"
    }
  },
  "realtime": {
    "channels": ["focus_sessions", "assignments", "courses", "events"]
  }
}
```

### Business logic

#### Period
- If `period=week`, compute current ISO week boundaries in user tz.

#### Chill Bank
- `focus_minutes_week`: sum `focus_sessions.duration` where `mode='focus'` and session overlaps period.
- `spent_chill_minutes_week`: sum `focus_sessions.duration` where `mode='chill'`.
- `earned_chill_minutes_week`: `floor(focus_minutes_week / target_ratio)`.
- `status`: `on_track` if `net_chill_minutes_week >= 0`; `behind` otherwise.

#### Grade forecast
- **Source:** `courses.grade_weights_json` (categories with weights, e.g., `[{key, weight}]`).
- **Validate weights:** sum within 0.99–1.01; normalize if outside, set `weights_valid=false`.
- For each course, compute category average from graded items (`assignments.grade_received` or `points_earned/points_possible`).
- **unknownPolicy:**
  - `zero`: treat ungraded items as 0 in their category average.
  - `ignore`: exclude ungraded items from averages.
- Combine category averages by weight to `current_score_percent`; `projected_score_percent` equals `current_score` under `ignore`; under `zero` includes unknowns as 0.

#### At-a-glance
- `today_upcoming`: due today in tz from assignments/exams/events; mark `is_office_hours` if `event.type='office_hours'`.
- `current_focus_streak_days`: consecutive days up to today with `focus_minutes >= users.streak_min_per_day` (default 10).

### Data sources (read-only)
- `users`: id, clerk_user_id, timezone, target_study_ratio (float), streak_min_per_day (int)
- `focus_sessions`: user_id, mode enum('focus','chill'), started_at, ended_at, duration_minutes
- `courses`: id, user_id, name, grade_weights_json (JSONB)
- `assignments`: id, user_id, course_id, title, category_key, due_at, points_possible, points_earned (nullable), grade_received (nullable percent)
- `events`: id, user_id, type enum('office_hours', 'class', …), title, dt_start, dt_end

### Realtime
- Client subscribes to Supabase Realtime on `focus_sessions`, `assignments`, `courses`, `events` where `user_id = current user`. On insert/update/delete within period, re-fetch `/api/dashboard`.

### Validation
- Enforce ISO8601 for dates; 400 on invalid.
- `unknownPolicy` must be `zero|ignore`; 400 otherwise.
- Limit `limitToday` to 1–20; default 5.

### Security
- Clerk JWT verification; map to `users.id`.
- RLS: `user_id = auth.uid()`.
- Rate limit: 60 req/min per user.

### Performance
- **Response SLA:** p95 < 300ms for week period, < 600ms for custom up to 90 days.
- **Indexes:** `focus_sessions(user_id, started_at)`, `assignments(user_id, due_at)`, `events(user_id, dt_start)`, `courses(user_id)`.
- Aggregate with time-bounded queries; avoid cross-user scans.

## User Stories
- As a student, I see if I'm on track this week based on my Focus vs. Chill bank.
- As a student, I view estimated course grades, with an option to exclude unknowns.
- As a student, I see today's key items and my current focus streak.

## Technical Considerations
- Timezone-aware boundary calculations; include sessions overlapping edges proportionally by overlap minutes.
- If both points and percent exist, prefer points (`earned/possible`) for precision.
- Accessibility summaries must be concise and deterministic.

## Success Criteria
- API returns complete payload with on-track status, grade forecasts, at-a-glance, and summaries.
- Realtime updates reflect within 2 seconds of data change via client resubscription/refetch.
- Authenticated users only; zero data leakage across users.
- Meets performance SLA for 95% of requests over rolling 7 days.

