# Product Requirements Documents (PRDs)

This directory contains Product Requirements Documents for the Gesso project.

## Syllabus Dump Feature

### Overview
The Syllabus Dump feature enables users to upload syllabus PDFs, parse them with AI, and bulk-create courses, calendar events, assignments, and grading components.

### PRD Documents

1. **[PRD-Syllabus-Dump-Overview.md](./PRD-Syllabus-Dump-Overview.md)**
   - Feature overview and extraction checklist
   - Post-processing requirements
   - Execution add-ons (OCR, timezone detection, course aliasing)

2. **[PRD-Syllabus-Dump-Frontend.md](./PRD-Syllabus-Dump-Frontend.md)**
   - Frontend user experience requirements
   - 4-step stepper flow (Upload → Parsing → Review & Edit → Import)
   - Accessibility and responsive design requirements
   - Success criteria and user stories

3. **[PRD-Syllabus-Dump-Backend.md](./PRD-Syllabus-Dump-Backend.md)**
   - Backend API specifications (Hono endpoints)
   - Ingestion workflow and validation rules
   - Security and rate limiting requirements
   - Success criteria and technical considerations

4. **[PRD-Syllabus-Dump-Database.md](./PRD-Syllabus-Dump-Database.md)**
   - Complete database schema definitions
   - Entity relationships and source traceability
   - Indexes, constraints, and RLS policies
   - Operational notes and best practices

## Implementation Status

### Completed ✅
- PDF upload and extraction pipeline
- AI parsing with structured output (Zod schemas)
- Review and commit flow with rollback capability
- Database migrations for staging and artifacts tracking
- Grading components dual-write (JSONB + normalized table)
- Calendar event templates and instances (migration 0008)
- Assignments standardization (migration 0009)
- Confidence scoring on staging items (migration 0011)

### In Progress 🚧
- Migration 0014: Rebalancing concurrency and assignment linkage

### Pending ⏳
- OCR fallback for image-only PDFs
- Advanced timezone detection and DST handling
- Course aliasing with fuzzy matching
- Full 4-step stepper UI (currently using simplified upload + review)
- Calendar preview in review screen
- Conflict detection and duplicate warnings

## Dashboard Feature

### Overview
The Dashboard feature provides a single surface showing weekly Focus minutes and earned Chill minutes with an on-track indicator, per-course grade forecasts with an "estimates only" label and a toggle for handling missing grades, and at-a-glance tiles summarizing Today/This Week items, Office Hours, and the current focus streak. All panels update in realtime from Supabase without manual refresh.

### PRD Documents

1. **[PRD-Dashboard-Frontend.md](./PRD-Dashboard-Frontend.md)**
   - Frontend user experience requirements
   - Chill Bank and Grade Forecast UI components
   - At-a-glance tiles and accessibility requirements
   - Success criteria and user stories

2. **[PRD-Dashboard-Backend.md](./PRD-Dashboard-Backend.md)**
   - Backend API specifications (`GET /api/dashboard`)
   - Chill Bank and Grade Forecast calculation logic
   - Realtime update support via Supabase Realtime
   - Security, validation, and performance requirements
   - Success criteria and technical considerations

3. **[PRD-Dashboard-Database.md](./PRD-Dashboard-Database.md)**
   - Read models (materialized views or standard views)
   - Dashboard snapshot caching table
   - Recommended indexes for performance
   - Data freshness and retention policies
   - Security and RLS requirements

### Implementation Status

#### Completed ✅
- Basic dashboard API endpoint (`/api/dashboard/summary`)
- User streaks tracking (migration 0007)
- Assignments status-based queries (migration 0009)
- Grade Forecast components table (migration 0010)
- Dashboard performance materialized view (migration 0012)
- Basic frontend dashboard page with assignments display

#### In Progress 🚧
- Chill Bank calculation and display
- Grade Forecast toggle for missing grades policy
- Realtime updates via Supabase Realtime subscriptions
- Dashboard snapshot caching table

#### Pending ⏳
- Focus sessions tracking and aggregation
- Chill sessions tracking
- Post-class nudges display
- Rebalancing Engine summary
- At-a-glance tiles (Today/This Week, Office Hours)
- Full accessibility implementation (WCAG 2.1 AA)
- Dashboard materialized view refresh strategy

## Post-Class Nudge and Check-in Feature

### Overview
The Post-Class Nudge and Check-in feature automatically prompts students after each class ends to quickly confirm updates or add tasks via a lightweight nudge. Nudges are delivered as web push notifications (OneSignal) when permitted, or as in-app banners on next foreground. Any action counts toward a daily streak displayed on the dashboard.

### PRD Documents

1. **[PRD-Post-Class-Nudge-Frontend.md](./PRD-Post-Class-Nudge-Frontend.md)**
   - Frontend user experience requirements
   - Push notification and in-app banner UI
   - Action flows (No updates, Add assignment, Log focus)
   - Grouping and summary behavior
   - Success criteria and user stories

2. **[PRD-Post-Class-Nudge-Backend.md](./PRD-Post-Class-Nudge-Backend.md)**
   - Backend API specifications (Hono endpoints)
   - Triggering and delivery logic
   - OneSignal web push integration
   - Auto-resolve and cooldown logic
   - Security, validation, and performance requirements
   - Success criteria and technical considerations

3. **[PRD-Post-Class-Nudge-Database.md](./PRD-Post-Class-Nudge-Database.md)**
   - Complete database schema definitions (`class_nudges`, `nudge_groups`, `nudge_delivery_attempts`, `course_nudge_settings`, `user_notification_prefs`)
   - Views and read models for pending nudges and morning summaries
   - Security and RLS requirements
   - Cross-feature references (calendar events, assignments, streaks)
   - Notes and response payload JSON structures

### Implementation Status

#### Completed ✅
- User streaks tracking (migration 0007) - supports nudge actions
- Calendar event templates and instances (migration 0008) - supports focus logging
- Assignments standardization (migration 0009) - supports assignment creation from nudges

#### In Progress 🚧
- N/A (not yet started)

#### Pending ⏳
- `class_nudges` table and related entities
- `nudge_groups` and `nudge_group_items` for back-to-back class grouping
- `nudge_delivery_attempts` for delivery telemetry
- `course_nudge_settings` for per-course mute/cooldown preferences
- `user_notification_prefs` for DND and push settings
- Scheduler for nudge generation (POST `/internal/nudges/scan-and-queue`)
- OneSignal web push integration (POST `/internal/nudges/:id/dispatch`)
- Nudge resolution endpoints (POST `/nudges/:id/resolve`, POST `/nudges/bulk-resolve`)
- In-app banner UI components (mobile PWA bottom sheet, desktop toast card)
- Morning summary UI for deferred nudges
- Auto-resolve logic for assignments/focus created within 15 minutes
- Focus sessions tracking (if not using `calendar_events_new` for focus)

## Quick Add Feature

### Overview
The Quick Add feature enables a global, frictionless input to create assignments or study sessions from natural language (e.g., "Math test Friday 9am"). The system parses course, category, date/time, and effort, auto-sets a high priority, and shows a confirmation preview with inline disambiguation. Focus is on speed: one input, one confirmation, done.

### PRD Documents

1. **[PRD-Quick-Add-Frontend.md](./PRD-Quick-Add-Frontend.md)**
   - Frontend user experience requirements
   - Global input and confirmation preview UI
   - Disambiguation flows (course, date/time, category)
   - Dedupe and error handling
   - Success criteria and user stories

2. **[PRD-Quick-Add-Backend.md](./PRD-Quick-Add-Backend.md)**
   - Backend API specifications (`POST /api/quick-add/parse`, `POST /api/quick-add/confirm`)
   - Natural language parsing logic
   - Priority calculation and dedupe logic
   - Security, validation, and performance requirements
   - Success criteria and technical considerations

3. **[PRD-Quick-Add-Database.md](./PRD-Quick-Add-Database.md)**
   - Complete database schema definitions (`user_course_aliases`, `quick_add_logs`, `assignment_attachments`)
   - Target tables referenced by Quick Add (assignments, calendar_events_new)
   - Views and diagnostics
   - Security and RLS requirements
   - Compatibility with Post-Class Nudges

### Implementation Status

#### Completed ✅
- `user_course_aliases` table and unique index (migration 0013)
- `quick_add_logs` table with intent, ambiguity_reason, user_resolution fields (migration 0013)
- `idx_quick_add_dedupe` unique index for idempotency (migration 0013)
- Basic assignments and calendar_events_new tables (supports Quick Add writes)

#### In Progress 🚧
- N/A (not yet started)

#### Pending ⏳
- Natural language parsing implementation (deterministic and/or LLM-assisted)
- Parse endpoint (`POST /api/quick-add/parse`)
- Confirm endpoint (`POST /api/quick-add/confirm`)
- Frontend global input component (top nav persistent input, mobile FAB)
- Confirmation preview UI (desktop Sheet, mobile Drawer)
- Course disambiguation UI (top 3 suggestions + search)
- Date/time disambiguation UI (date picker + time picker)
- Dedupe warning banner UI
- Priority calculation logic
- Alias persistence flow (save alias toggle)
- `assignment_attachments` table (if supporting attachments beyond MVP)
- Integration with Post-Class Nudges (set `source='post_class_nudge'` in `quick_add_logs`)

## Rebalancing Engine (Auto-adjust Schedule) Feature

### Overview
The Rebalancing Engine (also called "Recalibration Engine") proposes schedule adjustments when high-priority items (e.g., exams) are created or updated. It shifts only flexible blocks (Focus/Chill/low-priority), never moves immovable or protected events (Class/Work/sleep/DND), and respects rest constraints. Proposals are preview-only until confirmed, include reason codes, support one-tap undo via snapshots, and are capped to reduce daily churn.

### PRD Documents

1. **[PRD-Rebalancing-Engine-Frontend.md](./PRD-Rebalancing-Engine-Frontend.md)**
   - Frontend user experience requirements
   - Proposal panel UI (drawer on mobile, side panel on desktop)
   - Calendar diff mode visualization
   - Accept/Undo/Reject flows
   - Success criteria and user stories

2. **[PRD-Rebalancing-Engine-Backend.md](./PRD-Rebalancing-Engine-Backend.md)**
   - Backend API specifications (`POST /api/rebalancing/proposals`, `POST /api/rebalancing/proposals/:id/accept`, `POST /api/rebalancing/undo`)
   - Heuristic v1 logic for schedule adjustments
   - Churn cap enforcement
   - Security, validation, and performance requirements
   - Success criteria and technical considerations

3. **[PRD-Rebalancing-Engine-Database.md](./PRD-Rebalancing-Engine-Database.md)**
   - Complete database schema definitions (`rebalancing_proposals`, `proposal_moves`, `rollback_snapshots`, `rebalancing_apply_attempts`, `churn_ledger`, `churn_settings`, `rebalancing_reason_codes`)
   - Concurrency and stale-guard behavior
   - Assignment linkage through metadata
   - Defense-in-depth triggers (prevent moving immovable events)
   - Security and RLS requirements
   - Alignment with Migration 0014

### Implementation Status

#### Completed ✅
- `proposal_moves` table with baseline fields (`baseline_updated_at`, `baseline_version`, `metadata`) added in migration 0014
- Indexes for assignment linkage (`idx_proposal_moves_source`, `idx_proposal_moves_metadata_gin`, `idx_moves_assignment`) added in migration 0014
- `idx_events_user_assignment` index on `calendar_events_new` recommended in migration 0014
- Defense-in-depth trigger (`trg_prevent_move_immovable`) to prevent moving immovable events (migration 0014)
- Basic `calendar_events_new` and `assignments` tables (supports rebalancing reads/writes)

#### In Progress 🚧
- Migration 0014: Rebalancing concurrency and assignment linkage (review pending)

#### Pending ⏳
- Core rebalancing tables (`rebalancing_proposals`, `proposal_moves`, `rollback_snapshots`, `rebalancing_apply_attempts`, `churn_ledger`, `churn_settings`, `rebalancing_reason_codes`)
- Proposal generation logic (heuristic v1)
- Proposal endpoint (`POST /api/rebalancing/proposals`)
- Accept endpoint (`POST /api/rebalancing/proposals/:id/accept`)
- Reject endpoint (`POST /api/rebalancing/proposals/:id/reject`)
- Undo endpoint (`POST /api/rebalancing/undo`)
- Limits endpoint (`GET /api/rebalancing/limits`)
- Frontend proposal panel UI (drawer on mobile, side panel on desktop)
- Calendar diff mode visualization (FullCalendar overlay)
- Reason code tooltips and explanations
- Churn cap enforcement and batching UI
- Undo banner with 30-minute window
- Manual trigger button in calendar toolbar
- Realtime updates via Supabase Realtime subscriptions

## Notes

- These PRDs reflect the intended feature scope. Current implementation may differ in some areas.
- Database schema has evolved to match actual migrations (e.g., `calendar_event_templates`, `calendar_events_new`, `syllabus_parse_runs`, `syllabus_staging_items`).
- Some PRD terms may differ from actual implementation (e.g., `syllabus_ingestions` vs `syllabus_parse_runs`, API endpoint naming).
- Refer to migration files in `packages/db/migrations/` for actual database structure.
- Dashboard PRD references tables that may not yet exist (e.g., `focus_sessions`, `chill_sessions`, `class_nudges`, `rebalancing_proposals`).
- Post-Class Nudge PRD references tables that do not yet exist (`class_nudges`, `nudge_groups`, `nudge_delivery_attempts`, `course_nudge_settings`, `user_notification_prefs`).
- Quick Add PRD references `user_course_aliases` and `quick_add_logs` which were created in migration 0013. The parsing and confirmation logic are pending implementation.
- Rebalancing Engine PRD references core tables that do not yet exist (`rebalancing_proposals`, `proposal_moves`, `rollback_snapshots`, etc.). Migration 0014 adds baseline fields to `proposal_moves` and defense-in-depth triggers, but the core tables are pending creation.



