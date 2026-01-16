# Rebalancing/Recalibration Engine — Database PRD

## Purpose
- Persist scheduling proposals ("recalibration plans") and their diffs.
- Enforce concurrency safety (stale checks) and at‑most‑once application/undo.
- Track assignment linkage, churn costs, reason codes, and audit history.
- Provide fast queries for "latest proposal," conflict diagnostics, and daily churn caps.

## Upstream sources (read/write)
- `calendar_events_new` (events; includes `is_movable` BOOLEAN, `metadata` JSONB with `assignment_id`)
- `assignments` (`due_date`, `course_id`, `title`, etc.)
- `courses` (`code`, `name`)
- `user_notification_prefs` (quiet hours, DND)
- Protected windows (modeled via `calendar_events_new.metadata.protected=true` or a separate table)
- `focus_sessions` (optional mirror from events)
- `user_streaks` (unrelated to apply; listed for context)

## Core tables

### 1) `rebalancing_proposals`
- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `trigger` (TEXT) — `manual | quick_add | schedule_drift | morning_refresh | other`
- `cause` (JSONB) — optional context: `{ assignment_id, inserted_event_id, reason }`
- `energy_level` (SMALLINT, nullable) — 1–10 captured at run time
- `moves_count` (INT, default 0)
- `churn_cost_total` (INT, default 0) — minutes (or normalized score)
- `status` (TEXT) — `proposed | applied | partially_applied | cancelled | expired`
- `apply_mode_require_all` (BOOLEAN, default false) — if true, any conflict → 409 and no changes
- `created_at` (TIMESTAMPTZ, default now())
- `applied_at` (TIMESTAMPTZ, nullable)
- `undone_at` (TIMESTAMPTZ, nullable)
- `snapshot_id` (UUID, nullable, FK → `rollback_snapshots.id`)
- `idempotency_key` (TEXT, nullable) — for confirm/undo safety
- `metadata` (JSONB, nullable) — `{ reason_codes_agg, performance_ms, heuristics_version }`

**Indexes:**
- `idx_rebalance_user_created` on (`user_id`, `created_at` DESC)
- `idx_rebalance_status` on (`user_id`, `status`, `created_at` DESC)
- `uq_rebalance_idem` (`user_id`, `idempotency_key`) UNIQUE WHERE `idempotency_key IS NOT NULL`

### 2) `proposal_moves`
Represents each diff: insert/move/resize/delete with scoring and guards.

- `id` (UUID, PK)
- `proposal_id` (UUID, FK → `rebalancing_proposals.id` ON DELETE CASCADE)
- `user_id` (UUID, FK → `users.id`)
- `move_type` (TEXT) — `insert | move | resize | delete`
- `source_event_id` (UUID, nullable, FK → `calendar_events_new.id`) — null for insert
- `target_start_at` (TIMESTAMPTZ, nullable) — new/target start
- `target_end_at` (TIMESTAMPTZ, nullable) — new/target end
- `delta_minutes` (INT, nullable) — positive for pushes/pulls
- `churn_cost` (INT, default 0)
- `category` (TEXT, nullable) — `deep_work | standard | light | admin | chore`
- `reason_codes` (JSONB, default '[]') — array of codes, e.g., `["DEADLINE_PROXIMITY","QUIET_HOURS"]`
- `base_priority` (NUMERIC(6,3), nullable)
- `energy_multiplier` (NUMERIC(4,2), nullable)
- `final_priority` (NUMERIC(6,3), nullable)
- `feasibility_flags` (JSONB, nullable) — `{ buffer_enforced:true, protected_window:false, … }`
- `baseline_updated_at` (TIMESTAMPTZ, nullable) — captured at plan time (Migration 0014)
- `baseline_version` (BIGINT, nullable) — optional optimistic lock (Migration 0014)
- `metadata` (JSONB, nullable) — `{ assignment_id, course_id, title_hint, notes }` (Migration 0014)
- `created_at` (TIMESTAMPTZ, default now())

**Concurrency and safety:**
- At confirm, compare `baseline_updated_at`/`version` to current event; mismatches → conflict.

**Indexes:**
- `idx_proposal_moves_proposal` on (`proposal_id`)
- `idx_proposal_moves_user_target` on (`user_id`, `target_start_at`)
- `idx_proposal_moves_source` on (`source_event_id`) — added in Migration 0014
- `idx_proposal_moves_metadata_gin` using GIN (`metadata`) — added in Migration 0014
- `idx_moves_assignment` on (`(metadata->>'assignment_id')`) — added in Migration 0014

### 3) `rollback_snapshots`
Point‑in‑time event state used for undo and partial failure recovery.

- `id` (UUID, PK)
- `proposal_id` (UUID, UNIQUE, FK → `rebalancing_proposals.id` ON DELETE CASCADE)
- `user_id` (UUID, FK → `users.id`)
- `created_at` (TIMESTAMPTZ, default now())
- `payload` (JSONB) — array of `{ event_id, start_at, end_at, title, is_movable, metadata, updated_at, version }`

**Indexes:**
- `idx_snapshots_user_created` on (`user_id`, `created_at` DESC)

### 4) `rebalancing_apply_attempts`
Audit of each confirm/undo attempt including conflicts.

- `id` (UUID, PK)
- `proposal_id` (UUID, FK → `rebalancing_proposals.id` ON DELETE CASCADE)
- `user_id` (UUID, FK → `users.id`)
- `attempt_no` (INT)
- `operation` (TEXT) — `confirm | undo`
- `started_at` (TIMESTAMPTZ)
- `completed_at` (TIMESTAMPTZ, nullable)
- `status` (TEXT) — `success | partial_success | stale_conflict | failed`
- `idempotency_key` (TEXT, nullable)
- `conflicts` (JSONB, nullable) — `[{ eventId, expectedUpdatedAt, actualUpdatedAt, reason }]`
- `error` (TEXT, nullable)
- `result_summary` (JSONB, nullable) — `{ applied: n, skipped: m, churn_applied: x }`

**Indexes:**
- `idx_apply_attempts_proposal` on (`proposal_id`, `attempt_no`)
- `idx_apply_attempts_status` on (`user_id`, `status`, `started_at` DESC)

### 5) `churn_ledger`
Tracks daily churn used vs cap.

- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `day` (DATE) — user's local date
- `minutes_moved` (INT, default 0)
- `moves_count` (INT, default 0)
- `cap_minutes` (INT, nullable) — snapshot of cap at the time
- `updated_at` (TIMESTAMPTZ, default now())

**Constraints and indexes:**
- `uq_churn_ledger_day` UNIQUE (`user_id`, `day`)
- `idx_churn_ledger_user_day` on (`user_id`, `day` DESC)

### 6) `churn_settings`
Optional per‑user overrides; if absent, use app default.

- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `daily_cap_minutes` (INT, default 60)
- `updated_at` (TIMESTAMPTZ, default now())

**Indexes:**
- `uq_churn_settings_user` UNIQUE (`user_id`)

### 7) `rebalancing_reason_codes` (optional catalog)
If you want a normalized catalog; otherwise, keep codes inline on moves.

- `code` (TEXT, PK)
- `description` (TEXT)
- `severity` (SMALLINT) — 1=info, 2=warn, 3=block
- `created_at` (TIMESTAMPTZ, default now())

**Recommended baseline reason codes:**
- `HIGH_PRIORITY_PREEMPTION`, `DEADLINE_PROXIMITY`, `CHILL_PREEMPTED`, `BUFFER_ENFORCED`, `PROTECTED_WINDOW`, `QUIET_HOURS`, `ENERGY_FIT_BOOST`, `ENERGY_FIT_SUPPRESS`, `EMERGENCY_OVERRIDE`

## Support indexes on sources

### `calendar_events_new`
- `idx_events_user_start` on (`user_id`, `start_at`)
- `idx_events_user_movable_start` on (`user_id`, `is_movable`, `start_at`)
- `idx_events_user_assignment` on (`user_id`, `(metadata->>'assignment_id')`) — added in Migration 0014

### `assignments`
- `idx_assignments_user_due` on (`user_id`, `due_date`)

## Views and read models

### 1) `v_rebalance_latest_per_user`
**Purpose:** show the latest proposal summary for dashboard/UX.

**Columns:**
- `user_id`, `proposal_id`, `created_at`, `moves_count`, `churn_cost_total`, `status`, `reason_codes` (aggregated), `has_conflicts` (BOOLEAN)

**Definition sketch:**
- Latest `rebalancing_proposals` per user by `created_at` with LEFT JOIN to aggregate `reason_codes` from `proposal_moves`.

### 2) `v_rebalance_churn_today`
**Purpose:** fetch daily churn usage vs cap.

**Columns:**
- `user_id`, `day`, `minutes_moved`, `moves_count`, `cap_minutes`

### 3) `v_rebalance_conflicts_recent`
**Purpose:** ops/QA visibility into stale conflicts.

**Columns:**
- `user_id`, `proposal_id`, `attempt_no`, `completed_at`, `conflicts` (JSONB)

## Concurrency and stale‑guard behavior (DB‑backed)
- `proposal_moves` capture `baseline_updated_at`/`baseline_version` at plan time.
- Confirm performs `SELECT … FOR UPDATE` on affected events and compares:
  - If `updated_at`/`version` differs → mark that move as conflict (EVENT_CHANGED) and skip.
- If `apply_mode_require_all=true` and any conflict → return 409 STALE_PROPOSAL (no changes).
- Otherwise partial apply: apply non‑conflicting diffs, return `conflicts[]`.

## Assignment linkage (specificity)
- Thread `assignment_id` through proposal pipeline:
  - `cause.assignment_id` on `rebalancing_proposals` (required when `trigger=quick_add`).
  - `proposal_moves.metadata.assignment_id` for any relevant insert/move/resize.
- On confirm:
  - Inserted Focus/Study blocks set `calendar_events_new.metadata.assignment_id` and title "Study: <assignment title>".
  - Moves/resizes of existing Focus blocks preserve `assignment_id`.

## Defense‑in‑depth constraints and triggers
- **Prevent moving/resizing immovable events at DB layer.**
  - **Trigger:** `trg_prevent_move_immovable` BEFORE UPDATE ON `calendar_events_new` calls `prevent_move_immovable()`
  - **Behavior:** if `OLD.is_movable=false` and `start/end` changed → raise exception
  - **Included in Migration 0014**

## Retention
- `rebalancing_proposals`/`proposal_moves`: keep 90 days (configurable)
- `rollback_snapshots`: keep 7 days (undo window); purge older
- `churn_ledger`: keep 180 days
- `rebalancing_apply_attempts`: keep 90 days

## RLS and security
- Enable RLS on all rebalancing tables.
- Policies restrict rows to `user_id = current_user_id()`.
- Writes set `user_id` from session context; system roles can run background cleanups.

## Performance notes
- Keep proposal payloads light; store only per‑move fields and a single snapshot JSON blob.
- Use the listed covering indexes; add GIN on `reason_codes` if you frequently filter by them.
- For large datasets, consider partitioning `churn_ledger` by month or using BRIN on `created_at` for `apply_attempts`.

## Field conventions
- Times are `TIMESTAMPTZ`.
- Reason codes stored as JSONB array on `proposal_moves.reason_codes`.
- `assignment_id` linkage stored in `proposal_moves.metadata` and `calendar_events_new.metadata`; index expression on `(metadata->>'assignment_id')`.

## Example JSON shapes

### `proposal_moves.metadata`
```json
{
  "assignment_id": "UUID",
  "course_id": "UUID",
  "title_hint": "Study: Homework 3"
}
```

### `feasibility_flags`
```json
{
  "buffer_enforced": true,
  "protected_window": false,
  "quiet_hours_block": false
}
```

### `rebalancing_apply_attempts.conflicts`
```json
[
  {
    "eventId": "UUID",
    "expectedUpdatedAt": "ISO8601",
    "actualUpdatedAt": "ISO8601",
    "reason": "EVENT_CHANGED"
  }
]
```

## Alignment with previous migrations
- **Migration 0014** already adds `proposal_moves.baseline_updated_at`, `baseline_version`, `metadata`; and indexes:
  - `idx_proposal_moves_source`, `idx_proposal_moves_metadata_gin`, `idx_moves_assignment`
- Also recommends `idx_events_user_assignment` on `calendar_events_new`.





