# Natural Language Quick Add — Frontend PRD

## Feature Overview
Global, frictionless input to create assignments or study sessions from natural language (e.g., "Math test Friday 9am"). The system parses course, category, date/time, and effort, auto-sets a high priority, and shows a confirmation preview with inline disambiguation. Focus is on speed: one input, one confirmation, done.

## Requirements

### Entry points
- Persistent "Quick Add" input in top nav; floating action button on mobile.
- Keyboard: Alt+Q focuses input; Enter submits to parse; Esc clears and closes.
- Placeholder: "Add anything… e.g., 'CS201 HW3 due Tue 5pm'".

### Input behavior
- Single-line text; auto-trim; max 280 chars; paste supported.
- Submit states: Idle → Parsing (spinner) → Preview or Error.
- Offline: input disabled with tooltip "Requires network to parse".

### Parsing + Preview
- On parse success, open a confirmation surface:
  - Desktop: right-side Sheet (max 420px).
  - Mobile: bottom Sheet/Drawer.
- Show parsed objects as cards:
  - Assignment (always when detected).
  - Optional Study Session (focus block) when "study/read/practice" intent detected.
- Each parsed field displays a confidence chip: High/Med/Low (Badge).
  - Low confidence fields auto-focus and show inline help.

### Disambiguation
- **Course resolver:** display top 3 suggestions (avatars/codes) + search "Find course".
- Offer "Save alias for 'Math' → MATH 101" toggle after user selection.
- **Date/time resolver:** date picker + time picker; default local timezone; show tz dropdown only when confidence Low.
- **Category mapping** locked to: Exam, Homework, Reading, Study Session; user can override via Select.

### Defaults and business rules
- **Time defaults:** if missing, due at 5:00 PM local.
- **Study Session duration** default 60m if missing.
- **Effort estimate** displayed (minutes); editable number input; default provided by parse payload.
- **Priority:** display badge "Auto-priority: High (score x.xx)" with info tooltip.

### Chunking for Long-Form Work
When the AI detects a large assignment (papers, major projects, thesis work), the system automatically implements task chunking:

**Detection criteria:**
- Assignment category is "Paper", "Project", or similar long-form work
- Estimated duration ≥ 4 hours (240 minutes)
- AI sets `requires_chunking: true` flag

**Chunking rules:**
- Maximum session duration: 2 hours (120 minutes)
- Minimum rest period between sessions: 8 hours (brain rest/consolidation)
- Maximum chunks per day: 2 sessions
- Sessions spread across multiple days working backward from due date

**Phase-based labeling:**
- Research/Outline → Drafting → Revision → Editing → Final Polish
- Phases help students understand workflow progression
- Each chunk is labeled with its phase in the calendar

**Preview UI:**
- Shows multiple Focus blocks instead of single block
- Each chunk displays: phase label, date, time, duration
- Info banner explains the 8-hour rest period benefit
- User can view all chunks before confirming

**Calendar behavior:**
- Each chunk appears as a separate Focus event
- All chunks linked to the same parent assignment
- Chunks labeled as "Assignment Title - Phase Name"
- Metadata stored: `chunkIndex`, `totalChunks`, `chunkType`

**Rebalancing protection:**
- Chunked Focus blocks are more resistant to automatic moves
- Only moved if critical conflict (e.g., sleep window violation)
- When moved, the 8-hour gap from adjacent chunks is preserved
- Sequence integrity maintained to prevent mental fatigue

### Dedupe
- If dedupe hash conflict detected, show inline warning banner with options:
  - View existing (opens minimal details).
  - Merge (update existing with new fields).
  - Create anyway.
  - Skip.
- Default selection: Merge.

### Edit controls
- Title (text), Course (select), Category (select), Due date/time (date+time), Timezone (select when shown), Effort (minutes), Priority (read-only).
- **Study Session:** start date/time picker and duration minutes; draggable preview ghost on calendar area (desktop only).

### Confirmation
- Primary action: Confirm (creates all items); secondary: Edit more; tertiary: Cancel.
- Success toast: "Added to Inbox • Focus block scheduled".
- Optimistic UI: immediately render assignment in Inbox and event in calendar; reconcile on response.

### Error handling
- **Parse error:** inline message with "Edit manually" (opens full form prefilled with raw text).
- **Creation error:** retry CTA; if partial success, indicate which item failed.

### Accessibility
- Fully keyboard-navigable; focus traps in Sheet/Drawer.
- ARIA labels on confidence chips and disambiguation controls.
- Color contrast AA; non-color indicators for confidence (icons/text).

### Responsive
- Mobile: condensed layout, stacked fields, swipe-to-close enabled with confirm guard.
- Desktop: two-column field layout when space allows; calendar ghost zone visible if viewport ≥ 1280px.

## User Stories
- As a student, I type "Math test Friday 9am" and confirm in one tap to create a high-priority exam due Friday 9am for my Math course.
- As a student, I type "Study 90m for Psych midterm Thu" and get a study session block I can adjust before confirming.
- As a student, when "CS" is ambiguous, I'm shown top suggestions and can save the alias for future use.
- As a student, if I already added "HW3 Tue 5pm", I'm warned and can merge instead of creating a duplicate.
- As a student with ADHD, I type "English paper due Monday" and the system automatically splits it into 5 focused work sessions spread across days with built-in rest periods, preventing mental fatigue and last-minute cramming.

## Technical Considerations

### Parser contract (frontend expectation from parse endpoint)
**Inputs:** `{ text, timezone }`

**Outputs:**
```json
{
  "assignment": {
    "title": "string",
    "course_candidates": [/* 3 items */],
    "course_confidence": 0.0-1.0,
    "category": "Exam|Homework|Reading|Study Session",
    "due_at": "ISO8601",
    "due_confidence": 0.0-1.0,
    "effort_minutes": 0,
    "priority_score": 0.0-1.0,
    "requires_chunking": false,
    "estimated_duration": 60
  },
  "study_session": {
    "start_at": "ISO8601 (optional)",
    "duration_minutes": 60,
    "confidence": 0.0-1.0
  },
  "chunked": false,
  "chunks": [
    {
      "label": "Research/Outline",
      "type": "initial|consistency|acceleration|final|buffer",
      "startAt": "ISO8601",
      "endAt": "ISO8601",
      "durationMinutes": 120
    }
  ],
  "timezone_confidence": 0.0-1.0,
  "dedupe": {
    "exists": false,
    "hash": "string",
    "existing_summary": {
      "id": "UUID",
      "title": "string",
      "due_at": "ISO8601",
      "similarity": 0.0-1.0
    }
  }
}
```

### State management
- Local component state with optimistic updates; reconcile via mutation responses.

### Supabase/Realtime
- After confirm, listen for creation ack to resolve optimistic states; handle partial failures.

### Security
- Show only user's courses in resolver; never expose other users' data in suggestions.

### Telemetry
- Capture: `parse_success`, `time_to_confirm`, `edits_by_field`, `disambiguation_needed`, `dedupe_shown`, `confirm_rate`, `chunking_triggered`, `chunks_created_count`, `chunk_adjustments_made`.

## Success Criteria
- Median time from input focus to confirmed create ≤ 12 seconds.
- ≥ 80% of successful parses require zero manual edits.
- Disambiguation needed in ≤ 20% of parses after 2 weeks (with alias saves).
- Duplicate creation rate reduced by ≥ 60% when dedupe banner shown.
- Error rate (parse or create) ≤ 2% of attempts; user satisfaction (CSAT on success toast prompt) ≥ 4.3/5.
- For chunked assignments: ≥ 90% of students complete more chunks on time vs. single large blocks (measured via completion tracking).




