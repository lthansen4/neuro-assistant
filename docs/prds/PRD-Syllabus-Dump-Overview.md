# Syllabus Dump — Feature Overview

## Extraction Checklist

**Feature:** Syllabus Dump — Extraction Checklist

### Inputs
- PDF syllabus upload → Supabase Storage

### Extraction Targets
- Class schedule (days/times/locations) → `calendar_event_templates` entries (TIME columns, not TIMETZ)
- Office hours (day, start, end, location) → `calendar_event_templates` with `event_type` using existing Postgres ENUM (e.g., 'Class', 'OfficeHours')
- Grading weights (e.g., Exams 40%)
- Assignments/Exams (title, category, `due_date`)

### Post-processing
- Bulk create: courses, `calendar_event_templates` (recurring) + `calendar_events_new` (instances), assignments (keep `due_date`)
- Default effort estimate based on course credits if missing
- Confirm screen to accept/reject parsed items before commit

### Smoother Execution Add-ons
- **OCR fallback:** If PDF lacks text layer or has low extractability, run OCR (page images) and merge results; flag runs with `ocr_used=true` and keep raw text for audit.
- **Timezone detection:** Parse timezone/term locale from syllabus; if missing, default to campus/user tz. Normalize to tz-aware timestamps for instances and handle DST; allow override in confirm screen.
- **Course aliasing:** Maintain per-user alias map (e.g., "Math", "Calc", "MATH 101" → course). Use fuzzy match; if ambiguous, prompt to choose and optionally save alias for future.

### Cross-references
- See also: Neuro‑Adaptive Scheduling Policy; Advisor Triggering Rules; Nudge‑compatible Block Rules.



