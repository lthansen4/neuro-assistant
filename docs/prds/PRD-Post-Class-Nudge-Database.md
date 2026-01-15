# Post‑Class Nudges — Database PRD

## Purpose
- Persist post‑class nudge generation, grouping, delivery attempts, and resolution outcomes.
- Record the Logistics Prompt outcome (Yes/No) and any capture method (Text vs Photo Attachment) without requiring OCR.
- Link nudge resolutions to downstream side effects (e.g., Focus event creation, Quick Add assignment).
- Enable fast queries for "pending nudges," morning summaries, telemetry, and audits.

## Core entities

### 1) `class_nudges`
- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `course_id` (UUID, FK → `courses.id`)
- `class_date` (DATE) — local class day anchoring the nudge
- `delivery_channel` (TEXT) — `push | summary`
- `requires_logistics_prompt` (BOOLEAN) — default true (scheduler sets)
- `prompt_text` (TEXT) — e.g., "Did the teacher mention any new due dates or tests?"
- `status` (TEXT) — `pending | resolved | deferred | muted`
- `scheduled_at` (TIMESTAMPTZ) — when it should be sent (post‑class or morning summary)
- `created_at` (TIMESTAMPTZ)
- `resolved_at` (TIMESTAMPTZ, nullable)
- `response_type` (TEXT, nullable) — `no_updates | log_focus | add_assignment | defer | mute_course`
- `response_at` (TIMESTAMPTZ, nullable)
- `resolved_by_event_id` (UUID, nullable, FK → `calendar_events_new.id`) — set when `log_focus` creates a Focus event
- `response_reason` (TEXT, nullable) — optional free‑form or reason code
- `response_payload` (JSONB, nullable) — normalized details captured at resolve time (see "Response payload JSON" below)
- `notes` (JSONB, nullable) — includes logistics prompt outcome, attachments pointers, survey, and any ad‑hoc annotations
- `dedupe_hash` (TEXT, nullable) — optional fingerprint for de‑duping repeated pushes

**Constraints and indexes:**
- `UNIQUE (user_id, course_id, class_date)` — prevents duplicate nudges for the same class day
- `idx_class_nudges_user_created` (`user_id`, `created_at` DESC)
- `idx_class_nudges_user_status` (`user_id`, `status`)
- `idx_class_nudges_user_scheduled` (`user_id`, `scheduled_at`)
- GIN index on notes for logistics queries:
  - `idx_class_nudges_notes_gin` using gin (`notes`)

### 2) `nudge_groups`
**Purpose:** Group back‑to‑back class nudges (stacking behavior).

- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `group_date` (DATE)
- `group_type` (TEXT) — `post_class_stack`
- `reason` (TEXT) — e.g., `back_to_back`
- `items_count` (INT)
- `created_at` (TIMESTAMPTZ)

**Indexes:**
- `idx_nudge_groups_user_date` (`user_id`, `group_date` DESC)

### 3) `nudge_group_items`
- `id` (UUID, PK)
- `group_id` (UUID, FK → `nudge_groups.id` ON DELETE CASCADE)
- `nudge_id` (UUID, FK → `class_nudges.id` ON DELETE CASCADE)
- `position` (INT)

**Indexes:**
- `idx_group_items_group` (`group_id`, `position`)
- `idx_group_items_nudge` (`nudge_id`)

### 4) `nudge_delivery_attempts`
**Purpose:** Delivery history and retry/backoff telemetry.

- `id` (UUID, PK)
- `nudge_id` (UUID, FK → `class_nudges.id` ON DELETE CASCADE)
- `attempt_no` (INT)
- `channel` (TEXT) — `push | summary`
- `provider` (TEXT) — e.g., `onesignal`
- `sent_at` (TIMESTAMPTZ)
- `status` (TEXT) — `queued | sent | failed | throttled`
- `provider_message_id` (TEXT, nullable)
- `error` (TEXT, nullable)
- `payload` (JSONB, nullable) — final push payload snapshot for traceability

**Indexes:**
- `idx_delivery_nudge_attempt` (`nudge_id`, `attempt_no`)
- `idx_delivery_status` (`status`, `sent_at` DESC)

### 5) `course_nudge_settings`
**Purpose:** Per‑course nudge preferences (mute/cooldown).

- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `course_id` (UUID, FK → `courses.id`)
- `muted` (BOOLEAN) — default false
- `cooldown_minutes` (INT) — min minutes between nudges of the same course
- `updated_at` (TIMESTAMPTZ)

**Indexes:**
- `uq_course_nudge_settings` (`user_id`, `course_id`) unique
- `idx_course_nudge_user` (`user_id`)

### 6) `user_notification_prefs` (scope used by nudges)
**Note:** This table may already exist globally. Only fields relevant to nudges are listed.

- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `push_enabled` (BOOLEAN)
- `quiet_hours_start` (TIME, nullable)
- `quiet_hours_end` (TIME, nullable)
- `dnd_mode` (BOOLEAN) — suppresses push; routed to morning summary
- `updated_at` (TIMESTAMPTZ)

**Indexes:**
- `uq_notification_prefs_user` (`user_id`) unique

## Cross‑feature references (read/write)

### `calendar_events_new`
- On `response_type=log_focus`, the resolver creates a completed Focus event, sets `is_movable=false`, and writes `resolved_by_event_id` on `class_nudges`.

### `focus_sessions`
- Optional: mirror focus event creation as a session row for analytics.

### `assignments`
- On `response_type=add_assignment`, the resolver creates a new assignment via Quick Add flow and stores `assignment_id` inside `class_nudges.response_payload` and/or `notes`.

### `user_streaks`
- Any resolution (including `no_updates`) increments `streak_type='productivity'` with idempotent guard.

### `quick_add_logs`
- Resolver can log `parse_intent`, `ambiguity_reason`, `user_resolution` for assignment creation initiated from nudges.

## Notes JSON shape (guidance)

### `class_nudges.notes` JSONB holds user‑visible and internal fields:
```json
{
  "logistics": {
    "asked": true,
    "response": "yes" | "no",
    "capture_method": "text" | "photo_attachment" | null,
    "attachments": [
      {
        "id": "file-uuid",
        "storage_path": "s3://...",
        "mime": "image/jpeg",
        "size": 245233
      }
    ]
  },
  "survey": {
    "energy": 7,
    "curiosity": 6
  },
  "ui": {
    "group_id": "uuid-if-stacked"
  },
  "resolver": {
    "assignment_id": "uuid-if-created",
    "focus_event_id": "uuid-if-created"
  }
}
```

## Response payload JSON (`class_nudges.response_payload`)
**Normalized resolution details for audits and easy reads:**
```json
{
  "action": "no_updates" | "log_focus" | "add_assignment" | "defer" | "mute_course",
  "focus": {
    "duration_minutes": 25
  } | null,
  "assignment": {
    "id": "uuid-if-client-known" | null,
    "title": "Review Notebook Photo" | "Homework 3",
    "due_date": "2026-02-08T23:59:00Z",
    "attachments": [ /* pointers only; no OCR */ ]
  } | null,
  "survey": {
    "energy": 7,
    "curiosity": 6
  } | null,
  "logistics": {
    "asked": true,
    "response": "yes" | "no",
    "capture_method": "text" | "photo_attachment"
  }
}
```

## Views and read models

### 1) `v_post_class_nudges_pending`
**Purpose:** FE list of pending nudges (last ~36h), including Logistics Prompt state.

**Columns:**
- `user_id`, `nudge_id`, `course_id`, `class_date`, `requires_logistics_prompt`, `status`, `created_at`, `notes` (JSONB)

**Filter:**
- `status='pending' AND created_at >= now() - interval '36 hours'`

**Indexes used:**
- `class_nudges(user_id, status)`
- `class_nudges(user_id, created_at DESC)`

### 2) `morning_summary_view` (optional/materialized)
**Purpose:** Morning summary roll‑up (deferred during DND).

**Columns:**
- `user_id`, `summary_date`, `pending_nudges_count`, `course_ids[]`, `first_created_at`

**Filter:**
- `created_at` within prior day, `status='pending'` and `user_notification_prefs.dnd_mode=true` during prior window

## Security and RLS
- Enable RLS on `class_nudges`, `nudge_groups`, `nudge_group_items`, `nudge_delivery_attempts`, and `course_nudge_settings`.
- **Policies:** `user_id = current_user_id()` for all selects, inserts, updates; restrict deletes to system workers or owner.
- Ensure all writes set `user_id` from session context; avoid cross‑user joins.

## Data flow notes

### Generation (Scheduler)
- Creates `class_nudges` rows with `requires_logistics_prompt=true`, `prompt_text`, `delivery_channel`, `scheduled_at`.
- Applies `course_nudge_settings` (mute/cooldown) and `user_notification_prefs` (quiet hours/DND) to choose push vs summary.

### Delivery (Dispatcher)
- Inserts `nudge_delivery_attempts` row per try; stores final payload JSON for audit.

### Resolution (Resolver)
- Validates logistics object when `requires_logistics_prompt=true`.
- On `log_focus`: inserts completed `calendar_events_new` Focus block, sets `class_nudges.resolved_by_event_id`; increments `user_streaks`.
- On `add_assignment`: creates `assignments` (MVP: Text; Photo Attachment pointers only), stores `assignment_id` in `response_payload`/`notes`; increments streaks.
- On `no_updates`: increments streaks.

## Performance and indexes (recap)

### `class_nudges`
- `UNIQUE (user_id, course_id, class_date)`
- `(user_id, created_at DESC)`, `(user_id, status)`, `(user_id, scheduled_at)`
- `GIN(notes)`

### `nudge_delivery_attempts`
- `(nudge_id, attempt_no)`, `(status, sent_at DESC)`

### `nudge_groups` / `nudge_group_items`
- `(user_id, group_date DESC)`, `(group_id, position)`, `(nudge_id)`

## Retention and cleanup
- Keep `nudge_delivery_attempts` 90 days (configurable)
- Optionally archive resolved `class_nudges` older than 60 days to cold storage
- Keep `notes` JSON for audit; strip large attachment arrays from `notes` if stored elsewhere (store only pointers)

## Compatibility and conventions
- Keep `assignments.due_date` naming (legacy)
- Store local time/locale specifics in client; persist `TIMESTAMPTZ` for timestamps
- Attachment handling is pointer‑only; no OCR in MVP




