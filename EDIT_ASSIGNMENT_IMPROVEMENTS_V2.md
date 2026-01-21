# Edit Assignment Modal Improvements - Round 2

## Date: January 20, 2026

## User Feedback Addressed

1. **Tooltips not working** - The `title` attribute wasn't visible enough
2. **Reschedule needs user confirmation** - Auto-rescheduling without approval was disruptive
3. **Schedule More Time UI hard to read** - Dark background made text hard to see
4. **Missing block name input** - No way to give custom names to new work blocks

---

## ✨ Changes Implemented

### 1. Reschedule Confirmation Dialog

**Problem**: When clicking the lightning bolt icon, the block was immediately rescheduled without user approval or explanation.

**Solution**:
- Added a preview/confirmation dialog that shows:
  - Current scheduled time (with strikethrough)
  - Proposed new time (highlighted in brand color)
  - **Reasoning** for why that slot was chosen
  - Three action buttons:
    - ✅ **Confirm Reschedule** - Accept the proposed time
    - ❌ **Cancel** - Keep original time
    - 📅 **Pick Manually** - Close modal to manually select time

**Backend Changes**:
- `POST /api/calendar/events/:id/reschedule` now accepts `preview: true` parameter
- When `preview: true`, returns the proposed slot **without updating the database**
- Generates contextual reasoning based on:
  - When the slot is (today, tomorrow, or further out)
  - Time of day (morning, afternoon, evening)
  - Energy level quality (optimal, good)

**Example Reasoning Messages**:
- "Next available slot today during afternoon (optimal energy level)"
- "Next available slot tomorrow during morning (good time for focused work)"
- "Next available 45-minute slot in your schedule"

---

### 2. Improved Schedule More Time UI

**Problem**: The form had low contrast with dark background and hard-to-read text.

**Solution**:
- Changed background from `bg-brand-primary/5` to `bg-white dark:bg-brand-surface`
- Changed text colors from `text-brand-muted` to `text-brand-text` for labels
- Added proper structure with clear labels
- Improved input borders with hover states

**New Fields**:
1. **Block Name (Optional)** - Custom name for the work block
   - Placeholder: `"Draft outline", "Research sources"`
   - If empty, defaults to: `"Work on: {Assignment Title} (Session N)"`
2. **Duration** - Number input with clear label

**Layout**:
```
┌─────────────────────────────────────┐
│  Schedule More Time            [X]  │
├─────────────────────────────────────┤
│  Block Name (Optional)              │
│  [Draft outline, Research sources]  │
│                                     │
│  Duration                           │
│  [90] minutes                       │
│                                     │
│  [📅 Auto-Schedule] [Manual Sch..]  │
│                                     │
│  ℹ New work blocks will be linked  │
└─────────────────────────────────────┘
```

**Backend Changes**:
- `POST /api/assignments/:id/schedule-more` now accepts `blockName?: string | null`
- If `blockName` provided, uses it as the event title
- Otherwise, generates: `"Work on: {title} (Session {N})"`

---

### 3. Accessible Tooltip Component

**Problem**: The `title` attribute tooltips were not visible enough and don't work on mobile.

**Solution**: Created a new `Tooltip.tsx` component:

**Features**:
- ✅ Shows on **hover** for desktop users
- ✅ Shows on **tap** for mobile/touch users
- ✅ Animated fade-in and zoom effect
- ✅ Dark background with pointer arrow
- ✅ Proper accessibility with `role="tooltip"`
- ✅ Configurable positioning (top, bottom, left, right)

**Applied To**:
- ✓ **Checkmark icon**: "Mark this block as complete" / "Unmark this block as done"
- ⚡ **Lightning bolt icon**: "Reschedule this block to another time"

**Component Usage**:
```tsx
<Tooltip content="Mark this block as complete">
  <button onClick={handleToggle}>
    <Check size={18} />
  </button>
</Tooltip>
```

---

## 🔧 Technical Implementation

### Frontend (`apps/web/components/`)

**AssignmentEditModal.tsx**:
- Added state: `reschedulePreview`, `blockName`
- Modified `handleRescheduleBlock` to call API in preview mode first
- Added `confirmReschedule` function to commit the reschedule
- Updated `handleScheduleMoreTime` to send `blockName`
- Added confirmation dialog JSX at bottom of component
- Wrapped icon buttons with `<Tooltip>` component

**ui/Tooltip.tsx** (new file):
- Lightweight tooltip component
- Uses CSS transforms for positioning
- Touch-friendly with `onTouchStart`/`onTouchEnd`

### Backend (`apps/api/src/routes/`)

**calendar.ts**:
- Added `preview` parameter to reschedule endpoint
- When `preview: true`, returns slot without updating database
- Generates `reason` string based on slot characteristics
- Accesses `nextSlot.timeOfDay`, `nextSlot.quality`, `nextSlot.durationMinutes`

**assignments.ts**:
- Added `blockName` parameter to schedule-more endpoint
- Uses custom name if provided, otherwise generates default
- Maintains session numbering logic

---

## 📁 Files Changed

```
apps/web/components/AssignmentEditModal.tsx  (+151, -66)
apps/web/components/ui/Tooltip.tsx           (+67, new file)
apps/api/src/routes/calendar.ts              (+48, -14)
apps/api/src/routes/assignments.ts           (+10, -2)
```

---

## ✅ User Stories Completed

1. ✅ As a user, I want to see **why** a time slot was chosen before accepting it
2. ✅ As a user, I want the **option to manually select** a different time if the auto-scheduled slot doesn't work
3. ✅ As a user, I want to **name my work blocks** so I know what aspect of the assignment I'm working on
4. ✅ As a user, I want **visible tooltips** on icons so I know what they do before clicking
5. ✅ As a mobile user, I want tooltips that work on **touch devices**
6. ✅ As a user, I want the Schedule More Time form to be **easy to read** with good contrast

---

## 🚀 Next Steps

All immediate user feedback has been addressed. The Edit Assignment Modal now:
- ✅ Has clear, visible tooltips
- ✅ Requires confirmation before rescheduling with reasoning
- ✅ Has improved UI with better readability
- ✅ Supports custom block names

**Recommended Follow-ups** (not blocking):
- Consider adding keyboard shortcuts (e.g., `R` to reschedule, `Space` to mark complete)
- Add undo/redo functionality for bulk changes
- Add batch operations (reschedule all blocks, mark all complete)

