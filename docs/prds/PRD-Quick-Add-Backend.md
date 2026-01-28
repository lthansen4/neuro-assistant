# Natural Language Quick Add — Backend PRD

## Feature Overview
Enables a global input to parse natural language like "Math test Friday 9am" into a structured Assignment (course, category, due date, title) and optionally a Focus calendar block. Applies defaults, computes priority, surfaces ambiguities with suggestions, and supports quick confirm/edit. Outputs a confirmation preview and prevents duplicates.

## Requirements

### Parsing
- **Inputs:** single free-text string (1–300 chars), evaluated in user's local timezone (IANA).
- **Extract:**
  - **Course:** resolve via per-user alias map + fuzzy match; return top 3 suggestions when ambiguous.
  - **Category mapping:** `exam/test/quiz` → Exam; `hw/homework/assignment/problem set` → Homework; `reading` → Reading; `study/review/practice` → Study Session.
  - **Date/time:** natural language; if no time → 17:00 local; if only weekday → next occurrence; if only time → today or next valid day (>= now + 30m).
  - **Duration** (for Study Session): if missing → 60 minutes.
  - **Title:** remaining normalized text with stopwords removed; max 120 chars.
- **Confidence scores** per field (0–1) and `required_actions` array when confidence < threshold (e.g., course <0.6 or missing date).
- **Timezone:** default to user preference; allow override when date/time confidence low.

### Business Logic

#### Create Assignment draft
- **Fields:** `course_id` (nullable until confirm), `title`, `due_at` (UTC) + `due_tz`, `category` in {Exam, Homework, Reading, Study Session}, `effort_estimate_minutes` (default: course_credits*30; fallback 90), `priority_score` (computed), `status=Inbox`.

#### Priority v1
- `weight(category)` from user `grade_weights`; defaults: Exam=1.0, Homework=0.6, Reading=0.4, Study Session=0.5.
- `proximity_factor = 1/(days_to_due + 1)`.
- `effort_factor = min(1, effort_minutes/240)`.
- `priority_score = weight*proximity_factor + 0.2*effort_factor` (bounded 0–1).

#### Study Session
- If "study/review/practice …" detected, draft a movable `CalendarEvent` (Focus) prior to `due_at`: `start_at` chosen from parsed date/time or nearest available before `due_at`; duration per parsed or default; tag as `movable=true`.

#### Dedupe
- Compute `dedupe_hash = sha1(course_id|normalized_title|due_at_date)`.
- If existing assignment with similarity > 0.85 or same hash, return dedupe candidates and default `on_duplicate="warn"`.

### Disambiguation and Aliases
- If user selects a course for an alias, optionally persist `alias → course_id` (per user, case-insensitive unique per course).
- Return `suggestions.courses[{course_id, name, alias_match, score}]`.

### Validation
- Reject dates > 1 year out or > 30 days past; normalize title; enforce category enum; require `course_id` before confirm.
- If confirm without resolving `required_actions` → 422 with `missing_fields`.

## API Endpoints

### POST `/api/quick-add/parse`
- **Auth:** Clerk (user scope). Rate limit: 20 req/min/user.
- **Request:**
  ```json
  {
    "text": "string",
    "user_tz": "string (optional)",
    "now": "string (optional)"
  }
  ```
- **Response:**
  ```json
  {
    "parse_id": "string",
    "assignment_draft": {
      "course_id": "string (optional)",
      "course_confidence": 0.0-1.0,
      "title": "string",
      "category": "Exam|Homework|Reading|Study Session",
      "due_at": "ISO8601 (optional)",
      "due_tz": "IANA timezone",
      "effort_estimate_minutes": 0,
      "priority_score": 0.0-1.0,
      "status": "Inbox"
    },
    "focus_block_draft": {
      "start_at": "ISO8601 (optional)",
      "end_at": "ISO8601",
      "movable": true
    },
    "confidences": {
      "course": 0.0-1.0,
      "category": 0.0-1.0,
      "date": 0.0-1.0,
      "time": 0.0-1.0,
      "duration": 0.0-1.0,
      "title": 0.0-1.0
    },
    "suggestions": {
      "courses": [
        {
          "course_id": "string",
          "name": "string",
          "alias_match": "string (optional)",
          "score": 0.0-1.0
        }
      ]
    },
    "required_actions": ["string"], // e.g., ["choose_course","confirm_date"]
    "dedupe": {
      "likely": false,
      "candidates": [
        {
          "assignment_id": "string",
          "similarity": 0.0-1.0,
          "title": "string",
          "due_at": "ISO8601"
        }
      ]
    }
  }
  ```

### POST `/api/quick-add/confirm`
- **Auth:** Clerk. `Idempotency-Key` header supported. Rate limit: 10 req/min/user.
- **Request:**
  ```json
  {
    "parse_id": "string",
    "overrides": {
      "title": "string (optional)",
      "category": "string (optional)",
      "due_at": "ISO8601 (optional)",
      "effort_estimate_minutes": 0,
      "course_id": "string (optional)"
    },
    "create_focus_block": false,
    "on_duplicate": "warn | merge | skip | create_new",
    "merge_with_assignment_id": "UUID (optional)",
    "save_alias": {
      "alias": "string",
      "course_id": "string"
    },
    "tz_override": "IANA timezone (optional)"
  }
  ```
- **Response:**
  ```json
  {
    "assignment_id": "UUID (optional)",
    "calendar_event_id": "UUID (optional)",
    "dedupe_action": "merged | skipped | created"
  }
  ```
- **Errors:** 401, 404 invalid `parse_id`, 409 `on_duplicate="error"` (future), 422 missing required fields.

## Security and Data
- **Authorization:** all operations scoped to authenticated `user_id`; enforce RLS in Supabase.
- **Input sanitization:** trim, collapse whitespace, strip control chars.
- **Logging:** store `parse_id`, latency, model/parser source, confidence metrics (no raw text beyond 7 days; redact PII in logs).
- **Tables:** `assignments`, `calendar_events`, `course_aliases(user_id, course_id, alias unique)`, `user_preferences(default_tz, grade_weights)`.

## Performance
- **Parse P95:** ≤600ms (deterministic) / ≤2.5s (LLM-assisted).
- **Confirm P95:** ≤250ms.
- **Throughput:** support 50 RPS across users; graceful degradation to deterministic parser if LLM unavailable.

## User Stories
- As a student, I can type "CS201 HW3 due next Tue" and get a draft assignment with course suggestions and a computed priority to confirm in one tap.
- As a student, when I type "Study 90m for Psych midterm Thu," a Focus block is also drafted before the exam.

## Technical Considerations
- Timezone handling must persist `due_tz` and store UTC timestamps.
- Provide confidence-based flags to frontend for inline prompts.
- Emit creation events for downstream Rebalancing Engine via Supabase Realtime channels.

## Success Criteria
- ≥90% of inputs produce a valid draft without backend errors.
- ≤10% of parses require manual course selection after 2 alias uses per course.
- Duplicate warning accuracy ≥90% precision.
- P95 latency targets met in production for both endpoints.







