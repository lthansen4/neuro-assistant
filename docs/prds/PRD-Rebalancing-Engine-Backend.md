# Rebalancing Engine — Backend PRD

## Feature Overview
Rebalancing Engine proposes schedule adjustments when high-priority items (e.g., exams) are created or updated. It shifts only flexible blocks (Focus/Chill/low-priority), never moves immovable or protected events (Class/Work/sleep/DND), and respects rest constraints. Proposals are preview-only until confirmed, include reason codes, support one-tap undo via snapshots, and are capped to reduce daily churn.

## Requirements

### Triggers
- On create/update of a high-priority item (exam/assignment) or due date change.
- Manual trigger allowed for testing via API.

### Scope and constraints
- Move only events with `is_movable=true` and type in {FOCUS, CHILL, LOW_PRIORITY}.
- Never alter events with `is_movable=false` or `metadata.protected=true` (e.g., Class/Work/sleep/DND).
- **Look-ahead window:** [due_at - 5d, due_at] with emphasis on last 3–5 days before due.
- **Rest:** no sessions past 23:00 user local time; enforce ≥8h between Focus blocks.
- Respect existing accepted proposals; do not thrash within 24h of acceptance for a given item.

### Heuristic v1
- Rank by: `priority_score > due_proximity > effort_minutes`.
- Prefer moving CHILL before FOCUS; preserve existing FOCUS where possible.
- If insufficient capacity, propose creating new FOCUS blocks (max 120 minutes each).

### Proposal lifecycle
- Generate proposal with `proposed_changes`, reason codes per change, `churn_cost` (# events moved/created), and `snapshot_id`.
- Apply requires daily churn cap check (default 3, max 5 configurable).
- Reject auto-restores snapshot; Undo reverts last applied change set.

### Telemetry and audit
- Log proposal creation, acceptance, rejection, undo with reason codes and counts.
- Expose churn usage for the day.

## User Stories
- As a student, when I add an exam, I receive a proposal that moves CHILL and suggests new FOCUS blocks before the exam, without moving my classes or violating sleep.
- As a student, I can accept the proposal and undo it once, restoring my prior schedule.
- As an admin, I can view acceptance rate and daily churn to monitor thrashing.

## Technical Considerations

### Authentication/Authorization
- Clerk JWT required; `user_id` derived from token. Access limited to own data.

### Data model (Supabase/Postgres)
- `calendar_events` (`id`, `user_id`, `title`, `start_ts`, `end_ts`, `type` enum, `is_movable` bool, `metadata` jsonb).
- `tasks` (`id`, `user_id`, `title`, `due_ts`, `priority_score` numeric, `effort_minutes` int, `type` enum).
- `rebalancing_proposals` (`id`, `user_id`, `trigger_item_id`, `status` enum{PROPOSED, APPLIED, REJECTED, ROLLED_BACK}, `proposed_changes` jsonb, `reason_codes` text[], `churn_cost` int, `lookahead_days` int, `snapshot_id`, `expires_at`, `created_at`).
- `rebalancing_snapshots` (`id`, `user_id`, `events` jsonb, `reversible_until`).
- `rebalancing_audit` (`id`, `user_id`, `proposal_id`, `action` enum, `details` jsonb, `created_at`).

### API (Hono, JSON, versioned under `/api/rebalancing`)

#### POST `/proposals`
- **Auth required.** Body: `{trigger_item_id, lookahead_days?, override_churn_cap?}`
- **Validations:** trigger exists, `due_ts` present, `priority_score >= threshold`, not expired, churn not exceeded for PROPOSED.
- **Response 201:** `{proposal_id, snapshot_id, proposed_changes[], churn_cost, summary}`

#### GET `/proposals/:id`
- **Response:** proposal with diff payload: `[{event_id|null, action: MOVE|CREATE|SPLIT|DELETE, from_range?, to_range?, duration_min, reason_code, detail}]`

#### POST `/proposals/:id/accept`
- **Preconditions:** `status=PROPOSED`, churn cap not exceeded, snapshot valid.
- **Atomic transaction:** apply changes to `calendar_events`; set `status=APPLIED`; write audit.
- **Response:** `{applied:true, undo_token, churn_usage_today}`

#### POST `/proposals/:id/reject`
- **Atomic:** restore snapshot; set `status=REJECTED`; audit.

#### POST `/undo`
- **Body:** `{proposal_id|undo_token}`. **Preconditions:** `status=APPLIED`, `reversible_until` not passed.
- **Atomic:** restore snapshot; set `status=ROLLED_BACK`; audit.

#### GET `/limits`
- **Returns:** `{daily_cap, used_today, remaining}`

### Reason codes (enum)
- `HIGH_PRIORITY_PREEMPTION`, `CONFLICT_WITH_CHILL`, `PRESERVE_FOCUS`, `DEADLINE_PROXIMITY`, `REST_CONSTRAINT`, `PROTECTED_WINDOW`, `INSUFFICIENT_CAPACITY_CREATE_FOCUS`.

### Validation rules
- No proposed `to_range` overlapping protected or immovable events.
- No `to_range` after 23:00 local or <8h after prior FOCUS end.
- CREATE FOCUS blocks ≤120 minutes; avoid splitting across midnight.
- `Idempotency-Key` header honored for POSTs; duplicate keys return original response.

### Performance and reliability
- Proposal generation p95 ≤1.5s for ≤300 events within 14 days; DB indexed on `user_id`, `start_ts`, `end_ts`.
- All apply/undo operations are single-transaction with snapshot.
- Rate limit proposal creation: 10/min/user.

### Realtime
- Emit Supabase Realtime events on proposal create/apply/reject for UI refresh.

## Success Criteria
- ≥90% of proposals generated under 1.5s p95.
- ≤1% violations of rest/protected constraints (monitored; target 0).
- Daily churn cap enforced 100%; no more than cap applied per user/day.
- Proposal acceptance rate ≥40% in pilot; undo rate ≤10% of applied.
- Audit completeness: 100% of apply/reject/undo actions logged with reason codes.




