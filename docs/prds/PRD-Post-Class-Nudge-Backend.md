# Post-Class Nudge and Check-in — Backend PRD

## Feature Overview
Post-Class Nudges & Check-ins automatically prompt students after each class to confirm updates or quickly add tasks via Magic Input. Nudges are sent at class end-time per user's local timezone, respect DND and mute settings, support fallback to in-app if push unavailable, and increment a streak on any user action.

## Requirements

### Triggering
- Generate one nudge per course instance per day at class end (`courses.schedule_json`, user timezone).
- Respect DND window; defer nudges to next morning at DND end (e.g., 07:00 local).
- Rate limit: 1 nudge per course/day.
- **Per-course mute:** suppress nudges until `mute_until`; user-configurable X days.
- **Auto cooldown:** if ignored (no action within 24h) or user mutes, apply cooldown (default 3 days) for that course.
- **Back-to-back classes** (end times within 10 minutes): group into a single stack with multiple course entries.
- **Offline/no push permission:** queue nudge for next app foreground; deliver as in-app banner.

### Delivery
- **Primary:** OneSignal Web Push when subscription exists; include `external_id = nudge_id` for callbacks.
- **Fallback:** In-app banner fetched on next foreground via `GET /nudges/pending`.
- Log `delivered_at` via OneSignal callback; log `response_at` when user acts.

### Message & Actions
- **Title:** "Update [Course]?" (for grouped, "Updates after class?") with actions:
  - `NO_UPDATES`
  - `ADD_ASSIGNMENT` (Magic Input text)
  - `LOG_FOCUS` (enum: 25, 50, 90 minutes)
- Any action resolves the nudge and increments streak.
- **Auto-resolve:** if user adds an assignment or logs focus for the course within 15 minutes of trigger, mark related open nudge(s) resolved.

### Deferrals & Summaries
- If deferred by DND, aggregate to a single next-morning summary response with bulk resolve support.

### Analytics
- Persist `delivered_at`, `action`, `response_at`, `channel`, and `opened_at` (if available).
- Track send→response latency and response rate.

## API Endpoints

### POST `/internal/nudges/scan-and-queue`
- **Auth:** service token
- **Body:** `{windowStart, windowEnd?}`
- Finds classes that ended since last run, enqueues nudges (respect DND/mute/cooldown/grouping)
- **Returns:** counts `{queued, deferred, grouped}`

### POST `/internal/nudges/:id/dispatch`
- **Auth:** service token
- Sends OneSignal notification or marks as `in_app` if no push
- Updates status and `scheduled_send_at`/`delivered_at` (via callback)

### POST `/nudges/:id/resolve`
- **Auth:** user
- **Body:**
  ```json
  {
    "action": "NO_UPDATES" | "ADD_ASSIGNMENT" | "LOG_FOCUS",
    "payload": {
      "text": "string (optional)",
      "focusMinutes": 25 | 50 | 90
    }
  }
  ```
- **Side effects:** resolve nudge(s) in same group; enqueue Magic Input ingestion (for `ADD_ASSIGNMENT`); create focus log (for `LOG_FOCUS`); update streak
- **Response:** `{nudgeId, status, streak: {current, longest}}`

### POST `/nudges/bulk-resolve`
- **Auth:** user
- **Body:** `{items: [{id, action, payload?}]}` for next-morning summary
- Resolves and returns summary counts

### GET `/nudges/pending?scope=summary|banner`
- **Auth:** user
- Returns pending/deferred nudges (grouped) for in-app delivery

### POST `/nudges/mute`
- **Auth:** user
- **Body:** `{courseId, days}`
- Sets `mute_until` and applies cooldown

### POST `/nudges/onesignal/callback`
- **Auth:** OneSignal signature verification
- **Body:** includes `external_id` (nudge_id), `event: delivered|opened`
- Updates `delivered_at`/`opened_at`

## Data Model (Supabase)

### `nudges`
- `id` (uuid), `user_id` (uuid), `course_ids` (uuid[]), `group_id` (uuid), `type` ('POST_CLASS'), `status` ('queued'|'deferred'|'sent'|'delivered'|'resolved'|'expired'), `trigger_at` (timestamptz), `scheduled_send_at`, `delivered_at`, `response_at`, `delivery_channel` ('push'|'in_app'), `metadata` jsonb `{class_dates: date[], reason: 'DND'|'MUTE'|'COOLDOWN'|null}`, `cooldown_until` (timestamptz), `created_at`

### `nudge_actions`
- `id`, `nudge_id`, `user_id`, `action` ('NO_UPDATES'|'ADD_ASSIGNMENT'|'LOG_FOCUS'), `payload` jsonb, `created_at`

### `course_nudge_settings`
- `user_id`, `course_id`, `mute_until` (timestamptz), `auto_cooldown_until` (timestamptz), `updated_at`

### `streak_counters`
- `user_id`, `current_streak` (int), `longest_streak` (int), `last_action_date` (date), `updated_at`

### `user_settings`
- `user_id`, `timezone`, `dnd_start` (time), `dnd_end` (time), `push_opt_in` (bool)

## Validation & Business Rules
- Enforce 1 nudge per course/day (unique index on `user_id`, `course_id`, `date(trigger_at)`).
- Require timezone and valid `schedule_json` to compute `trigger_at`.
- Magic Input text max 500 chars; `focusMinutes ∈ {25,50,90}`.
- Auto-resolve window: 15 minutes; match by `user_id` and `course_id(s)`.
- Expire nudges 48h after trigger if no action.

## Security & Auth
- **User endpoints:** Clerk JWT; verify `user_id` matches resource.
- **Internal endpoints:** service token (Supabase service role) and IP allowlist.
- **OneSignal callbacks:** verify HMAC signature.
- **Rate limit user actions:** 10 req/min; idempotency-key support on resolve endpoints.

## Performance & Observability
- Cron scan every minute; query by trigger window and indexed columns (`user_id`, `trigger_at`, `status`).
- **Indexes** on `nudges` (`user_id`, `status`, `trigger_at`), `course_nudge_settings` (`user_id`, `course_id`).
- **Emit metrics:** queued, sent, delivered, responded, median latency, error rates. Structured logs for decisions (DND, mute, cooldown, group).

## User Stories
- As a student, I get a push right after class to quickly log focus or add an assignment, or tap "No updates."
- If it's during DND, I see a single morning summary with all pending classes and can resolve in bulk.
- If I mute a course or ignore, I won't be nudged again for that course until cooldown ends.

## Success Criteria
- >70% of eligible classes generate a nudge (not suppressed by settings).
- ≥35% response rate within 6 hours; median send→response latency <2 hours.
- <1% duplicate nudges per course/day; zero nudges sent during DND.
- Streak updates accurately (no double counts per day) with error rate <0.1%.





