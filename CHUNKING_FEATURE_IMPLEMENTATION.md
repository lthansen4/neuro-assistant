# Task Chunking Feature Implementation Summary

## Overview
Implemented automatic chunking for long-form assignments (papers, projects, etc.) that triggers creation of multiple Focus blocks spread across days, respecting 8-hour brain rest periods and 2-hour session limits.

## Completed Implementation Steps

### 1. ✅ Database Migration
**File**: `packages/db/migrations/0018_add_requires_chunking.sql`
- Added `requires_chunking` BOOLEAN column to `assignments` table
- Added index for efficient queries: `idx_assignments_chunking`
- Column defaults to FALSE for existing assignments

### 2. ✅ Schema Update
**File**: `packages/db/src/schema.ts`
- Updated `assignments` table schema to include `requiresChunking: boolean("requires_chunking").default(false)`
- Added corresponding index definition

### 3. ✅ Configuration - Chunking Rules
**File**: `apps/api/src/lib/heuristic-config.ts`
- Added `chunkingRules` interface and configuration:
  - `maxChunkMinutes: 120` - 2-hour sessions (avoid mental fatigue)
  - `minGapHours: 8` - 8-hour brain rest between sessions
  - `maxChunksPerDay: 2` - Max 2 chunks/day (prevent overload)
  - `chunkingThreshold: 240` - 4+ hours triggers chunking

### 4. ✅ Quick Add Parse - AI Detection
**File**: `apps/api/src/routes/quickAdd.ts` (Parse endpoint, ~line 111)

**Changes Made**:
- Updated OpenAI schema to include `requires_chunking` field
- Enhanced prompt with chunking detection logic:
  - Papers/essays: 300-600 min → chunking = true
  - Large projects: > 240 min → chunking = true
  - Regular homework: < 180 min → chunking = false
  - Exams: Never chunk (single events)
- Added realistic duration estimate guidance
- Updated `assignmentDraft` to include `requires_chunking` flag
- Modified focus block generation to calculate chunks for long-form assignments
- Parse response now includes `chunks` array with phase labels

**Key Logic**:
```typescript
const shouldChunk = object.estimated_duration >= 240 && object.requires_chunking;
if (shouldChunk) {
  chunks = calculateChunks(object.estimated_duration, dueAt, userTz);
  // Include chunks in response with labels, timing, and duration
}
```

### 5. ✅ Quick Add Confirm - Create Chunks
**File**: `apps/api/src/routes/quickAdd.ts` (Confirm endpoint, ~line 653)

**Changes Made**:
- Added chunking calculation before assignment creation
- Set `requiresChunking` flag when creating assignment
- Implemented two-path logic:
  - **Chunked Path**: Creates multiple Focus blocks with metadata
    - Each chunk includes: `chunkIndex`, `totalChunks`, `chunkType`, `durationMinutes`
    - Titles formatted as: "Paper - Research/Outline", "Paper - Drafting", etc.
  - **Single Block Path**: Original logic for non-chunked assignments
- Returns `chunked: true/false` and `focus_events` array

### 6. ✅ Helper Function: calculateChunks()
**File**: `apps/api/src/routes/quickAdd.ts` (~line 800)

**Features**:
- Calculates optimal number of chunks (max 120 min each)
- Works backwards from due date to schedule chunks
- Ensures all chunks start in the future (at least 1 hour from now)
- Phase-based labels: Research/Outline → Drafting → Revision → Editing → Final Polish
- Respects 8-hour minimum gap between chunks
- Max 2 chunks per day (with gap enforcement)
- Chunk types: `initial`, `consistency`, `acceleration`, `final`, `buffer`
- Default scheduling at 2 PM (adjustable by rebalancing engine later)

**Algorithm**:
```typescript
while (remainingMinutes > 0 && chunks.length < 10) {
  const chunkDuration = Math.min(remainingMinutes, MAX_CHUNK_MINUTES);
  let chunkStart = currentDay.set({ hour: 14, minute: 0 });
  
  // If already have chunk today, schedule 8+ hours later
  if (todayChunks.length > 0) {
    const lastEnd = DateTime.fromJSDate(lastChunk.endAt);
    chunkStart = lastEnd.plus({ hours: MIN_GAP_HOURS });
    // Move to next day if needed
  }
  
  chunks.push({ label, type, startAt, endAt, durationMinutes });
  remainingMinutes -= chunkDuration;
  phaseIdx++;
}
```

### 7. ✅ Heuristic Engine - Respect Chunks
**File**: `apps/api/src/lib/heuristic-engine.ts` (~line 433)

**Changes Made**:
- Added chunk detection in Focus block processing loop
- Implemented conservative chunked block protection:
  - Only move if CRITICAL conflict or sleep window violation
  - Otherwise, protect chunk from rebalancing
- Added 8-hour gap enforcement when moving is necessary
- Included chunk metadata in move proposals

**Key Logic**:
```typescript
if (isChunked) {
  const hasConflict = this.hasScheduleConflict(event, schedule);
  const inSleep = this.isInSleepWindow(event.startAt) || this.isInSleepWindow(event.endAt);
  
  if (!hasConflict && !inSleep) {
    console.log(`Protecting chunked Focus block ${chunkIndex + 1}/${totalChunks}`);
    continue; // Don't move
  }
  
  // Must move - find slot respecting 8hr gaps
  const adjacentChunks = await this.getAdjacentChunks(event, userId);
  const targetStart = this.findSlotRespectingChunks(event, adjacentChunks, schedule);
}
```

### 8. ✅ Helper Methods: Chunk Management
**File**: `apps/api/src/lib/heuristic-engine.ts` (~line 595)

**Added Methods**:

1. **`hasScheduleConflict(event, schedule)`**
   - Checks for time overlap with other events

2. **`getAdjacentChunks(event, userId)`**
   - Fetches all chunks for the same assignment
   - Orders by start time
   - Filters for events with `chunkIndex` metadata

3. **`findSlotRespectingChunks(event, adjacentChunks, schedule)`**
   - Finds slot maintaining 8hr gaps from all chunks
   - Iteratively checks candidates (max 50 attempts)
   - Avoids conflicts with other schedule events
   - Returns best available slot

**Algorithm**:
```typescript
while (attempts < maxAttempts) {
  // Check distance from all adjacent chunks
  for (const chunk of adjacentChunks) {
    const timeDiff = Math.abs(candidateStart.getTime() - chunk.startAt.getTime());
    if (timeDiff < MIN_GAP_MS) {
      candidateStart = new Date(chunk.endAt.getTime() + MIN_GAP_MS);
      tooClose = true;
      break;
    }
  }
  
  // Also check for conflicts with other schedule events
  if (!tooClose && !hasConflict) {
    return candidateStart; // Found good slot!
  }
}
```

### 9. ✅ Frontend - Chunk Display
**File**: `apps/web/components/QuickAddPreviewSheet.tsx` (~line 221)

**Changes Made**:
- Added conditional rendering for chunked vs. single Focus blocks
- Display chunk count badge in header
- Show all chunks with phase labels and timing
- Visual indicators:
  - Border-left styling for each chunk
  - Duration badges
  - Formatted date/time display
- Informational message about 8-hour rest periods

**UI Structure**:
```
Focus Blocks (Auto-Scheduled - Multiple Sessions) [3 Sessions]
├─ Research/Outline: [120 min]
│  Jan 15, 2026 at 2:00 PM
├─ Drafting: [120 min]
│  Jan 16, 2026 at 2:00 PM
└─ Revision: [60 min]
   Jan 16, 2026 at 10:00 PM

ℹ️ These Focus blocks are spread across days with 8-hour
   rest periods between sessions to prevent mental fatigue.
```

## Testing Checklist

### To Test:
- [ ] Parse "paper due monday" → AI sets `requires_chunking: true`, estimates 300-600 min
- [ ] Confirm creates 3-5 Focus blocks spread across days
- [ ] Each chunk respects 2-hour max, 8-hour gaps
- [ ] Rebalancing engine protects chunked blocks unless critical conflict
- [ ] Frontend shows all chunks in preview with phase labels
- [ ] Chunks appear on calendar with proper timing
- [ ] Single assignment in dashboard shows multiple linked Focus blocks

### Test Commands:
```bash
# 1. Run migration (if not already run)
psql $DATABASE_URL -f packages/db/migrations/0018_add_requires_chunking.sql

# 2. Restart API server
npm run dev -w @neuro/api

# 3. Test in browser:
# - Input: "cs paper due monday"
# - Expected: 300-600 min estimate, 3-5 chunks created
# - Verify: Chunks show in preview, appear on calendar
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Quick Add Input                          │
│              "paper due monday"                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 Parse Endpoint                              │
│  ┌────────────────────────────────────┐                     │
│  │  OpenAI GPT-4o-mini                │                     │
│  │  - Detects long-form work          │                     │
│  │  - estimates duration: 300-600min  │                     │
│  │  - sets requires_chunking: true    │                     │
│  └───────────────┬────────────────────┘                     │
│                  │                                           │
│                  ▼                                           │
│  ┌────────────────────────────────────┐                     │
│  │  calculateChunks()                 │                     │
│  │  - Splits into 120-min chunks      │                     │
│  │  - Works backward from due date    │                     │
│  │  - Enforces 8hr gaps               │                     │
│  │  - Phase labels (Research, etc.)   │                     │
│  └───────────────┬────────────────────┘                     │
└──────────────────┼─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              QuickAddPreviewSheet                           │
│  ┌──────────────────────────────────┐                       │
│  │  Shows Chunk Preview:            │                       │
│  │  - Day -5: 120min Research       │                       │
│  │  - Day -4: 120min Drafting       │                       │
│  │  - Day -3: 120min Revision       │                       │
│  └───────────────┬──────────────────┘                       │
└──────────────────┼─────────────────────────────────────────┘
                   │ User clicks "Add & Schedule"
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Confirm Endpoint                               │
│  ┌────────────────────────────────────┐                     │
│  │  1. Create assignment               │                     │
│  │     requiresChunking = true         │                     │
│  │  2. Create multiple Focus blocks    │                     │
│  │     with metadata:                  │                     │
│  │     - chunkIndex: 0, 1, 2           │                     │
│  │     - totalChunks: 3                │                     │
│  │     - chunkType: initial, etc.      │                     │
│  └───────────────┬────────────────────┘                     │
└──────────────────┼─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Calendar Events Database                       │
│  ┌────────────────────────────────────┐                     │
│  │  Event 1: Paper - Research         │                     │
│  │  Event 2: Paper - Drafting         │                     │
│  │  Event 3: Paper - Revision         │                     │
│  └────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│            Rebalancing Engine                               │
│  ┌────────────────────────────────────┐                     │
│  │  Detects chunked blocks via        │                     │
│  │  metadata.chunkIndex               │                     │
│  │                                     │                     │
│  │  Protection Logic:                 │                     │
│  │  - Only move if CRITICAL conflict  │                     │
│  │  - Maintain 8hr gaps when moving   │                     │
│  │  - Use findSlotRespectingChunks()  │                     │
│  └────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Conservative Chunking Threshold**: 240 minutes (4 hours)
   - Prevents over-chunking of medium-sized tasks
   - Aligns with research on sustained focus limits

2. **2-Hour Max Session Length**
   - Based on cognitive load research
   - Prevents mental fatigue
   - Aligns with Pomodoro technique principles

3. **8-Hour Minimum Rest Between Chunks**
   - Supports memory consolidation
   - Prevents burnout
   - Allows for proper recovery (sleep, meals, etc.)

4. **Phase-Based Labels**
   - Research/Outline → Drafting → Revision → Editing → Final Polish
   - Provides clear structure for paper/project workflow
   - Helps users understand the progression

5. **Rebalancing Protection**
   - Chunked blocks are "stickier" than normal Focus blocks
   - Only moved for CRITICAL conflicts or safety violations
   - Maintains 8hr gaps when rescheduling is necessary

6. **Default 2 PM Scheduling**
   - Afternoon timing balances morning freshness and evening fatigue
   - Avoids early morning (low alertness for many students)
   - Subject to refinement by rebalancing engine based on user patterns

## Future Enhancements (Not Implemented)

1. **User-Adjustable Chunk Settings**
   - Allow users to set their preferred chunk duration
   - Customize rest periods based on personal energy patterns

2. **Smart Phase Recommendations**
   - Use AI to suggest different phase durations based on assignment type
   - E.g., research papers need more research time vs. coding projects

3. **Adaptive Rescheduling**
   - If user misses a chunk, automatically reschedule remaining chunks
   - Maintain gaps while compressing schedule if deadline approaches

4. **Progress Tracking**
   - Track completion of individual chunks
   - Show progress bar for multi-chunk assignments
   - Celebrate milestone completions

5. **Integration with Post-Class Nudges**
   - Suggest breaking large assignments into chunks when mentioned in class
   - Prompt user to confirm chunk schedule after syllabus upload

## Files Modified

1. `packages/db/migrations/0018_add_requires_chunking.sql` (NEW)
2. `packages/db/src/schema.ts` (MODIFIED)
3. `apps/api/src/lib/heuristic-config.ts` (MODIFIED)
4. `apps/api/src/routes/quickAdd.ts` (MODIFIED - 3 sections)
5. `apps/api/src/lib/heuristic-engine.ts` (MODIFIED - 2 sections)
6. `apps/web/components/QuickAddPreviewSheet.tsx` (MODIFIED)

## Total Lines Changed
- Backend: ~350 lines added/modified
- Frontend: ~50 lines added/modified
- Migration: ~15 lines
- **Total: ~415 lines**

## Status
✅ **IMPLEMENTATION COMPLETE** - All TODOs finished, no linting errors detected.

Ready for testing and deployment once the database migration is run.







