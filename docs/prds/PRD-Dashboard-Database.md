# Dashboard — Database PRD

## Purpose
- Provide fast, consistent read models for the home dashboard (agenda, due soon, nudges, streaks, focus summary, and rebalancing suggestions).
- Maintain source traceability back to normalized tables (assignments, calendar, nudges, proposals).
- Support sub‑200ms P95 fetches via materialized views and/or a per‑user JSON snapshot.

## Primary sources (existing tables)
- `calendar_events_new` (events; includes `is_movable`, `metadata` JSONB)
- `assignments` (`due_date`, `course_id`, `dedupe_hash`, etc.)
- `courses` (`code`, `name`)
- `class_nudges` (post‑class nudges; notes JSONB; resolved flags)
- `user_streaks` (`streak_type` includes 'productivity')
- `focus_sessions` (per‑session focus logs; if not present, derive from `calendar_events_new` of type `Focus`)
- `rebalancing_proposals`, `proposal_moves` (latest proposal state and moves)
- `quick_add_logs` (recent captures; optional for telemetry)

## Read models (materialized views or standard views)

### 1) `v_dashboard_agenda_next`
**Purpose:** Upcoming agenda for "Today + Tomorrow."

**Columns:**
- `user_id` (UUID)
- `event_id` (UUID)
- `start_at` (TIMESTAMPTZ)
- `end_at` (TIMESTAMPTZ)
- `title` (TEXT)
- `location` (TEXT)
- `course_id` (UUID, nullable)
- `course_code` (TEXT, nullable)
- `event_type` (TEXT) — e.g., `Class|Exam|Focus|Other`
- `is_movable` (BOOLEAN)
- `metadata` (JSONB) — includes `assignment_id` if present
- `day_bucket` (DATE) — local day for grouping (today/tomorrow)
- `sort_key` (INT) — for stable UI ordering

**Filter:**
- `start_at >= now()`
- `start_at < (now() + interval '2 days')`

**Indexes (source):**
- `calendar_events_new(user_id, start_at)`
- `calendar_events_new(user_id, is_movable, start_at)`
- Optional: expression index on `(metadata->>'assignment_id')`

### 2) `v_dashboard_assignments_due_soon`
**Purpose:** Assignments due within next 7 days, with lightweight priority.

**Columns:**
- `user_id` (UUID)
- `assignment_id` (UUID)
- `course_id` (UUID)
- `course_code` (TEXT)
- `title` (TEXT)
- `category` (TEXT)
- `due_date` (TIMESTAMPTZ)
- `days_remaining` (NUMERIC(5,2))
- `priority_score` (NUMERIC(6,3)) — simplified: deadline_urgency with optional importance if available
- `metadata` (JSONB) — passthrough from assignments if stored

**Filter:**
- `due_date BETWEEN now() AND (now() + interval '7 days')`

**Indexes (source):**
- `assignments(course_id, due_date)`
- `assignments(parse_run_id)` if used
- `assignments(dedupe_hash)` if used for cross‑run dedupe

### 3) `v_dashboard_pending_nudges`
**Purpose:** Unresolved post‑class nudges awaiting action.

**Columns:**
- `user_id` (UUID)
- `nudge_id` (UUID)
- `course_id` (UUID)
- `class_date` (DATE)
- `requires_logistics_prompt` (BOOLEAN) — from payload/notes
- `status` (TEXT) — `pending|resolved`
- `created_at` (TIMESTAMPTZ)
- `notes` (JSONB) — includes logistics prompt state if recorded

**Filter:**
- `status = 'pending' OR resolved_at IS NULL`
- `created_at >= (now() - interval '36 hours')` (configurable)

**Indexes (source):**
- `class_nudges(user_id, created_at DESC)`
- `class_nudges(user_id, status)`

### 4) `v_dashboard_focus_summary`
**Purpose:** Roll‑ups of user focus time for Yesterday and Last 7 Days.

**Columns:**
- `user_id` (UUID)
- `minutes_yesterday` (INT)
- `minutes_last7` (INT)
- `sessions_last7` (INT)
- `last_session_at` (TIMESTAMPTZ)
- `source` (TEXT) — `'focus_sessions'` or `'calendar_events_new'`

**Computation:**
- Prefer `focus_sessions`; fallback: `calendar_events_new` where `event_type='Focus'` or `metadata.focus=true`

**Indexes (source):**
- `focus_sessions(user_id, started_at)`
- `calendar_events_new(user_id, start_at)`

### 5) `v_dashboard_streaks`
**Purpose:** Current and longest productivity streaks.

**Columns:**
- `user_id` (UUID)
- `streak_type` (TEXT) — `'productivity'`
- `current_streak` (INT)
- `longest_streak` (INT)
- `last_increment_at` (TIMESTAMPTZ)

**Indexes (source):**
- `user_streaks(user_id, streak_type)`

### 6) `v_dashboard_rebalance_summary`
**Purpose:** Surface latest proposal summary if any.

**Columns:**
- `user_id` (UUID)
- `proposal_id` (UUID)
- `created_at` (TIMESTAMPTZ)
- `moves_count` (INT)
- `churn_cost` (INT) — total minutes moved or normalized churn
- `status` (TEXT) — `proposed|applied|partially_applied`
- `reason_codes` (JSONB) — aggregated
- `has_conflicts` (BOOLEAN)

**Filter:**
- latest per user (e.g., `created_at` in last 24h)

**Indexes (source):**
- `rebalancing_proposals(user_id, created_at DESC)`
- `proposal_moves(proposal_id)`
- `proposal_moves(metadata)` GIN (for reason_codes/assignment_id) if needed

### 7) `v_dashboard_counts`
**Purpose:** One‑shot counts for top‑level cards/badges.

**Columns:**
- `user_id` (UUID)
- `inbox_assignments_count` (INT) — `status='Inbox'` if modeled
- `due_today_count` (INT)
- `upcoming_exams_count` (INT) — `category='Exam'` in assignments or `event_type='Exam'` in calendar
- `pending_nudges_count` (INT)

**Indexes (source):**
- `assignments(user_id, due_date)`
- `assignments(category)`
- `class_nudges(user_id, status)`

### Optional cache table (for single-query fetch)

#### 8) `dashboard_snapshots`
**Purpose:** Per‑user aggregated JSON snapshot for ultra‑fast dashboard loads.

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, UNIQUE)
- `period` (TEXT) — `'today'` (primary), optional `'rolling_7d'`
- `payload` (JSONB) — structure:
  ```json
  {
    "agenda": [/* items from v_dashboard_agenda_next */],
    "dueSoon": [/* items from v_dashboard_assignments_due_soon */],
    "nudges": [/* items from v_dashboard_pending_nudges */],
    "focusSummary": {/* object from v_dashboard_focus_summary */},
    "streaks": {/* object from v_dashboard_streaks */},
    "rebalance": {/* object from v_dashboard_rebalance_summary */},
    "counts": {/* object from v_dashboard_counts */}
  }
  ```
- `computed_at` (TIMESTAMPTZ)

**Indexes:**
- `UNIQUE (user_id)`
- `computed_at DESC` (optional for monitoring)

**Computation:**
- Background job refreshes snapshot on schedule or event‑driven (assignment upsert, event change, nudge state change).
- **SLA:** compute within 250ms median/500ms P95 per user; degrade gracefully to live view queries if stale > 10 minutes.

## Security and RLS
- All source tables already enforce RLS by `user_id`
- For views: `SECURITY BARRIER` where applicable; ensure predicates carry `user_id` filters
- `dashboard_snapshots`: RLS enabled; policy `user_id = current_user_id()`

## Performance notes
- Use covering indexes shown in each source table
- Consider `MATERIALIZED VIEW` for `v_dashboard_*` with `REFRESH CONCURRENTLY` in off‑peak or event‑driven
- For very large datasets, paginate agenda and due soon, or fetch via snapshot only

## Data freshness and retention
- **Snapshot TTL:** 10 minutes (configurable)
- **Focus summary:** `last7` window sliding; no extra retention
- **Rebalance summary:** show most recent proposal within 24h; archive older in base tables
- **Nudges:** only show pending within 36h; resolved hidden from dashboard

## Field conventions and compatibility
- `assignments.due_date` retained (legacy naming)
- `calendar_events_new` uses `metadata` JSONB for `assignment_id` linkage
- Use local timezone when bucketizing by day for agenda; store `TIMESTAMPTZ` in sources

## Examples (payload shapes for snapshot)

### agenda item
```json
{
  "eventId": "UUID",
  "title": "string",
  "startAt": "ISO8601",
  "endAt": "ISO8601",
  "courseCode": "string",
  "isMovable": true,
  "type": "Class|Exam|Focus|Other",
  "assignmentId": "UUID (optional)"
}
```

### due soon item
```json
{
  "assignmentId": "UUID",
  "title": "string",
  "dueDate": "ISO8601",
  "courseCode": "string",
  "daysRemaining": 2.5,
  "priorityScore": 0.85
}
```

### focus summary
```json
{
  "minutesYesterday": 120,
  "minutesLast7": 480,
  "sessionsLast7": 8,
  "lastSessionAt": "ISO8601"
}
```

### streaks
```json
{
  "current": 5,
  "longest": 12,
  "lastIncrementAt": "ISO8601"
}
```

### rebalance
```json
{
  "proposalId": "UUID",
  "movesCount": 3,
  "churnCost": 45,
  "status": "proposed|applied|partially_applied",
  "hasConflicts": false
}
```

### counts
```json
{
  "inboxAssignments": 5,
  "dueToday": 2,
  "upcomingExams": 1,
  "pendingNudges": 0
}
```

## Recommended additional indexes (if not already present)
- `calendar_events_new(user_id, start_at)`
- `calendar_events_new(user_id, is_movable, start_at)`
- `assignments(user_id, due_date)`
- `class_nudges(user_id, status, created_at)`
- `rebalancing_proposals(user_id, created_at DESC)`
- `focus_sessions(user_id, started_at)`

## Open configuration
- Agenda horizon (2 days) and assignment due horizon (7 days)
- Snapshot TTL
- Which sources feed focus summary (prefer `focus_sessions` if present)







