# Syllabus Dump Setup Guide

## Overview
Production-ready Next.js Server Actions backend for syllabus PDF upload, text extraction, AI parsing, and staging to database.

## Features
- ✅ PDF upload to Supabase Storage
- ✅ Text extraction using `pdf-parse`
- ✅ AI parsing with Vercel AI SDK + OpenAI (gpt-4o-mini)
- ✅ Structured data extraction (course, assignments, schedule, office hours, grade weights)
- ✅ Staging items in database for review/commit
- ✅ Clerk authentication integration
- ✅ Auto-creates user if missing

## Dependencies Installed
- `ai` - Vercel AI SDK
- `@ai-sdk/openai` - OpenAI provider
- `zod` - Schema validation
- `pdf-parse` - PDF text extraction
- `@supabase/supabase-js` - Supabase client
- `drizzle-orm` - Database ORM
- `pg` - PostgreSQL client

## Environment Variables Required

Add to `.env` (root) and `apps/web/.env.local`:

```bash
# Database
DATABASE_URL=postgresql://postgres:password@host:5432/postgres

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-...
```

## Supabase Setup

1. **Create Storage Bucket:**
   - Go to Supabase Dashboard → Storage
   - Create bucket named `syllabi`
   - Set to **Private**
   - Enable RLS (Row Level Security)

2. **Storage Policies (if needed):**
   - Users can upload to their own folder: `syllabi/{userId}/`
   - Service role key is used server-side, so policies may not be needed

## Files Created

### 1. `apps/web/lib/db.ts`
Database connection using Drizzle ORM with PostgreSQL pool.

### 2. `apps/web/lib/supabaseServer.ts`
Supabase client factory using service role key (server-side only).

### 3. `apps/web/lib/ai.ts`
AI parsing helper using Vercel AI SDK:
- Uses `gpt-4o-mini` model
- Structured output with Zod schema
- Extracts: course info, assignments, schedule, office hours, grade weights

### 4. `apps/web/app/upload/actions.ts`
Server Action that:
- Authenticates user via Clerk
- Uploads PDF to Supabase Storage
- Extracts text from PDF
- Parses with AI
- Creates staging items in database
- Tracks parse runs with status/confidence

### 5. `apps/web/app/upload/page.tsx`
Upload page with:
- File input (PDF only)
- Auto-detects timezone
- Server Action form submission
- Shows staging status

## Usage

1. **Start the web server:**
   ```bash
   npm run dev -w @neuro/web
   ```

2. **Visit:** `http://localhost:3000/upload`

3. **Upload a PDF:**
   - Select a syllabus PDF
   - Click "Upload & Parse"
   - Wait for AI parsing (may take 10-30 seconds)

4. **Check staging items:**
   - Items are stored in `syllabus_staging_items` table
   - Review parse confidence and extracted data
   - Next step: Create confirm/commit flow

## Database Tables Used

- `syllabus_files` - Stores uploaded PDF metadata
- `syllabus_parse_runs` - Tracks parsing status and results
- `syllabus_staging_items` - Staged items waiting for confirmation

## Next Steps

1. **Create Confirm/Commit Flow:**
   - Review page showing staged items
   - Allow editing before commit
   - Commit action to create courses, assignments, calendar events

2. **Error Handling:**
   - Better error messages for failed parses
   - Retry mechanism for failed extractions
   - OCR support for image-only PDFs

3. **UI Improvements:**
   - Progress indicator during parsing
   - Preview of extracted data
   - Edit staged items before commit

## Testing

Test with a sample syllabus PDF:
- Should extract course name, professor, schedule
- Should identify assignments with due dates
- Should parse office hours and grade weights
- Check `syllabus_staging_items` table for results

## Troubleshooting

**"No extractable text" error:**
- PDF may be image-only (needs OCR)
- Try a different PDF or convert to text first

**"OPENAI_API_KEY not set":**
- Ensure environment variable is set in `.env` and `.env.local`
- Restart Next.js dev server after adding

**"Supabase env not set":**
- Check `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Service role key is different from anon key

**Upload fails:**
- Verify `syllabi` bucket exists and is accessible
- Check Supabase Storage policies
- Ensure service role key has storage access




