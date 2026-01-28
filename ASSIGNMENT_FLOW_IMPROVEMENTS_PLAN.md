# Assignment Flow Improvements - Implementation Plan

## 🎯 Objectives

1. **Improve Edit Assignment Modal UI** - Remove greyed-out appearance, make fields clearly editable
2. **Add "Schedule More Time" Feature** - Allow users to add additional work blocks to assignments
3. **Clarify Icon Meanings** - Add tooltips and improve visual clarity
4. **Ensure Real-Time Updates** - Changes propagate immediately across all views

---

## 📋 Current State Analysis

### Existing Components
- **AssignmentEditModal.tsx** - Main edit interface (FOUND)
- Shows: Title, Description, Course, Category, Due Date, Effort, Focus Blocks
- Focus blocks display with ✓ (complete) and ⚡ (reschedule) icons
- Accessible from multiple locations

### Current Issues
1. **Greyed-out appearance** - `bg-brand-surface-2/50` makes fields look disabled
2. **Unclear icons** - No tooltips explaining ✓ and ⚡ actions
3. **Missing "Add More Time" feature** - Can't easily add more work blocks
4. **Bolt icon is disabled** - `opacity-40` and non-functional

---

## 🔧 Phase 1: UI Polish - Make Fields Clearly Editable

### Changes to AssignmentEditModal.tsx

**Replace all input field styling:**

```typescript
// OLD (grey, looks disabled):
className="bg-brand-surface-2/50 border-brand-border/40"

// NEW (white/light, clearly editable):
className="bg-white dark:bg-brand-surface border-brand-border/60 
           hover:border-brand-primary/40 focus:border-brand-primary
           transition-colors"
```

**Update specific fields:**
- Title input: Add focus ring animation
- Description textarea: White background
- Course select: Remove icon overlay confusion
- Date/Effort inputs: Clear white backgrounds

**Before/After Colors:**
| Field | Before | After |
|-------|--------|-------|
| Inputs | `bg-brand-surface-2/50` (grey) | `bg-white` (clean) |
| Border | `border-brand-border/40` (faint) | `border-brand-border/60` (visible) |
| Focus | Basic | Animated ring + color change |

---

## 🚀 Phase 2: Add "Schedule More Time" Feature

### New Component: ScheduleMoreTimeButton

**Location:** Inside AssignmentEditModal, after Focus Blocks section

**UI Design:**
```
┌─────────────────────────────────────────────┐
│  Scheduled Focus Blocks            2 Blocks │
│  ┌───────────────────────────────────────┐  │
│  │ [Block 1 card]                        │  │
│  │ [Block 2 card]                        │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ + Add More Time                      │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

**Click Flow:**
```
User clicks "+ Add More Time"
  ↓
Show inline form:
  - "How much more time do you need?"
  - Input: [90] minutes
  - Buttons: [Auto-Schedule] [Manual Schedule] [Cancel]
  ↓
If Auto-Schedule:
  - Call API: POST /api/assignments/{id}/schedule-more
  - Backend finds next available slot
  - Creates linked calendar event
  - Returns new block details
  - Updates focus blocks list
  - Shows toast: "Scheduled 90m on [date] at [time]"
  ↓
If Manual Schedule:
  - Close modal
  - Navigate to calendar with assignment pre-selected
  - Open slot picker interface
```

### New API Endpoint

**POST `/api/assignments/{assignmentId}/schedule-more`**
```typescript
Request Body: {
  additionalMinutes: number; // e.g., 90
  preferredTimes?: string[]; // Optional time preferences
}

Response: {
  ok: boolean;
  event: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    linkedAssignmentId: string;
  }
}
```

**Backend Logic:**
1. Get assignment details
2. Use SlotMatcher to find next available time
3. Create calendar event with `linked_assignment_id` = assignment.id
4. Return event details

---

## 💡 Phase 3: Clarify Icon Actions

### Add Tooltips

**Update Focus Block Card:**
```typescript
// Checkmark button
<button
  title="Mark this block as complete"  // ← ADD THIS
  ...
>

// Lightning bolt button  
<button
  title="Reschedule this block to another time" // ← ADD THIS
  onClick={() => handleRescheduleBlock(block.id)} // ← MAKE FUNCTIONAL
  ...
>
```

### Make Lightning Bolt Functional

**Current:** Disabled (`opacity-40`, no onClick)
**New:** Active reschedule action

**Options for Reschedule Action:**
1. **Quick Reschedule** - Show time picker dropdown
2. **Auto-Reschedule** - Call API to find new slot
3. **Open Calendar** - Navigate to calendar with block selected

**Recommended: Auto-Reschedule**
- Fastest UX
- Leverages existing SlotMatcher
- Shows toast with new time
- User can manually adjust if needed

---

## 🔄 Phase 4: Real-Time Updates Across App

### Update Strategy

**When assignment is edited, trigger updates in:**

1. **Dashboard** - Assignment cards
   - Use global event: `window.dispatchEvent(new CustomEvent('assignmentUpdated', { detail: { assignmentId } }))`
   
2. **Calendar** - Event blocks
   - Already handled by `onUpdated()` callback
   
3. **Planner** - Timeline view
   - Listen for 'assignmentUpdated' event
   
4. **Courses** - Assignment list in course detail
   - Listen for 'assignmentUpdated' event

**Implementation:**
```typescript
// In AssignmentEditModal after save:
const handleSave = async () => {
  // ... existing save logic ...
  
  // Broadcast update
  window.dispatchEvent(new CustomEvent('assignmentUpdated', {
    detail: { 
      assignmentId: assignment.id,
      updatedFields: payload 
    }
  }));
  
  onUpdated(); // Callback for parent component
};
```

**Add listeners in all views:**
```typescript
useEffect(() => {
  const handleAssignmentUpdate = (e: any) => {
    const { assignmentId } = e.detail;
    // Refresh assignments list or specific assignment
    refetchAssignments();
  };
  
  window.addEventListener('assignmentUpdated', handleAssignmentUpdate);
  return () => window.removeEventListener('assignmentUpdated', handleAssignmentUpdate);
}, []);
```

---

## 📁 Files to Modify

### Frontend
1. **`apps/web/components/AssignmentEditModal.tsx`** - Main changes
   - Update input styling (Phase 1)
   - Add "Schedule More Time" button (Phase 2)
   - Add tooltips to icons (Phase 3)
   - Implement lightning bolt action (Phase 3)
   - Add global event broadcast (Phase 4)

2. **`apps/web/app/(protected)/dashboard/page.tsx`** - Listen for updates
3. **`apps/web/components/Calendar.tsx`** - Listen for updates
4. **`apps/web/components/Planner.tsx`** (if exists) - Listen for updates
5. **`apps/web/app/(protected)/courses/[id]/page.tsx`** - Listen for updates

### Backend
6. **`apps/api/src/routes/assignments.ts`** - Add schedule-more endpoint
   - New route: `POST /:id/schedule-more`
   - Use SlotMatcher to find time
   - Create linked calendar event

---

## 🎨 Visual Improvements Summary

### Input Fields (Before → After)
```css
/* Before */
.input {
  background: rgba(gray, 0.5); /* Looks disabled */
  border: rgba(border, 0.4);   /* Barely visible */
}

/* After */
.input {
  background: white;           /* Clearly editable */
  border: rgba(border, 0.6);   /* Visible but subtle */
  transition: all 200ms;
}

.input:hover {
  border-color: rgba(primary, 0.4); /* Interactive feedback */
}

.input:focus {
  border-color: rgba(primary, 1);   /* Clear focus state */
  box-shadow: 0 0 0 3px rgba(primary, 0.1); /* Focus ring */
}
```

### Focus Block Cards
- Remove grey background when complete
- Keep light tint + opacity instead
- Add smooth transitions on hover
- Icons get brighter/larger on hover

---

## ✅ Success Criteria

### Phase 1 - UI Polish
- [ ] All input fields have white/light backgrounds
- [ ] Fields show clear hover states
- [ ] Focus rings animate on interaction
- [ ] No greyed-out appearance anywhere

### Phase 2 - Schedule More Time
- [ ] "+ Add More Time" button appears below focus blocks
- [ ] Clicking shows minutes input + two buttons
- [ ] Auto-schedule finds next available slot
- [ ] Manual schedule opens calendar
- [ ] New blocks appear immediately in list
- [ ] New blocks are linked to parent assignment

### Phase 3 - Icon Clarity
- [ ] Checkmark has tooltip: "Mark this block as complete"
- [ ] Lightning bolt has tooltip: "Reschedule this block"
- [ ] Lightning bolt is functional (not disabled)
- [ ] Both icons respond to hover with visual feedback

### Phase 4 - Real-Time Updates
- [ ] Dashboard updates when assignment edited
- [ ] Calendar updates when assignment edited
- [ ] Planner updates when assignment edited
- [ ] Course detail page updates when assignment edited
- [ ] Updates happen without manual refresh

---

## 🧪 Testing Plan

### Manual Tests

1. **Edit Assignment from Dashboard**
   - Open assignment → edit title
   - Check dashboard list updates immediately
   - Check calendar shows new title

2. **Add More Time - Auto Schedule**
   - Open assignment with 1 block
   - Click "+ Add More Time"
   - Enter 90 minutes
   - Click "Auto-Schedule"
   - Verify new block appears
   - Check calendar shows new block
   - Verify both blocks linked to same assignment

3. **Add More Time - Manual Schedule**
   - Click "+ Add More Time"
   - Click "Manual Schedule"
   - Verify calendar opens with assignment selected

4. **Block Completion**
   - Click checkmark on one block
   - Verify block shows as complete
   - Verify assignment NOT marked complete
   - Check updates across views

5. **Block Rescheduling**
   - Click lightning bolt on a block
   - Verify reschedule action triggers
   - Verify new time slot found
   - Check calendar updates

6. **Field Editability**
   - All fields should look clearly editable
   - White backgrounds, visible borders
   - No confusion about what's editable

---

## 📝 Implementation Order

1. ✅ **Phase 1: UI Polish** (30 min)
   - Quick wins, improves UX immediately
   - Low risk, high impact

2. ✅ **Phase 3: Icon Tooltips** (15 min)
   - Simple addition, clarifies existing features
   - No backend changes needed

3. ✅ **Phase 3: Lightning Bolt Function** (45 min)
   - Make existing UI functional
   - Moderate complexity

4. ✅ **Phase 2: Schedule More Time** (2 hours)
   - New feature, requires backend work
   - Most complex but high value

5. ✅ **Phase 4: Real-Time Updates** (1 hour)
   - Polish pass, ensures consistency
   - Tests integration

**Total Estimated Time: ~4 hours**

---

## 🔗 Integration Points

### With Existing Features
- **SlotMatcher** - Used for auto-scheduling
- **Quick Add** - Similar scheduling logic
- **Post Session Summary** - Similar completion flow
- **Rebalancing Engine** - New blocks should be considered in optimization

### Data Consistency
- All blocks must have `linked_assignment_id` set
- Completing all blocks should suggest completing assignment
- Deleting assignment should delete all blocks (already implemented)
- Editing assignment details should update all block titles

---

## 🎯 User Experience Goals

1. **Clarity** - User always knows what's editable
2. **Speed** - Adding more time takes < 10 seconds
3. **Confidence** - Icons explain themselves
4. **Consistency** - Changes appear everywhere immediately
5. **Flexibility** - Both auto and manual scheduling available

---

**Ready to implement! This plan maintains consistency with the app's aesthetic while adding the requested functionality.**



