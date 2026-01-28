# PDF Upload and Parse Feature - Testing Guide

## Prerequisites Checklist

Before testing, verify these are set up:

### 1. Environment Variables ✓
All required environment variables are in `.env` (root):
- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- ✅ `OPENAI_API_KEY` - OpenAI API key
- ✅ `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- ✅ `CLERK_SECRET_KEY` - Clerk secret key

Also check `apps/web/.env.local` has:
- ✅ `NEXT_PUBLIC_API_BASE=http://localhost:8787` (or ensure it's set)

### 2. Supabase Storage Bucket
Verify the `syllabi` bucket exists:
- Go to Supabase Dashboard → Storage
- Check for bucket named `syllabi`
- If missing, run: `npm run tsx scripts/create-syllabi-bucket.ts`

### 3. Database Tables
Ensure these tables exist:
- `users`
- `syllabus_files`
- `syllabus_parse_runs`
- `syllabus_staging_items`

## Step-by-Step Testing Instructions

### Step 1: Start Both Servers

**Terminal 1 - Start API Server:**
```bash
cd "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant"
npm run dev -w @neuro/api
```

Expected output:
```
> @neuro/api@0.0.1 dev
> tsx watch src/server.ts

API listening on http://localhost:8787
```

**Terminal 2 - Start Web Server:**
```bash
cd "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant"
npm run dev -w @neuro/web
```

Expected output:
```
> @neuro/web@0.0.1 dev
> next dev -p 3000

   ▲ Next.js 14.2.5
   - Local:        http://localhost:3000
```

✅ **Verification:** Both servers should be running without errors.

---

### Step 2: Prepare a Test PDF

You'll need a PDF syllabus file to test with. The PDF should contain:
- Course name (e.g., "CS 101 - Introduction to Computer Science")
- Professor name
- Schedule information (days/times)
- Assignments with due dates
- Office hours
- Grade weights/categories

**Options:**
1. Use a real syllabus PDF
2. Create a simple test PDF with text (not image-only)
3. Use a sample PDF from a university website

⚠️ **Important:** The PDF must have extractable text (not just images). Scanned PDFs may not work.

---

### Step 3: Log In to the Application

1. Open your browser and go to: `http://localhost:3000`
2. You should be redirected to Clerk sign-in
3. Sign in with your Clerk account
4. You should be redirected to the dashboard or home page

✅ **Verification:** You're authenticated and can see the dashboard.

---

### Step 4: Navigate to Upload Page

1. In your browser, navigate to: `http://localhost:3000/upload`
2. You should see the "Syllabus Dump (Server Action)" page with:
   - A file input field
   - An "Upload & Parse" button
   - Instructions text

✅ **Verification:** The upload page loads without errors.

---

### Step 5: Upload and Parse PDF

1. **Click the file input** and select your test PDF
2. **Click "Upload & Parse"** button
3. **Wait for processing** (this may take 15-45 seconds):
   - The form will submit
   - The browser may show a loading state
   - Server logs will show progress

**What happens behind the scenes:**
1. ✅ PDF is uploaded to Supabase Storage (`syllabi/{userId}/{uuid}-filename.pdf`)
2. ✅ PDF text is extracted via API endpoint (`/api/upload/extract-pdf`)
3. ✅ Text is parsed with OpenAI (gpt-4o-mini)
4. ✅ Parsed data is staged in database tables

---

### Step 6: Check Server Logs

**In Terminal 1 (API Server):**
Look for:
```
POST /api/upload/extract-pdf
```

**In Terminal 2 (Web Server):**
Look for:
```
POST /upload
Processing syllabus...
Extracted text: [length]
AI parsing...
Staging items...
```

✅ **Verification:** No errors in either terminal.

---

### Step 7: Verify Supabase Storage

1. Go to **Supabase Dashboard → Storage → syllabi**
2. You should see a folder structure like: `{userId}/`
3. Inside, there should be a PDF file with a UUID name

✅ **Verification:** PDF is stored in Supabase Storage.

---

### Step 8: Verify Database Records

**Option A: Using Supabase SQL Editor**

1. Go to **Supabase Dashboard → SQL Editor**
2. Run these queries:

```sql
-- Check uploaded file
SELECT * FROM syllabus_files 
ORDER BY created_at DESC 
LIMIT 1;

-- Check parse run
SELECT * FROM syllabus_parse_runs 
ORDER BY created_at DESC 
LIMIT 1;

-- Check staged items
SELECT 
  type,
  payload,
  confidence,
  created_at
FROM syllabus_staging_items 
WHERE parse_run_id = (
  SELECT id FROM syllabus_parse_runs 
  ORDER BY created_at DESC 
  LIMIT 1
)
ORDER BY created_at;
```

**Option B: Using a Database Client**

Connect to your database and run the same queries.

**Expected Results:**

1. **syllabus_files table:**
   - One row with your PDF metadata
   - `path` field contains Supabase Storage path
   - `original_filename` contains your PDF name

2. **syllabus_parse_runs table:**
   - One row with status `"succeeded"`
   - `model` = `"gpt-4o-mini"`
   - `confidence` should be a number (0-1)

3. **syllabus_staging_items table:**
   - At least one row with `type = "course"`
   - May have rows with `type = "assignment"` (if assignments found)
   - May have rows with `type = "office_hours"` (if office hours found)
   - May have rows with `type = "grade_weights"` (if grade weights found)
   - Each row has a `payload` JSON field with extracted data

**Example payload structure:**
```json
{
  "type": "course",
  "payload": {
    "name": "CS 101",
    "professor": "Dr. Smith",
    "credits": 3,
    "schedule": [...],
    ...
  }
}
```

✅ **Verification:** All tables have expected data.

---

### Step 9: Review Extracted Data

Check the `payload` field in `syllabus_staging_items` to verify:

1. **Course Information:**
   - ✅ Course name is extracted
   - ✅ Professor name is extracted
   - ✅ Credits are extracted (if available)

2. **Schedule:**
   - ✅ Days of week are identified
   - ✅ Times are extracted
   - ✅ Location is extracted (if available)

3. **Assignments:**
   - ✅ Assignment titles are extracted
   - ✅ Due dates are parsed correctly
   - ✅ Categories/types are identified

4. **Office Hours:**
   - ✅ Days and times are extracted
   - ✅ Location is extracted (if available)

5. **Grade Weights:**
   - ✅ Categories are identified
   - ✅ Percentages/weights are extracted

---

## Troubleshooting

### Error: "PDF extraction failed"
- **Cause:** API server not running or connection issue
- **Fix:** Ensure API server is running on port 8787
- **Check:** `curl http://localhost:8787/api/upload/extract-pdf` (should return error, but server should respond)

### Error: "No extractable text"
- **Cause:** PDF is image-only (scanned) or corrupted
- **Fix:** Use a PDF with actual text content, or convert scanned PDF to text first

### Error: "Upload failed: Bucket not found"
- **Cause:** Supabase Storage bucket `syllabi` doesn't exist
- **Fix:** Run `npm run tsx scripts/create-syllabi-bucket.ts`

### Error: "OPENAI_API_KEY not set"
- **Cause:** Environment variable missing
- **Fix:** Add `OPENAI_API_KEY=sk-...` to `.env` and `apps/web/.env.local`, restart web server

### Error: "Not authenticated"
- **Cause:** Not logged in with Clerk
- **Fix:** Sign in at `http://localhost:3000`

### Parse status shows "failed"
- **Check:** `syllabus_parse_runs` table for `error` field
- **Common causes:**
  - Invalid PDF format
  - No text in PDF
  - OpenAI API error
  - Network timeout

### No staged items created
- **Check:** Parse run status in database
- **Check:** Confidence score (may be too low)
- **Check:** PDF content actually contains course information

---

## Success Criteria

✅ All steps complete without errors  
✅ PDF uploaded to Supabase Storage  
✅ Parse run shows status "succeeded"  
✅ Staged items contain extracted course data  
✅ Confidence score is > 0.5 (if present)  
✅ All expected data types are extracted (course, assignments, etc.)

---

## Next Steps After Testing

Once testing is successful, you can:
1. Create a review/confirmation page for staged items
2. Implement commit functionality to create actual courses/assignments
3. Add UI improvements (progress indicators, preview, etc.)
4. Add error handling for edge cases
5. Add support for OCR for scanned PDFs

---

## Quick Test Checklist

- [ ] Both servers running (API on 8787, Web on 3000)
- [ ] Logged in with Clerk
- [ ] Navigated to `/upload`
- [ ] Selected PDF file
- [ ] Clicked "Upload & Parse"
- [ ] No errors in server logs
- [ ] PDF in Supabase Storage
- [ ] Parse run in database with status "succeeded"
- [ ] Staged items in database with extracted data







