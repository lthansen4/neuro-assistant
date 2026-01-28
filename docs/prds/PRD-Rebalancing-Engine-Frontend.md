# Rebalancing Engine (Auto-adjust Schedule) — Frontend PRD

## Feature Overview
Auto-adjust Schedule proposes non-destructive calendar changes when high-priority items (e.g., exams) are added or updated. The UI visualizes a diff on the calendar, preserves immovable events (Class/Work/protected windows), and offers one-tap Accept/Undo with clear reason codes and audit logging.

## Requirements

### Triggers
- Invoke proposal flow when user creates/updates a high-priority item or its due date within a 3–5 day look-ahead window.
- Manual trigger via "Rebalance" button in calendar toolbar.

### Constraints (visualized and enforced in UI)
- Never move immovable events (`calendar_events.is_movable=false`).
- Never propose sessions past 11pm or within 8 hours after a prior Focus block.
- Respect protected windows (`metadata.protected=true`); do not render proposals inside these ranges.
- Daily churn cap: cap applied changes per calendar day (default 3–5); show batching notice when exceeded.

### Proposal Presentation
- **Non-blocking banner/toast:** "Proposed schedule adjustments available" with View Proposals.
- **Proposal panel** (drawer on mobile, side panel on desktop):
  - **Header:** "Rebalancing Proposals" with item count and look-ahead range.
  - **List of proposal items** (selectable checkboxes):
    - **Move:** [Event title] original time → proposed time; duration; tag for type (Focus/Chill).
    - **Add:** Proposed new Focus block (max 2h) with suggested slot(s).
    - **Status chip:** NEW, MOVE, CONFLICT (if cannot place due to constraints), OVER LIMIT (beyond daily cap).
    - **Reason code chip** with tooltip (e.g., `HIGH_PRIORITY_PREEMPTION`, `CONFLICT_WITH_CHILL`, `DEADLINE_PROXIMITY`) + short detail.
  - **Controls:** Apply Selected (primary), Reject All (secondary), Select All, Deselect All.
- **Calendar Diff Mode** (FullCalendar overlay while panel open):
  - Proposed placements rendered with dashed outline and tinted color.
  - Original positions ghosted (50% opacity) with arrow connector to proposed slot.
  - Immovable/protected windows shaded and non-interactive.

### Actions
- **Apply Selected:**
  - Show confirmation toast: "Applied N changes." Display Undo for 30 minutes or until next accepted batch.
  - If selection exceeds daily churn cap, apply up to cap and queue remainder; show batching message.
- **Reject All:**
  - Close panel; clear overlays; show "No changes applied."
- **Undo:**
  - One-tap restores rollback snapshot; toast "Reverted schedule."

### Interactions
- Item expand: show conflict/explanation, effort estimate, proximity to deadline, and constraint badges.
- Hover/focus on reason chip: tooltip with code + detail.
- Click on proposal list item focuses corresponding event on calendar; keyboard nav supported.

### Visual/Style
- **Event types:** Class/Work (gray, lock icon), Focus (blue), Chill (green), Proposed (dashed border + alpha tint).
- Conflict items disabled with warning icon and guidance text.

### Notifications
- Optional push/in-app when proposals ready; deep-link opens Proposal panel in Diff Mode.

### Accessibility
- Drawer is focus-trapped; ARIA labels for controls and reason chips.
- **Keyboard:** Tab/Shift+Tab within panel; Enter to toggle selection; Cmd/Ctrl+A Select All; Esc closes panel (with confirmation if unsaved).
- Color contrast ≥ 4.5:1; non-color indicators for proposed/immovable.

### Empty/Error States
- **No proposals:** "You're all set—no changes needed."
- **API error:** inline error with Retry; log event.

## User Stories
- As a student, when I add an exam, I want to see suggested moves of Chill before Focus so my existing Focus blocks are preserved.
- As a student, I want to preview a clear before/after diff on the calendar and accept only the moves I agree with.
- As a student, I want a one-tap Undo to revert changes if the new schedule doesn't work.
- As a student, I want reason codes explaining each proposed move so I trust the recommendations.
- As a student, I don't want proposals to schedule past 11pm or within my protected windows.

## Technical Considerations
- **Components:** CalendarToolbar (Rebalance button), ProposalPanel (shadcn/ui Sheet/Drawer), ProposalItem, ReasonTooltip, DiffOverlay, Toast/UndoBanner.
- **State:** proposal set, selection state, snapshotId, churn cap counters, diff mode on/off.
- **API contracts** (read-only in UI):
  - `GET /api/rebalancing/propose` returns `proposals[]`, `reasonCode`, `snapshotId`, `churnCap` info
  - `POST /api/rebalancing/apply` with selected `proposalIds` and `snapshotId`
  - `POST /api/rebalancing/undo` with `snapshotId`
- **FullCalendar:** custom event render hooks for ghost/proposed overlays; non-interactive in Diff Mode.
- **Telemetry:** `proposal_shown`, `proposal_applied`, `proposal_rejected`, `undo_used`, `item_toggled`, `churn_cap_hit`.

## Success Criteria
- 95%+ of proposal panels render within 500ms of trigger.
- 90%+ of applied changes are undoable and successfully reverted when Undo is used.
- Error rate < 1% for apply/undo actions.
- ≥ 60% proposal view-to-apply conversion (any items applied) in pilot.
- **Accessibility:** all actions achievable via keyboard; no critical contrast violations; tooltips announced to screen readers.







