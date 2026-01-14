# Syllabus Dump — Database PRD

## Purpose
- Persist uploaded syllabus files and parsing runs
- Stage extracted items for human review
- Commit accepted items into normalized course/assignment/calendar/grading tables
- Keep auditability (source run, raw output, confidence)

## Entities and Schemas

### 1) `syllabus_files`
- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `course_id` (UUID, nullable, FK → `courses.id`)
- `storage_path` (VARCHAR)
- `file_name` (VARCHAR)
- `mime_type` (VARCHAR)
- `file_size` (INT)
- `sha256` (VARCHAR) — content hash for dedupe
- `status` (VARCHAR) — `uploaded|queued|parsed|failed`
- `uploaded_at` (TIMESTAMP)
- `pages` (INT)
- `notes` (TEXT)

**Indexes:**
- `idx_syllabus_files_user_uploaded` (`user_id`, `uploaded_at` DESC)
- `uq_syllabus_files_sha256` (`sha256`) unique

### 2) `syllabus_parse_runs`
- `id` (UUID, PK)
- `syllabus_file_id` (UUID, FK → `syllabus_files.id`)
- `user_id` (UUID, FK → `users.id`)
- `model` (VARCHAR) — e.g., "gpt-4o-mini"
- `status` (VARCHAR) — `queued|running|completed|failed`
- `started_at` (TIMESTAMP)
- `completed_at` (TIMESTAMP)
- `error` (TEXT, nullable)
- `raw_output` (JSONB) — full model output for audit
- `confidence` (NUMERIC(3,2)) — overall run confidence [0,1]

**Indexes:**
- `idx_parse_runs_file` (`syllabus_file_id`)
- `idx_parse_runs_user_started` (`user_id`, `started_at` DESC)

### 3) `syllabus_staging_items`
**Purpose:** Preview layer for human accept/reject before commit.

**Columns:**
- `id` (UUID, PK)
- `parse_run_id` (UUID, FK → `syllabus_parse_runs.id`)
- `user_id` (UUID, FK → `users.id`)
- `item_type` (VARCHAR) — `course|assignment|event|grading`
- `action` (VARCHAR) — `create|update|skip` (proposed)
- `course_id` (UUID, nullable, FK → `courses.id`)
- `course_code` (VARCHAR)
- `course_name` (VARCHAR)
- `credits` (NUMERIC(3,1))
- `term` (VARCHAR)
- `year` (INT)
- `title` (VARCHAR)
- `category` (VARCHAR) — `Exam|Homework|Reading|…`
- `due_date` (TIMESTAMP) — keep legacy name for stability
- `start_date` (DATE)
- `end_date` (DATE)
- `day_of_week` (SMALLINT) — 0–6 (Sun–Sat)
- `start_time` (TIME) — local time (no tz)
- `end_time` (TIME) — local time (no tz)
- `location` (VARCHAR)
- `weight_percent` (NUMERIC(5,2)) — grading weight
- `estimated_effort_hours` (NUMERIC(6,2))
- `confidence_score` (NUMERIC(4,3)) — per‑item confidence [0,1]
- `source_order` (INT) — order in document
- `dedupe_key` (VARCHAR)
- `notes` (TEXT)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_staging_run` (`parse_run_id`)
- `idx_staging_user` (`user_id`, `created_at` DESC)
- `idx_staging_type` (`item_type`)
- `idx_staging_dedupe` (`dedupe_key`)

### 4) `syllabus_commits`
- `id` (UUID, PK)
- `parse_run_id` (UUID, FK → `syllabus_parse_runs.id`)
- `user_id` (UUID, FK → `users.id`)
- `committed_at` (TIMESTAMP)
- `accepted_count` (INT)
- `rejected_count` (INT)
- `created_courses_count` (INT)
- `created_assignments_count` (INT)
- `created_events_count` (INT)
- `created_grading_components_count` (INT)

**Indexes:**
- `idx_commits_run` (`parse_run_id`)
- `idx_commits_user` (`user_id`, `committed_at` DESC)

### 5) `courses`
**Note:** This is the normalized target table used by Syllabus Dump commit. If a broader courses table already exists in your app, ensure fields are merged or mapped consistently.

- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `code` (VARCHAR)
- `name` (VARCHAR)
- `credits` (NUMERIC(3,1))
- `term` (VARCHAR)
- `year` (INT)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_courses_user` (`user_id`)
- `uq_courses_user_code_term_year` (`user_id`, `code`, `term`, `year`) unique (optional)

### 6) `grading_components`
- `id` (UUID, PK)
- `course_id` (UUID, FK → `courses.id`)
- `name` (VARCHAR)
- `weight_percent` (NUMERIC(5,2)) — 0.00–100.00
- `drop_lowest` (SMALLINT, nullable)
- `source` (VARCHAR) — `syllabus_dump`
- `source_item_id` (UUID, FK → `syllabus_staging_items.id`, nullable)
- `parse_run_id` (UUID, FK → `syllabus_parse_runs.id`)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Constraints:**
- `CHECK (weight_percent BETWEEN 0 AND 100)`
- `CHECK (drop_lowest IS NULL OR drop_lowest >= 0)`

**Indexes:**
- `idx_grading_course` (`course_id`)
- `idx_grading_parse_run` (`parse_run_id`)

### 7) `assignments`
- `id` (UUID, PK)
- `course_id` (UUID, FK → `courses.id`)
- `title` (VARCHAR)
- `category` (VARCHAR)
- `due_date` (TIMESTAMP) — legacy name retained
- `estimated_effort_hours` (NUMERIC(6,2))
- `source` (VARCHAR) — `syllabus_dump`
- `source_item_id` (UUID, FK → `syllabus_staging_items.id`, nullable)
- `parse_run_id` (UUID, FK → `syllabus_parse_runs.id`)
- `dedupe_hash` (VARCHAR)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_assignments_course_due` (`course_id`, `due_date`)
- `idx_assignments_parse_run` (`parse_run_id`)
- `idx_assignments_dedupe` (`dedupe_hash`)

### 8) `calendar_events`
**Purpose:** Template‑driven recurring events (e.g., Class times) and one‑off events derived from syllabus.

- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`)
- `course_id` (UUID, FK → `courses.id`)
- `event_type` (VARCHAR) — `Class|OfficeHours|Exam|Other`
- `title` (VARCHAR)
- `location` (VARCHAR)
- `day_of_week` (SMALLINT)
- `start_time` (TIME) — local
- `end_time` (TIME) — local
- `start_date` (DATE)
- `end_date` (DATE)
- `recurrence_rrule` (VARCHAR)
- `color` (VARCHAR)
- `source` (VARCHAR) — `syllabus_dump`
- `source_item_id` (UUID, FK → `syllabus_staging_items.id`, nullable)
- `parse_run_id` (UUID, FK → `syllabus_parse_runs.id`)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_events_user_course` (`user_id`, `course_id`)
- `idx_events_recurrence` (`user_id`, `day_of_week`, `start_time`)

## Relationships and Source Traceability

- `syllabus_files` 1—N `syllabus_parse_runs`
- `syllabus_parse_runs` 1—N `syllabus_staging_items`
- `syllabus_commits` 1—1 `syllabus_parse_runs` (per commit attempt; allow multiple commits if you support re‑commit)
- `syllabus_staging_items` → upon commit:
  - course items → `courses`
  - assignment items → `assignments` (with `source_item_id`, `parse_run_id`)
  - event items → `calendar_events` (with `source_item_id`, `parse_run_id`)
  - grading items → `grading_components` (with `parse_run_id`)
- All created targets carry `source='syllabus_dump'` and `source_item_id` for audit.

## Operational Notes

- Keep `due_date` naming in assignments for backcompat with existing queries
- Times in `calendar_events` are local TIME; instances elsewhere should use TIMESTAMPTZ (handled by your templates/instances path)
- Store full model output in `syllabus_parse_runs.raw_output` for debugging; consider a retention policy
- Confidence fields (run‑level and item‑level) drive default selection in the commit UI
- Use `dedupe_key` (staging) and `dedupe_hash` (assignments) to avoid duplicates across runs

## Suggested Constraints and RLS

- Enforce row‑level security: all tables filter by `user_id` where present
- `ON DELETE CASCADE`:
  - `syllabus_files` → `syllabus_parse_runs`
  - `syllabus_parse_runs` → `syllabus_staging_items`
- `CHECK` constraints:
  - `item_type` ∈ (`'course'`,`'assignment'`,`'event'`,`'grading'`)
  - `action` ∈ (`'create'`,`'update'`,`'skip'`)

## Recommended Index Recap

**Staging:**
- (`parse_run_id`), (`user_id`, `created_at` DESC), (`item_type`), (`dedupe_key`)

**Targets:**
- `assignments`: (`course_id`, `due_date`), (`parse_run_id`), (`dedupe_hash`)
- `calendar_events`: (`user_id`, `course_id`), (`user_id`, `day_of_week`, `start_time`)
- `grading_components`: (`course_id`), (`parse_run_id`)

**Source traceability:** Expression index on (`source_item_id`) where applicable

