# Syllabus Dump (PDF Ingestion) — Frontend PRD

## Feature Overview
Enable users to upload one or more syllabus PDFs and preview the AI-parsed results before committing bulk creation of courses, calendar events (classes/office hours), grading weights, and assignments/exams. Provide clear review, edit, and accept/reject controls with confidence indicators and a calendar preview to minimize errors and friction.

## Requirements

### Entry
- Accessible from global "Syllabus Dump" CTA. Opens a full-screen stepper: 1) Upload 2) Parsing 3) Review & Edit 4) Import Results.

### Upload (Step 1)
- Drag-and-drop zone + "Select PDF(s)" button (keyboard accessible).
- Accept only .pdf; max 10 files, 25MB each. Show file chips (name, size) with remove.
- Show validation errors inline (unsupported type, size too large) with retry guidance.

### Parsing (Step 2)
- For each file in queue, show status: Uploading → Extracting → Parsed | Needs Attention | Failed.
- Progress indicators per file; show error message on failure and "Remove"/"Retry parse".
- Allow proceeding to Review when at least one file is Parsed or Needs Attention.

### Review & Edit (Step 3)
- **Layout:** Left pane = file/course selector; Main pane = tabbed editor; Right pane = Calendar Preview (collapsible on mobile).
- **Course header**
  - Editable fields: Course title, code, section, credits (number), timezone.
  - Display: Source filename, parse confidence (0–100), and warning if low confidence.
  - Default effort note: "Effort estimate will be set from credits if missing."
- **Tabs and item lists** (each row shows confidence, accept toggle, inline edit)
  - **Class Schedule:** Recurring weekly sessions (days, start, end, location). Recurrence preview. Required fields highlighted.
  - **Office Hours:** Optional; distinct event type. Toggle include/exclude per row.
  - **Grading Weights:** Category + % total. Validate totals sum to 100%; flag over/under with fix suggestions.
  - **Assignments/Exams:** Title, category, due date/time; optional location/notes. Date picker defaults to course timezone.
- **Bulk actions:** Select all/none, Accept All, Reject All, Delete selected, Edit category for selected.
- **Conflict detection:** If an item matches an existing record (same title+date or time overlap), show "Possible duplicate" badge with "View existing" hover/expand. Default to unchecked if duplicate detected.
- **Inline validation:** Required fields, date/time validity, overlapping class times, % total.
- **Calendar Preview** (FullCalendar)
  - Weekly view centered on earliest class date; color legend: Class (primary), Office Hours (accent outline), Assignments/Exams (danger).
  - Reflects only currently accepted items; updates live on edits.

### Import (Step 4)
- Summary: counts by type per course, warnings, duplicates skipped.
- CTA: "Create Records". Show per-course import progress with success/failure toasts.
- Post-import: Option to "Go to Calendar" or "View Assignments". Provide link "Undo import" if API returns reversible id (frontend shows snackbar with timeout).

### States & Errors
- Handle: Password-protected PDFs, image-only PDFs (flag "OCR used — low confidence"), timeouts, network errors. Provide actionable next steps.
- Persist step state in-memory; confirm navigation away if unsaved changes.

### Accessibility
- Full keyboard support, focus states, ARIA labels, live regions for status updates, high contrast, minimum target sizes.

### Responsive
- Mobile: Stepper at top; left pane becomes dropdown; right pane collapses to a "Preview" button opening a bottom sheet calendar.

## User Stories
- As a student, I can upload multiple syllabi and see parse progress per file.
- As a student, I can review and edit extracted items with confidence indicators before importing.
- As a student, I can preview the impact on my calendar and avoid duplicates.
- As a student, I can skip office hours or specific assignments I don't want imported.

## Technical Considerations
- Expected parse API response (per file): course metadata, schedule[], officeHours[], gradingWeights[], assignments[], confidence per item, and normalized ISO datetimes plus timezone.
- Frontend must pass Clerk userId with upload; PDFs stored in Supabase Storage; display file upload and parse job ids.
- Low confidence items default to unchecked; highlight required missing fields.
- Timezone defaults to user profile; allow override per course.
- Analytics: capture time-to-first-parse, acceptance rate per item type, edit rate, import success/failure.

## Success Criteria
- ≥90% of parsed items accepted or minimally edited across pilot.
- Median time from upload to import ≤2 minutes for a 1–3 page syllabus.
- ≤5% import attempts result in user-visible errors; all errors provide clear recovery paths.
- Accessibility: meets WCAG 2.1 AA for this flow (keyboard and screen reader).
- User CSAT ≥4/5 for the import flow in pilot feedback.



