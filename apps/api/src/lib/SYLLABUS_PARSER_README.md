# SyllabusParser Service

## Overview

The `SyllabusParser` service class provides a clean API for processing syllabus PDFs and extracting structured data using AI. It handles PDF text extraction, AI parsing, and staging items in the database for user review.

## Features

- ✅ PDF text extraction from Supabase Storage
- ✅ AI-powered structured data extraction (OpenAI GPT-4o-mini)
- ✅ Automatic staging item creation with confidence scores
- ✅ Deduplication via hash keys
- ✅ Error handling with parse run status tracking
- ✅ User authorization checks

## Usage

### Basic Example

```typescript
import { SyllabusParser } from './lib/syllabus-parser';

const parser = new SyllabusParser();

// Parse a syllabus PDF (fileId is the syllabus_files.id UUID)
const result = await parser.parseSyllabus(
  fileId,      // UUID of syllabus_files record
  userId,      // UUID of the user (database user ID)
  timezone     // Optional: user's timezone (defaults to 'UTC')
);

console.log(`Parse run ID: ${result.runId}`);
console.log(`Items staged: ${result.itemsCount}`);
```

### Integration with Upload Route

```typescript
// In your Hono route handler
uploadRoute.post('/parse', async (c) => {
  try {
    const userId = await getUserId(c); // Get database user ID
    const { fileId, timezone } = await c.req.json();

    const parser = new SyllabusParser();
    const result = await parser.parseSyllabus(fileId, userId, timezone || 'UTC');

    return c.json({
      ok: true,
      runId: result.runId,
      itemsCount: result.itemsCount
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
```

## Data Flow

1. **File Verification**: Verifies the syllabus file exists and belongs to the user
2. **PDF Extraction**: Downloads PDF from Supabase Storage and extracts text
3. **AI Parsing**: Sends text to OpenAI for structured extraction
4. **Staging**: Creates `syllabus_parse_runs` record and `syllabus_staging_items`
5. **Error Handling**: Updates parse run status to 'failed' if any step fails

## Extracted Data Types

The parser extracts and stages the following types:

- **course**: Course metadata (name, professor, credits)
- **office_hours**: Recurring office hours
- **grade_weights**: Grading breakdown (e.g., { "Exams": 40, "Homework": 60 })
- **class_schedule**: Recurring class meetings
- **assignments**: Individual assignments with due dates

## Confidence Scores

Each staged item includes a confidence score (0.0 - 1.0):
- `>= 0.6`: High confidence (safe to auto-select)
- `< 0.6`: Low confidence (should be reviewed by user)

Confidence scores are stored in both:
- `confidence` (legacy field)
- `confidence_score` (migration 0011, used for preview UI sorting)

## Error Handling

The parser handles errors gracefully:

- **File Not Found**: Throws error before processing
- **PDF Extraction Failed**: Updates parse run to 'failed' status
- **AI Parsing Failed**: Updates parse run to 'failed' status with error message
- **Unauthorized**: Throws error if file doesn't belong to user

## Dependencies

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for storage access
- `OPENAI_API_KEY`: OpenAI API key for AI parsing

Required npm packages (already in `apps/api/package.json`):
- `@ai-sdk/openai`: OpenAI provider for AI SDK
- `ai`: Vercel AI SDK
- `zod`: Schema validation
- `pdf-parse`: PDF text extraction
- `@supabase/supabase-js`: Supabase client

## Database Tables Used

- `syllabus_files`: Stores uploaded PDF metadata
- `syllabus_parse_runs`: Tracks parsing status and results
- `syllabus_staging_items`: Staged items awaiting user review

## Next Steps

After parsing, use the `/api/upload/review/:parseRunId` endpoint to:
1. Fetch staged items for review
2. Allow user to edit/exclude items
3. Commit items to create courses, assignments, and calendar events





