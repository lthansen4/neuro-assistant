# Quick Add — Database PRD

## Purpose
- Convert natural language input into either an assignment (by) or a calendar event (at), with minimal friction.
- Persist alias defaults and telemetry to improve parsing quality and UX over time.
- Provide safe, idempotent commits and easy debugging via structured logs.

## Scope and conventions
- **Intent values:** `event | assignment | ambiguous`
- Assignments keep legacy column name `due_date`
- Photo attachments are pointers only (no OCR in MVP); voice/OCR may be added later
- Idempotency uses a per-request `dedupe_hash` scoped by user

## Core entities

### 1) `user_course_aliases`
- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `alias` (TEXT) — what the user typed, e.g., "calc" or "english"
- `course_id` (UUID, FK → `courses.id`)
- `saved_default` (BOOLEAN, default true) — indicates this alias currently maps to `course_id`
- `usage_count` (INT, default 0)
- `confidence` (NUMERIC(3,2), default 0.50) — heuristic confidence 0–1
- `last_used_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ, default now())
- `updated_at` (TIMESTAMPTZ, default now())

**Indexes and constraints:**
- `uq_user_alias` on (`user_id`, `lower(alias)`) UNIQUE — case‑insensitive uniqueness for a single default mapping per alias
- `idx_alias_user_used` on (`user_id`, `last_used_at` DESC) — optional accelerator for recent usage

**Notes:**
- One‑to‑many resolution happens at runtime; when the user chooses a course for an alias, we write/update the SINGLE default row for that alias (per user). Collisions and decisions are logged in `quick_add_logs`.

### 2) `quick_add_logs`
**Purpose:** End‑to‑end telemetry and audit trail for parse + commit, with idempotency and alias decision tracking.

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `source` (TEXT) — `quick_add | post_class_nudge | other`
- `raw_input` (TEXT)
- `tokens` (JSONB, nullable) — optional tokenization result
- `intent` (TEXT) — `event | assignment | ambiguous` (added in Migration 0013)
- `ambiguity_reason` (TEXT, nullable) (added in Migration 0013)
- `user_resolution` (TEXT, nullable) — how ambiguity was resolved (e.g., chose "assignment") (added in Migration 0013)
- `chosen_course_id` (UUID, nullable) — course chosen during alias collision handling
- `alias_collision_detected` (BOOLEAN, default false)
- `saved_default` (BOOLEAN, nullable) — whether user opted "Save default for this alias"
- `dedupe_hash` (TEXT, nullable) — request fingerprint for at‑most‑once commits
- `commit_payload` (JSONB, nullable) — normalized payload sent to the commit path
- `commit_result` (JSONB, nullable) — normalized result (ids, warnings)
- `created_assignment_id` (UUID, nullable) — if an assignment was created
- `created_event_id` (UUID, nullable) — if an event was created
- `created_at` (TIMESTAMPTZ, default now())
- `metadata` (JSONB, nullable) — freeform: `{ recurrence_detected, capture_method, … }`

**Indexes and constraints:**
- `idx_quick_add_logs_user_date` on (`user_id`, `created_at` DESC) — previously `idx_quick_add_logs_user_created`; name normalized
- `idx_quick_add_logs_user_date_desc` — if your dialect needs explicit DESC support
- `idx_quick_add_dedupe` UNIQUE on (`user_id`, `dedupe_hash`) WHERE `dedupe_hash IS NOT NULL` — prevents rapid double‑submits (Migration 0013)
- `idx_quick_add_logs_course` on (`chosen_course_id`) — optional
- GIN index on metadata if you frequently query flags:
  - `idx_quick_add_logs_metadata_gin` using gin (`metadata`)

**Operational notes:**
- Set `intent` during parse; if ambiguous, store `ambiguity_reason` and require `user_resolution` before commit.
- Always compute and send `dedupe_hash` for the final commit path; the unique partial index enforces at‑most‑once semantics.

### 3) `assignment_attachments` (optional, recommended if you support attachments beyond MVP)
**Purpose:** Pointer storage for files attached to assignments created via Quick Add (e.g., "Review Notebook Photo").

**Columns:**
- `id` (UUID, PK)
- `assignment_id` (UUID, FK → `assignments.id` ON DELETE CASCADE)
- `storage_path` (TEXT) — e.g., `s3://bucket/key` or supabase path
- `file_name` (TEXT)
- `mime_type` (TEXT)
- `file_size` (INT)
- `uploaded_at` (TIMESTAMPTZ, default now())
- `source` (TEXT) — `quick_add | post_class_nudge`

**Indexes:**
- `idx_assignment_attachments_assignment` on (`assignment_id`)

**Notes:**
- If you are not ready to introduce this table, store attachment pointers in `assignments.notes` JSONB or in `quick_add_logs.commit_payload`/`commit_result` and mirror minimal pointers in `class_nudges.notes` when created from a nudge.

## Target tables referenced by Quick Add (existing)

### `assignments`
- **Required fields:** `id`, `course_id`, `title`, `category`, `due_date` (TIMESTAMPTZ), `created_at`, `updated_at`
- **Recommended indexes:** `(user_id, due_date)`, `(course_id, due_date)`, `(dedupe_hash)` if used

### `calendar_events_new`
- **Fields used:** `id`, `user_id`, `title`, `start_at`, `end_at`, `is_movable`, `metadata` JSONB (store `assignment_id` link when applicable)
- **Recommended indexes:** `(user_id, start_at)`, `(user_id, is_movable, start_at)`, expression index on `(metadata->>'assignment_id')`

## Data flow and semantics

### Parsing
- Extract potential course alias, date token ("by" → `due_date`, "at" → `start/end`), and category hints.
- Set `intent` and `ambiguity_reason`. If ambiguous, do not commit until `user_resolution` is provided.
- If alias maps to multiple potential courses, set `alias_collision_detected=true`. When the user picks, set `chosen_course_id` and (optionally) create/update `user_course_aliases` with `saved_default=true`.

### Commit (idempotent)
- Compute `dedupe_hash` (e.g., `hash(user_id + normalized_input + time_bucket + intent)`).
- **If `intent='assignment'`:**
  - Insert `assignments` with `due_date` and normalized title.
  - If attachments present, either insert `assignment_attachments` or pointers in `notes` JSONB.
  - Persist `created_assignment_id` in `quick_add_logs`.
- **If `intent='event'`:**
  - Insert `calendar_events_new` (`is_movable` depends on event type; Quick Add events are usually movable unless explicitly fixed).
  - Persist `created_event_id` in `quick_add_logs`.
- Store `commit_payload` and `commit_result` snapshots for audit.

### Telemetry fields (guidance)
- `quick_add_logs.metadata` JSONB suggested keys:
  - `parse_intent`, `ambiguity_reason`, `user_resolution`
  - `alias_collision_detected`, `chosen_course_id`, `saved_default`
  - `capture_method`: `text | photo_attachment`
  - `recurrence_detected`: boolean (MVP acknowledges as unsupported)
  - `source_context`: `post_class_nudge | dashboard | global`

## Views and diagnostics

### `v_quick_add_recent` (optional)
**Purpose:** Developer/Support view of the last N Quick Add operations per user.

**Columns:** `user_id`, `created_at`, `raw_input`, `intent`, `ambiguity_reason`, `user_resolution`, `chosen_course_id`, `created_assignment_id`, `created_event_id`

## Security and RLS
- Enable RLS on `user_course_aliases` and `quick_add_logs`; policies restrict all access to rows where `user_id = current_user_id()`.
- `assignment_attachments` inherits RLS from `assignments` by joining on `assignment_id`.
- Only system/service roles may read `commit_payload`/`commit_result` in bulk for analytics.

## Retention
- `quick_add_logs`: retain 90 days (configurable); consider archiving older to cold storage.
- `assignment_attachments`: follow file retention policy; do not orphan records (use ON DELETE CASCADE from `assignments`).
- `user_course_aliases`: persistent; update `usage_count` and `last_used_at` on each use.

## Performance and indexes (recap)
- `user_course_aliases`: `UNIQUE (user_id, lower(alias))`; consider adding `(user_id, course_id)` for reverse lookups.
- `quick_add_logs`: `(user_id, created_at DESC)`, `UNIQUE partial (user_id, dedupe_hash) WHERE dedupe_hash IS NOT NULL`, `GIN(metadata)` if needed.
- `calendar_events_new` and `assignments`: ensure the standard dashboard/rebalance indexes exist so Quick Add writes are visible immediately.

## Compatibility with Post‑Class Nudges
- When Quick Add is triggered from a nudge resolution:
  - Store `capture_method` and any attachment pointers in `class_nudges.notes` and/or `assignment_attachments`.
  - Set `quick_add_logs.source='post_class_nudge'` and include `nudge_id` in `metadata` for traceability.

## Example JSON shapes (for `quick_add_logs`)

### `commit_payload` (assignment)
```json
{
  "intent": "assignment",
  "title": "Homework 3",
  "courseId": "UUID",
  "dueDate": "ISO8601",
  "attachments": [
    {
      "storage_path": "s3://bucket/key",
      "mime_type": "image/jpeg",
      "file_size": 245233
    }
  ]
}
```

### `commit_result`
```json
{
  "assignmentId": "UUID",
  "status": "created",
  "deduped": false
}
```



