# Syllabus Dump (PDF Ingestion) — Backend PRD

## Feature Overview
Parse uploaded syllabus PDFs into structured data (class schedule, office hours, grading weights, assignments/exams) and stage results for user confirmation. On confirmation, bulk create course, recurring calendar events (class/office hours), and dated assignments in Supabase. Provide confidence scoring, source references, and guardrails to prevent duplicate/erroneous records.

## Requirements

### Ingestion Workflow
- User uploads syllabus PDF to a private Supabase Storage bucket via a signed URL.
- Backend creates an ingestion record, extracts text (OCR if needed), runs LLM-based parsing, and stores a structured draft with confidence scores and source page refs.
- Client polls or subscribes for status; user confirms a subset or edited items to commit.

### Extraction Targets (stored in `ingestion.parsed_json`)
- `course`: name, code, credits?, instructor?, term?, timezone?
- `classSchedule`: [{ daysOfWeek:["MO".."SU"], startTime:"HH:mm", endTime:"HH:mm", location?, pageRefs[], confidence }]
- `officeHours`: [{ dayOfWeek, startTime, endTime, location?, modality?, pageRefs[], confidence }]
- `gradingWeights`: [{ category, weightPercent, pageRefs[], confidence }]
- `assignments`: [{ title, category (assignment|exam|project|reading|other), dueAt (ISO 8601 with tz), effortHours?, description?, weightPercent?, pageRefs[], confidence }]

### Validation & Business Rules
- **File:** PDF, <= 25MB, <= 200 pages; reject otherwise.
- **Dates:** Normalized to ISO 8601; timezone required on confirm (use `course.timezone` or payload).
- **Grading weights:** Sum must be <= 100 (±1 tolerance). If >100, mark invalid; default unchecked in UI.
- **Class/office hour time ranges:** Must be 15–300 minutes; otherwise flagged low confidence.
- **Assignment title:** 1–120 chars; dedupe on `(courseId, normalizedTitle, dueAt)` at commit.
- **Default effortHours:** If missing: credits * 2.0 (configurable).
- **Low-confidence items:** (<0.6) default unchecked in confirmation response.

### States (`syllabus_ingestions.status`)
- `queued` → `processing` → `parsed` | `failed` → `committed` | `cancelled`

### Bulk Commit Behavior
- **Course:** Upsert by `(userId, code, term)` if provided; otherwise create new.
- **Class/office hours:** Create recurring calendar event series (weekly) using BYDAY from `daysOfWeek`; require `termStart` and `termEnd` in confirm payload.
- **Assignments/exams:** Create single events with `dueAt` in UTC; attach to course.
- **All writes:** Transactional; require `Idempotency-Key` to prevent duplicate commits.

### API (Hono, JSON, Clerk auth required)

#### POST `/api/syllabus/upload-url`
- **Body:** `{ fileName, sizeBytes, mimeType }`
- **Resp:** `{ uploadUrl, storagePath, expiresAt }`
- Validates PDF and size; signed URL TTL 1h.

#### POST `/api/syllabus/ingestions`
- **Body:** `{ storagePath, courseId?, timezone?, termStart?, termEnd? }`
- **Resp:** `{ ingestionId, status }`
- Starts async parse; computes file SHA-256 and stores metadata.

#### GET `/api/syllabus/ingestions/:id`
- **Resp:** `{ status, error?, parsedJson?, confidenceAvg?, createdAt }`

#### POST `/api/syllabus/ingestions/:id/confirm`
- **Headers:** `Idempotency-Key`
- **Body:**
  ```json
  {
    "course": {...},
    "classSchedule": [...],
    "officeHours": [...],
    "gradingWeights": [...],
    "assignments": [...],
    "timezone": "...",
    "termStart": "...",
    "termEnd": "..."
  }
  ```
- **Resp:** `{ courseId, eventSeriesIds:[], assignmentIds:[] }`

#### DELETE `/api/syllabus/ingestions/:id` (optional)
- Cancels uncommitted ingestion.

### Persistence (Supabase, Drizzle)
- `syllabus_ingestions`: id, user_id, course_id?, storage_path, file_name, file_sha256, status, parsed_json (jsonb), confidence_avg, error, created_at, updated_at.

### Security
- Clerk JWT required; row-level security scoped to `user_id`.
- Private bucket; signed URLs for upload/download only.
- Strict MIME/type sniffing; antivirus/scan hook optional.

### Rate/Perf
- Limit 10 ingestions/user/day; 1 concurrent/user.
- Target P95 parse < 90s; retries (max 2) on transient failures.
- LLM token ceiling configurable; chunk PDFs > 50 pages.

## User Stories
- As a student, I upload a PDF, see structured results with confidence and page refs, and confirm only correct items.
- As a student, I map parsed data to an existing course and avoid duplicate events/assignments.

## Technical Considerations
- OCR fallback for image PDFs.
- Store `pageRefs` and text snippets to support UI highlight.
- Supabase Realtime can push ingestion status updates.
- Timezone handling: all storage in UTC with original tz preserved for display.

## Success Criteria
- ≥95% ingestions reach `parsed` state without manual admin intervention.
- ≤2% duplicate records on commit (idempotency and dedupe).
- P95 end-to-end (upload to parsed) ≤ 90s for PDFs ≤ 10MB, ≤ 100 pages.
- ≥90% of confirmed items commit successfully without validation errors.
- Zero unauthorized access to files or ingestion records (verified via RLS tests).





