# Database Audit & Canonical MVP Schema

## Executive Summary

This document defines the **canonical MVP database schema** for the "Neuro-Student Assistant" based on the current working codebase. This schema reflects the production implementation and serves as the source of truth for all database operations.

**Strategy:** **Additive Only** - No breaking renames or structural changes. New fields are added as needed for feature expansion (e.g., Rebalancing Engine).

---

## 1. Canonical Schema Definitions

### Users
* `id`: UUID (PK)
* `clerk_user_id`: Text (unique, not null)
* `timezone`: Text (default: 'UTC')
* `target_study_ratio`: Numeric(4,2) (default: 3.00)
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_users_clerk` on `clerk_user_id`

---

### Courses
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `name`: Text (not null)
* `professor`: Text (nullable)
* `color_code`: Text (nullable)
* `credits`: Integer (default: 3)
* `schedule_json`: JSONB (nullable) - Raw schedule data
* `office_hours_json`: JSONB (nullable) - Raw office hours data
* `grade_weights_json`: JSONB (nullable) - Cached grade weights for UI
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_courses_user_name` on `(user_id, name)`

**Additive Changes for Rebalancing Engine:**
* ⏳ `term`: Varchar (nullable) - e.g., "Fall", "Spring", "Summer"
* ⏳ `year`: Integer (nullable) - e.g., 2024, 2025

---

### Course Office Hours (Normalized)
* `id`: UUID (PK)
* `course_id`: UUID (FK -> Courses, not null)
* `day_of_week`: Integer (not null) - 0=Sun, 1=Mon, ..., 6=Sat
* `start_time`: Time (not null)
* `end_time`: Time (not null)
* `location`: Text (nullable)

**Indexes:**
* `idx_office_hours_course_day` on `(course_id, day_of_week)`

---

### Assignments
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `course_id`: UUID (FK -> Courses, nullable)
* `title`: Text (not null)
* `due_date`: Timestamptz (nullable) - **KEEP THIS NAME** (do not rename to `due_at`)
* `category`: Text (nullable)
* `effort_estimate_minutes`: Integer (nullable) - **KEEP THIS NAME** (do not rename to `estimated_effort_minutes`)
* `priority_score`: Integer (default: 0)
* `status`: Enum `assignment_status` (default: 'Inbox')
  * **Enum Values:** `['Inbox', 'Scheduled', 'Locked_In', 'Completed']` - **KEEP THESE VALUES**
* `graded`: Boolean (default: false)
* `points_earned`: Numeric(10,2) (nullable)
* `points_possible`: Numeric(10,2) (nullable)
* `weight_override`: Numeric(5,2) (nullable)
* `submitted_at`: Timestamptz (nullable)
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_assignments_user_due` on `(user_id, due_date)`
* `idx_assignments_course_due` on `(course_id, due_date)`

---

### Sessions (Focus/Chill)
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `assignment_id`: UUID (FK -> Assignments, nullable)
* `type`: Enum `session_type` (not null)
  * **Enum Values:** `['Focus', 'Chill']`
* `start_time`: Timestamptz (not null)
* `end_time`: Timestamptz (not null)
* `planned_duration`: Integer (nullable) - minutes
* `actual_duration`: Integer (nullable) - minutes
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_sessions_user_start` on `(user_id, start_time)`

---

### Calendar Events
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `course_id`: UUID (FK -> Courses, nullable)
* `assignment_id`: UUID (FK -> Assignments, nullable)
* `type`: Enum `event_type` (not null)
  * **Enum Values:** `['Class', 'Work', 'OfficeHours', 'Focus', 'Chill', 'Other']`
* `title`: Text (nullable)
* `location`: Text (nullable)
* `start_time`: Timestamptz (not null) - **KEEP THIS NAME** (do not rename to `start_at`)
* `end_time`: Timestamptz (not null) - **KEEP THIS NAME** (do not rename to `end_at`)
* `is_movable`: Boolean (default: false)
* `metadata`: JSONB (nullable) - Flexible metadata storage
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_events_user_time` on `(user_id, start_time)`
* `idx_events_user_course_type_start` on `(user_id, course_id, type, start_time)` - for deduplication

**Additive Changes for Rebalancing Engine:**
* ⏳ `is_recurring`: Boolean (default: false) - Indicates if event is part of a recurring series

**Note:** Single table model is maintained. No template/instance split at this time.

---

### Dashboard Preferences
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, unique, not null)
* `show_grade_forecast`: Boolean (default: true)
* `show_chill_bank`: Boolean (default: true)
* `default_range`: Text (default: 'week') - 'day' | 'week'
* `created_at`: Timestamptz (default: now())

---

### User Daily Productivity
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `day`: Date (not null) - UTC date boundary
* `focus_minutes`: Integer (default: 0)
* `chill_minutes`: Integer (default: 0)
* `earned_chill_minutes`: Integer (default: 0)
* `created_at`: Timestamptz (default: now())

**Constraints:**
* Unique on `(user_id, day)`

---

### User Weekly Productivity
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `iso_year`: Integer (not null)
* `iso_week`: Integer (not null)
* `start_date`: Date (not null)
* `end_date`: Date (not null)
* `focus_minutes`: Integer (default: 0)
* `chill_minutes`: Integer (default: 0)
* `earned_chill_minutes`: Integer (default: 0)
* `created_at`: Timestamptz (default: now())

**Constraints:**
* Unique on `(user_id, iso_year, iso_week)`

---

### User Streaks
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, unique, not null)
* `current_streak_days`: Integer (default: 0)
* `longest_streak_days`: Integer (default: 0)
* `last_active_date`: Date (nullable)
* `created_at`: Timestamptz (default: now())

---

### Course Grade Forecasts
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `course_id`: UUID (FK -> Courses, not null)
* `current_score`: Numeric(5,2) (nullable)
* `projected_score`: Numeric(5,2) (nullable)
* `updated_at`: Timestamptz (default: now())

**Constraints:**
* Unique on `course_id`

---

### Syllabus Ingestion Tables

#### Syllabus Files
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `course_id`: UUID (FK -> Courses, nullable)
* `path`: Text (not null) - Supabase storage path
* `original_filename`: Text (nullable)
* `uploaded_at`: Timestamptz (default: now())

**Indexes:**
* `idx_syllabus_files_user` on `(user_id, uploaded_at)`

#### Syllabus Parse Runs
* `id`: UUID (PK)
* `syllabus_file_id`: UUID (FK -> Syllabus Files, not null)
* `status`: Enum `syllabus_parse_status` (default: 'queued')
  * **Enum Values:** `['queued', 'processing', 'succeeded', 'failed']`
* `model`: Text (nullable) - AI model used
* `confidence`: Numeric(4,3) (nullable)
* `error`: Text (nullable)
* `created_at`: Timestamptz (default: now())
* `completed_at`: Timestamptz (nullable)

**Indexes:**
* `idx_parse_runs_file_status` on `(syllabus_file_id, status)`

#### Syllabus Staging Items
* `id`: UUID (PK)
* `parse_run_id`: UUID (FK -> Syllabus Parse Runs, not null)
* `type`: Text (not null) - 'course' | 'office_hours' | 'grade_weights' | 'assignment' | 'class_schedule'
* `payload`: JSONB (not null)
* `confidence`: Numeric(4,3) (nullable)
* `dedupe_key`: Text (nullable)
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_staging_run_type` on `(parse_run_id, type)`

#### Syllabus Commits
* `id`: UUID (PK)
* `parse_run_id`: UUID (FK -> Syllabus Parse Runs, not null)
* `committed_by`: UUID (FK -> Users, not null)
* `committed_at`: Timestamptz (default: now())
* `summary`: JSONB (nullable) - Commit summary with counts

#### Syllabus Commit Artifacts
* `id`: UUID (PK)
* `parse_run_id`: UUID (FK -> Syllabus Parse Runs, not null)
* `assignment_id`: UUID (FK -> Assignments, nullable)
* `event_id`: UUID (FK -> Calendar Events, nullable)
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_artifacts_parse` on `parse_run_id`

**Purpose:** Tracks which assignments and events were created by each parse run for precise rollback.

---

### Quick Add Tables

#### User Course Aliases
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `alias`: Text (not null) - User-defined course alias
* `course_id`: UUID (FK -> Courses, not null)
* `confidence`: Numeric(4,3) (nullable)
* `usage_count`: Integer (default: 0)
* `created_at`: Timestamptz (default: now())
* `updated_at`: Timestamptz (default: now())

**Indexes:**
* `idx_user_course_aliases_course` on `course_id`
* Unique on `(user_id, lower(alias))` - Case-insensitive unique constraint

#### Quick Add Logs
* `id`: UUID (PK)
* `user_id`: UUID (FK -> Users, not null)
* `raw_input`: Text (not null)
* `parsed_payload`: JSONB (nullable)
* `confidence`: Numeric(4,3) (nullable)
* `dedupe_hash`: Text (nullable)
* `created_assignment_id`: UUID (FK -> Assignments, nullable)
* `created_event_id`: UUID (FK -> Calendar Events, nullable)
* `error`: Text (nullable)
* `created_at`: Timestamptz (default: now())

**Indexes:**
* `idx_quick_add_logs_user_created` on `(user_id, created_at)`
* `idx_quick_add_logs_dedupe` on `dedupe_hash`

---

## 2. Enums

### assignment_status
Values: `['Inbox', 'Scheduled', 'Locked_In', 'Completed']`

**Status:** ✅ **CANONICAL** - Do not change these values.

### session_type
Values: `['Focus', 'Chill']`

### event_type
Values: `['Class', 'Work', 'OfficeHours', 'Focus', 'Chill', 'Other']`

### syllabus_parse_status
Values: `['queued', 'processing', 'succeeded', 'failed']`

---

## 3. Standardization Rules (Current Implementation)

1. **Time Fields:** Use `TIMESTAMPTZ` for all absolute times (`created_at`, `due_date`, `start_time`, `end_time`, etc.)
2. **Effort:** Use `minutes` (Integer) - field name: `effort_estimate_minutes`
3. **Naming:** 
   - Use `_date` for date fields (e.g., `due_date`)
   - Use `_time` for timestamp fields (e.g., `start_time`, `end_time`)
   - Use `_at` only for `created_at`, `updated_at`, `submitted_at`, `committed_at`
4. **Credits:** Integer (not Numeric) - default: 3

---

## 4. Additive Changes for Rebalancing Engine

### Courses Table
**Add:**
- `term`: Varchar (nullable) - e.g., "Fall", "Spring", "Summer"
- `year`: Integer (nullable) - e.g., 2024, 2025

**Migration:** `ALTER TABLE courses ADD COLUMN term VARCHAR; ALTER TABLE courses ADD COLUMN year INTEGER;`

### Calendar Events Table
**Add:**
- `is_recurring`: Boolean (default: false) - Indicates if event is part of a recurring series

**Migration:** `ALTER TABLE calendar_events ADD COLUMN is_recurring BOOLEAN DEFAULT false;`

**Purpose:** These fields enable the Rebalancing Engine to:
- Group courses by term/year for conflict detection
- Identify recurring events that should be considered as series (not individual instances)

---

## 5. Database Functions

### recompute_daily_productivity(p_user uuid, p_day date)
Aggregates focus/chill minutes from sessions for a given user and day, updating `user_daily_productivity` table.

### recompute_weekly_productivity(p_user uuid, p_day date)
Aggregates focus/chill minutes from sessions for a given user and ISO week, updating `user_weekly_productivity` table.

---

## 6. Migration Strategy

### Additive-Only Approach
1. ✅ **No Breaking Changes:** All existing field names and enum values are preserved
2. ✅ **Additive Migrations:** New fields are added via `ALTER TABLE ADD COLUMN`
3. ✅ **Backward Compatible:** Existing code continues to work without modification
4. ⏳ **Future Features:** New fields added as needed (e.g., Rebalancing Engine)

### Pending Migrations
1. **0005_add_rebalancing_fields.sql** (to be created):
   - Add `term` and `year` to `courses`
   - Add `is_recurring` to `calendar_events`

---

## 7. Code References

### Schema Definition
- **File:** `packages/db/src/schema.ts`
- **Migrations:** `packages/db/migrations/`

### Key API Endpoints Using Schema
- `apps/api/src/routes/upload.ts` - Syllabus commit/rollback
- `apps/api/src/routes/quickAdd.ts` - Quick add parsing
- `apps/api/src/routes/dashboard.ts` - Dashboard summary
- `apps/web/app/upload/actions.ts` - Server actions

---

## 8. Notes

### Field Naming Decisions
- **`due_date`** (not `due_at`) - Maintained for consistency with existing code
- **`effort_estimate_minutes`** (not `estimated_effort_minutes`) - Maintained for consistency
- **`start_time`/`end_time`** (not `start_at`/`end_at`) - Maintained for consistency

### Calendar Events Architecture
- **Single Table Model** - No template/instance split at this time
- Recurring events are handled via `is_recurring` flag (to be added)
- Future enhancement: Consider template layer if needed for complex recurrence rules

### Status Enum Values
- **Assignment Status:** `['Inbox', 'Scheduled', 'Locked_In', 'Completed']` - These values are canonical and should not be changed
- Mapping to workflow:
  - `Inbox`: Newly created, not yet scheduled
  - `Scheduled`: Assigned to a time slot
  - `Locked_In`: Confirmed and cannot be moved
  - `Completed`: Finished

---

## 9. Summary

This schema represents the **canonical MVP implementation** of the Neuro-Student Assistant database. All field names, types, and enum values are locked in and should not be changed without a comprehensive migration plan.

**Additive changes** (new fields) are acceptable and encouraged for feature expansion, but **renames and structural changes** are not permitted without explicit approval and migration strategy.

**Next Steps:**
1. Create migration `0005_add_rebalancing_fields.sql` to add `term`, `year`, and `is_recurring`
2. Update TypeScript schema definitions in `packages/db/src/schema.ts`
3. Update API endpoints to utilize new fields when Rebalancing Engine is implemented


