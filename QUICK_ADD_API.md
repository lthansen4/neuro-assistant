# Quick Add API Endpoints

## Overview
Production-ready Hono API endpoints for Quick Add functionality, including parse, commit, and alias management.

## Setup

### Environment Variables

Add to `apps/web/.env.local`:
```bash
# For development: Set to a database user UUID (get from `npm run seed` output)
NEXT_PUBLIC_DEBUG_USER_ID=your-user-uuid-here

# API base URL (defaults to http://localhost:8787)
NEXT_PUBLIC_API_BASE=http://localhost:8787
```

### Getting a User ID for Testing

1. Run the seed script: `npm run seed`
2. Copy the user ID from the output: `Seed complete. Demo user: <uuid-here>`
3. Set `NEXT_PUBLIC_DEBUG_USER_ID` in `apps/web/.env.local`

### Running the App

1. Start the API server: `npm run dev -w @neuro/api`
2. Start the web server: `npm run dev -w @neuro/web`
3. Visit: `http://localhost:3000/quick-add`

## Endpoints

### 1. POST `/api/quick-add/parse`
Parse natural language input and get course suggestions.

**Request:**
```json
{
  "text": "Math test Friday 3pm",
  "timezone": "America/New_York"
}
```

**Headers:**
- `x-user-id`: Database user UUID (or `x-clerk-user-id` for Clerk ID lookup)

**Response:**
```json
{
  "parsed": {
    "courseHint": "Math",
    "title": "Math test Friday 3pm",
    "category": "Exam",
    "dueDateISO": null,
    "effortMinutes": null,
    "confidence": 0.35
  },
  "suggestions": [
    {
      "type": "alias",
      "label": "Math",
      "courseId": "uuid-here",
      "confidence": 0.7
    },
    {
      "type": "course",
      "label": "Mathematics 101",
      "courseId": "uuid-here",
      "confidence": 0.5
    }
  ],
  "dedupeHash": "abc123...",
  "confidence": 0.35
}
```

### 2. POST `/api/quick-add/commit`
Create assignment (and optional calendar event) from parsed input.

**Request:**
```json
{
  "rawInput": "Math test Friday 3pm",
  "dedupeHash": "abc123...",
  "parsed": {
    "courseId": "uuid-here",
    "title": "Math Test",
    "category": "Exam",
    "dueDateISO": "2026-02-20T15:00:00-05:00",
    "effortMinutes": 120,
    "createFocusSession": true,
    "sessionStartISO": "2026-02-19T18:00:00-05:00",
    "sessionEndISO": "2026-02-19T19:00:00-05:00",
    "confidence": 0.92
  },
  "saveAlias": {
    "alias": "Math",
    "courseId": "uuid-here"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "createdAssignmentId": "uuid-here",
  "createdEventId": "uuid-here"
}
```

**Behavior:**
- Deduplicates by `dedupeHash` per user
- Creates assignment with priority score based on category
- Optionally creates Focus calendar event
- Saves alias if requested (upserts on conflict)
- Logs to `quick_add_logs` table

### 3. GET `/api/quick-add/aliases`
Get all course aliases for the current user.

**Headers:**
- `x-user-id`: Database user UUID (or `x-clerk-user-id` for Clerk ID lookup)

**Response:**
```json
[
  {
    "id": "uuid-here",
    "alias": "Math",
    "courseId": "uuid-here",
    "confidence": 0.9,
    "usageCount": 5
  }
]
```

### 4. POST `/api/quick-add/aliases`
Create or update a course alias.

**Request:**
```json
{
  "alias": "Math",
  "courseId": "uuid-here",
  "confidence": 0.9
}
```

**Response:**
```json
{
  "ok": true
}
```

**Behavior:**
- Upserts via case-insensitive unique index `(user_id, lower(alias))`
- Increments `usage_count` on conflict
- Updates `course_id` and `confidence` if changed

## Authentication

The `getUserId` helper supports:
- `x-user-id` header: Direct database user UUID
- `x-clerk-user-id` header: Clerk user ID (looks up database user)
- `?userId=` query param: Database user UUID
- `?clerkUserId=` query param: Clerk user ID

## Testing

### Parse endpoint:
```bash
curl -X POST http://localhost:8787/api/quick-add/parse \
  -H "Content-Type: application/json" \
  -H "x-clerk-user-id: user_xxx" \
  -d '{"text":"Math test Friday 3pm","timezone":"America/New_York"}'
```

### Commit endpoint:
```bash
curl -X POST http://localhost:8787/api/quick-add/commit \
  -H "Content-Type: application/json" \
  -H "x-clerk-user-id: user_xxx" \
  -d '{
    "rawInput":"Math test Friday 3pm",
    "dedupeHash":"abc123",
    "parsed":{
      "courseId":"uuid-here",
      "title":"Math Test",
      "category":"Exam",
      "dueDateISO":"2026-02-20T15:00:00-05:00",
      "createFocusSession":true,
      "sessionStartISO":"2026-02-19T18:00:00-05:00",
      "sessionEndISO":"2026-02-19T19:00:00-05:00",
      "confidence":0.92
    },
    "saveAlias":{"alias":"Math","courseId":"uuid-here"}
  }'
```

## Next Steps

1. **Replace `heuristicParse` with Vercel AI SDK:**
   - Call your model with a system prompt that outputs structured JSON
   - Map course names → suggestions using aliases and course names
   - Return ISO times with timezone normalization (FE allows override)

2. **Frontend Integration:**
   - Call `/parse` when user types in quick-add input
   - Show suggestions for course selection
   - Call `/commit` when user confirms
   - Handle deduplication responses

3. **Error Handling:**
   - Add proper error logging
   - Handle database constraint violations gracefully
   - Return user-friendly error messages

## Files Created

- `apps/api/src/routes/quickAdd.ts` - Main route handler
- `apps/api/src/index.ts` - Updated to mount `/api/quick-add` route

