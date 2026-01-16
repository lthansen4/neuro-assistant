# Rebalancing Engine - Test Checklist

## Prerequisites
- ✅ API server running on port 8787
- ✅ Web server running on port 3000
- ✅ User logged in via Clerk
- ✅ Calendar has some events (especially movable "Chill" or "Focus" events)

## Test Flow

### 1. Generate Proposal
- [ ] Navigate to `/calendar` page
- [ ] Click "Rebalance" button
- [ ] Verify proposal panel opens (or banner appears)
- [ ] Check that proposal shows moves with:
  - [ ] Move type (move/resize/insert/delete)
  - [ ] Original time → Proposed time
  - [ ] Reason codes
  - [ ] Churn cost

### 2. View Proposal Details
- [ ] Verify proposal panel shows:
  - [ ] Proposal header with move count and churn total
  - [ ] List of moves with checkboxes
  - [ ] Status chips (NEW, MOVE, CONFLICT, etc.)
  - [ ] Reason code badges
- [ ] Test "Select All" button
- [ ] Test "Deselect All" button
- [ ] Click individual moves to toggle selection

### 3. Apply Proposal
- [ ] Select one or more moves
- [ ] Click "Apply Selected"
- [ ] Verify success message appears
- [ ] Check that panel shows "Changes applied successfully" with Undo option
- [ ] Verify calendar events updated (may need to refresh)

### 4. Undo Proposal
- [ ] After applying, click "Undo Changes"
- [ ] Verify success message
- [ ] Check that calendar events reverted

### 5. Reject Proposal
- [ ] Generate a new proposal
- [ ] Click "Reject All"
- [ ] Verify "No changes applied" message
- [ ] Verify panel closes

### 6. Auto-Detection
- [ ] If a proposal already exists, verify banner appears on page load
- [ ] Click "View Proposals" from banner
- [ ] Verify panel opens with existing proposal

## Known Limitations (To Be Fixed)
- ⚠️ HeuristicEngine uses placeholder logic (moves events by fixed hours)
- ⚠️ Calendar diff visualization not yet implemented
- ⚠️ Auto-trigger on assignment creation not yet implemented
- ⚠️ Using `alert()` instead of proper toast notifications

## Error Scenarios to Test
- [ ] Generate proposal with no movable events (should show "no changes needed")
- [ ] Try to apply proposal twice (should handle gracefully)
- [ ] Try to undo when no proposal was applied (should handle gracefully)
- [ ] Network error scenarios (disconnect API, verify error messages)

## Browser Testing
- [ ] Desktop view (side panel on right)
- [ ] Mobile view (drawer from bottom)
- [ ] Test keyboard navigation (Tab, Enter, Esc)





