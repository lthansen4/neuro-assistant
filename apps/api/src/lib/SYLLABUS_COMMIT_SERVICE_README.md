# SyllabusCommitService

## Overview

The `SyllabusCommitService` class provides a clean API for committing staged syllabus items to the database. It handles course upsertion, assignment creation, calendar event generation, grading components normalization, and office hours management.

## Features

✅ **Course Management**: Upserts courses (creates if new, updates if existing)  
✅ **Assignment Deduplication**: Prevents duplicate assignments based on user, course, title, and due date  
✅ **Calendar Events**: Generates 14-day occurrences for classes and office hours using timezone-aware logic  
✅ **Grading Components**: Normalizes grade weights into `grading_components` table for Grade Forecast calculations  
✅ **Office Hours**: Normalizes office hours into `course_office_hours` view/table  
✅ **Artifact Tracking**: Records created assignments and events in `syllabus_commit_artifacts` for precise rollback  
✅ **Migration Support**: Automatically uses `calendar_events_new` if available (migration 0008), otherwise falls back to `calendar_events`  
✅ **Idempotency**: Prevents double-commits via `syllabus_commits` check  
✅ **Authorization**: Verifies parse run ownership before committing

## Usage

### Basic Example

```typescript
import { SyllabusCommitService } from './lib/syllabus-commit-service';

const service = new SyllabusCommitService();

const payload = {
  course: {
    name: 'CS 101',
    professor: 'Dr. Smith',
    credits: 3,
    grade_weights: {
      'Exams': 40,
      'Homework': 30,
      'Projects': 30
    }
  },
  schedule: [
    { day: 'Mon', start: '10:00', end: '11:30', location: 'Room 101' },
    { day: 'Wed', start: '10:00', end: '11:30', location: 'Room 101' }
  ],
  office_hours: [
    { day: 'Fri', start: '14:00', end: '16:00', location: 'Office 200' }
  ],
  assignments: [
    { title: 'Midterm Exam', due_date: '2024-03-15', category: 'Exam' },
    { title: 'Homework 1', due_date: '2024-02-20', category: 'Homework' }
  ]
};

const result = await service.commitStagingItems(
  runId,      // syllabus_parse_runs.id UUID
  userId,     // database user ID UUID
  payload,
  'America/New_York' // user's timezone
);

console.log(`Course ID: ${result.courseId}`);
console.log(`Assignments created: ${result.counts.assignmentsCreated}`);
console.log(`Class events created: ${result.counts.classEventsCreated}`);
```

### Integration with Hono Route

```typescript
import { SyllabusCommitService } from '../lib/syllabus-commit-service';

uploadRoute.post('/commit', async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{
      parseRunId: string;
      timezone?: string;
      course: { name: string; professor?: string | null; credits?: number | null; grade_weights?: Record<string, number> | null };
      schedule?: { day: string; start: string; end: string; location?: string | null }[];
      office_hours?: { day: string; start: string; end: string; location?: string | null }[];
      assignments?: { title: string; due_date?: string | null; category?: string | null; effort_estimate_minutes?: number | null }[];
    }>();

    const service = new SyllabusCommitService();
    const result = await service.commitStagingItems(
      body.parseRunId,
      userId,
      body,
      body.timezone || 'UTC'
    );

    return c.json({ ok: true, summary: result });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});
```

## Data Flow

1. **Authorization Check**: Verifies parse run belongs to user
2. **Idempotency Check**: Ensures parse run hasn't been committed already
3. **Transaction Start**: All operations are atomic
4. **Course Upsert**: Creates or updates course
5. **Grading Components**: Normalizes grade weights into `grading_components` table
6. **Office Hours**: Normalizes into `course_office_hours` view/table
7. **Assignments**: Creates assignments with deduplication (skips duplicates)
8. **Calendar Events**: Generates 14-day occurrences for classes and office hours
9. **Artifact Tracking**: Records all created resources for rollback
10. **Commit Record**: Creates `syllabus_commits` entry
11. **Status Update**: Marks parse run as 'succeeded'

## Return Value

```typescript
interface CommitResult {
  courseId: string;
  courseName: string;
  counts: {
    assignmentsCreated: number;
    officeHoursSaved: number;
    scheduleSaved: number;
    classEventsCreated: number;
    officeHourEventsCreated: number;
  };
  timezone: string;
}
```

## Deduplication Logic

### Assignments
- Checks for existing assignments with same: `userId`, `courseId`, `title`, `dueDate`
- If `dueDate` is null, deduplicates by `userId`, `courseId`, and `title` only
- Skips insertion if duplicate found

### Calendar Events
- Checks for existing events with same: `userId`, `courseId`, `eventType`, `startAt`, `endAt`
- Uses `calendar_events_new` if available (migration 0008), otherwise falls back to `calendar_events`
- Skips insertion if duplicate found

## Priority Scoring

Assignments automatically receive priority scores based on category:

| Category Keywords | Priority Score |
|------------------|----------------|
| exam, test, midterm, final | 90 |
| project | 70 |
| homework, hw | 40 |
| reading | 25 |
| (default) | 20 |

## Calendar Event Generation

- Generates **14 days** of occurrences from current date
- Uses **Luxon** for timezone-aware date handling (handles DST correctly)
- Converts local times to UTC for storage
- Uses day-of-week matching (ISO format: Mon=1, Sun=7)
- Creates separate events for each occurrence

## Office Hours Handling

Office hours are stored in two places:
1. **`course_office_hours` view/table** (migration 0008): Normalized recurring pattern
2. **`calendar_events_new`** (or `calendar_events`): 14-day instance occurrences

The view is writable via `INSTEAD OF` triggers, so inserting into it automatically populates `calendar_event_templates`.

## Error Handling

- **Parse Run Not Found**: Throws error before starting transaction
- **Unauthorized**: Throws error if parse run doesn't belong to user
- **Already Committed**: Throws error if commit record already exists
- **Transaction Rollback**: All database changes are rolled back on any error

## Database Tables Used

- `syllabus_parse_runs`: Tracks parsing status (updated to 'succeeded')
- `syllabus_files`: Updated with `courseId` link
- `courses`: Upserted with course data
- `grading_components`: Normalized grade weights
- `course_office_hours`: Normalized office hours patterns
- `assignments`: Created assignments
- `calendar_events_new` or `calendar_events`: Calendar event instances
- `syllabus_commit_artifacts`: Tracks created resources for rollback
- `syllabus_commits`: Commit audit record

## Dependencies

- `drizzle-orm`: Database ORM
- `luxon`: Timezone-aware date handling
- `crypto`: Hash generation for dedupe keys (client-side)

## Notes

- The service uses `calendar_events_new` if available (created in migration 0008), otherwise falls back to legacy `calendar_events` table
- All operations are wrapped in a database transaction for atomicity
- Artifact tracking is optional (gracefully handles missing `syllabus_commit_artifacts` table)
- Office hours are stored both as normalized patterns (`course_office_hours`) and as calendar event instances







