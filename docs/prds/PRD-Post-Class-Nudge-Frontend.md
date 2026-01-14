# Post-Class Nudge and Check-in — Frontend PRD

## Feature Overview
After each class ends, prompt the student to quickly confirm updates or add tasks via a lightweight nudge. Deliver as a web push (OneSignal) when permitted; otherwise show an in-app banner on next foreground. Any action counts toward a daily streak displayed on the dashboard.

## Requirements

### Trigger & Delivery
- Fire one nudge per class per day at class end (from `courses.schedule_json` in user's local timezone).
- If Do Not Disturb (configurable, default 10pm–7am), defer to next morning summary.
- If user is offline at trigger, queue and show on next app foreground.
- If push permission granted: send OneSignal web push with actions; else present in-app banner on next foreground.

### Push / Banner Content
- **Title:** "Update [Course]?"
- **Body:** "Class just ended. Any updates for [Course]?"
- **Actions:** No updates, Add assignment, Log focus 25/50/90m.
- **Edge:** If push action count is limited, push opens app to an action sheet to complete selection.

### In-App Nudge Banner (fallback and on open)
- **Placement:** Mobile PWA bottom sheet; Desktop top-right toast card. Non-blocking; remains until acted on or dismissed.
- **Elements:** course name/code, end time, 3 primary action buttons, overflow menu (Mute 3 days, Snooze to tonight/morning), close (X).
- **States:** default, sending (spinner on action), success (toast), error (inline retry), offline queued (badge "Queued").
- **Accessibility:** focus-trap in sheet, buttons reachable via keyboard, ARIA roles on dialog/toast, high-contrast and 44px minimum tappable areas.

### Actions & Flows
- **No updates:** resolve nudge, increment streak, show "Logged" toast.
- **Add assignment:** opens Magic Input sheet prefilled with course context; upon submit, resolve nudge and show success toast.
- **Log focus:** opens sheet with chips 25/50/90m (default last used); pick logs and resolves nudge.
- **Per-course mute:** via overflow; default 3 days; show "Muted until [date]" confirmation. Provide Unmute in course settings.
- **Snooze:** to tonight (next 7pm local) or tomorrow morning (7am local); re-show as banner (not push).

### Grouping & Summary
- **Back-to-back classes** (end times within 10 minutes): show a stacked nudge list; each card has its actions; provide Bulk resolve (No updates for all).
- **Next-morning summary** (from DND deferral): single summary card listing all pending classes with quick actions; supports bulk resolve.

### Streaks
- Any completed action increments streak counter for that day.
- Display current streak count on dashboard header; update in real time after action.

### Auto-resolve & Cooldowns
- If user adds an assignment or logs focus for a course from any entry point within 15 minutes of a pending nudge, auto-resolve related nudge(s).
- If user ignores a nudge (no interaction after 2 hours) or mutes a course, apply a 3-day cooldown (suppress further nudges for that course). Show muted status in course settings.

## User Stories
- As a student, I receive a nudge right after class and can one-tap "No updates" to keep my streak.
- As a student, I can quickly add an assignment tied to the just-finished course via Magic Input without navigating away.
- As a student, I can log 25/50/90 minutes of focus immediately after class.
- As a student, if it's late, I see a concise morning summary to clear all pending classes.
- As a student, I can mute a noisy course for a few days.

## Technical Considerations
- Deep links from push open app with params (`nudgeId`, `courseId`, `intent`) to render the action sheet.
- Client event logging to Supabase: `nudge_id`, `course_id`, `delivered_at` (when shown), `impression`, `action_type`, `response_at`, `error_type` (if any), `mute_until`, `cooldown_applied`.
- Respect user DND and per-course mute preferences stored in Supabase; display current state in UI.
- Timezone: compute and display in user's local tz; adhere to locale formatting.
- Realtime: when actions occur elsewhere, dismiss any matching visible banners/cards.

## Success Criteria
- ≥60% of nudges seen (impression) receive an action within 24 hours.
- ≥30% use "Add assignment" or "Log focus" at least weekly.
- <2% action error rate; <1% duplicate/lingering nudge reports.
- ≥80% of back-to-back scenarios show correctly grouped UI.
- Streak count updates instantly in dashboard after action (p50 under 500 ms).

