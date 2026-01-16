import { db, schema } from './db';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// PDF parsing - requires CommonJS require
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Syllabus schema for structured extraction
const SyllabusSchema = z.object({
  confidence: z.number().min(0).max(1),
  course: z.object({
    name: z.string(),
    professor: z.string().nullable(),
    credits: z.number().nullable(),
    schedule: z.array(z.object({
      day: z.string(),
      start: z.string(),
      end: z.string(),
      location: z.string().nullable(),
    })).nullable(),
    office_hours: z.array(z.object({
      day: z.string(),
      start: z.string(),
      end: z.string(),
      location: z.string().nullable(),
    })).nullable(),
    grade_weights: z.record(z.number()).nullable()
  }),
  assignments: z.array(z.object({
    title: z.string(),
    due_date: z.string().nullable(),
    category: z.string().nullable(),
    effort_estimate_minutes: z.number().nullable(),
  })),
});

export type ParsedSyllabus = z.infer<typeof SyllabusSchema>;

interface ExtractedData {
  confidenceScore: number;
  items: Array<{
    type: 'course' | 'assignment' | 'office_hours' | 'class_schedule' | 'grade_weights';
    payload: any;
    confidence: number;
  }>;
}

export class SyllabusParser {
  private supabase;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase URL and service role key are required');
    }
    this.supabase = createClient(url, key);
  }

  /**
   * Processes a PDF and returns structured data for staging.
   * Targets: Schedule, Grading Weights, and Assignments.
   */
  async parseSyllabus(fileId: string, userId: string, timezone: string = 'UTC') {
    // 1. Get the syllabus file to verify ownership
    const [syllabusFile] = await db
      .select()
      .from(schema.syllabusFiles)
      .where(eq(schema.syllabusFiles.id, fileId))
      .limit(1);

    if (!syllabusFile) {
      throw new Error(`Syllabus file ${fileId} not found`);
    }

    // Verify file belongs to user
    if (syllabusFile.userId !== userId) {
      throw new Error('Unauthorized: Syllabus file does not belong to user');
    }

    // 2. Create parse run with 'processing' status (will update to 'succeeded' or 'failed')
    const [run] = await db
      .insert(schema.syllabusParseRuns)
      .values({
        syllabusFileId: fileId,
        status: 'processing',
        model: 'gpt-4o-mini'
      })
      .returning();

    try {
      // 3. Fetch the raw text/OCR from storage
      const rawText = await this.extractTextFromPDF(fileId);

      // 4. Send to AI for Structured Extraction
      // We target Class Schedule, Office Hours, and Assignments
      const extractedData = await this.extractStructuredData(rawText, timezone);

      // 5. Update parse run status to succeeded
      await db
        .update(schema.syllabusParseRuns)
        .set({
          status: 'succeeded',
          confidence: extractedData.confidenceScore.toString(),
          completedAt: new Date()
        })
        .where(eq(schema.syllabusParseRuns.id, run.id));

      // 6. Populate Staging Items
      // Items are marked with confidence for UI warnings (low confidence < 0.6)
      await this.populateStagingItems(run.id, extractedData.items);

      return { runId: run.id, itemsCount: extractedData.items.length };
    } catch (error: any) {
      // Update parse run status to failed on error
      await db
        .update(schema.syllabusParseRuns)
        .set({
          status: 'failed',
          error: error.message || 'Unknown error occurred during parsing',
          completedAt: new Date()
        })
        .where(eq(schema.syllabusParseRuns.id, run.id));

      throw error; // Re-throw to surface error to caller
    }
  }

  /**
   * Extracts text from PDF stored in Supabase Storage
   */
  private async extractTextFromPDF(fileId: string): Promise<string> {
    // Get file path from syllabus_files table
    const [file] = await db
      .select({ path: schema.syllabusFiles.path })
      .from(schema.syllabusFiles)
      .where(eq(schema.syllabusFiles.id, fileId))
      .limit(1);

    if (!file) {
      throw new Error(`Syllabus file ${fileId} not found`);
    }

    // Download PDF from Supabase Storage
    const { data: buffer, error: downloadError } = await this.supabase.storage
      .from('syllabi')
      .download(file.path);

    if (downloadError || !buffer) {
      throw new Error(`Failed to download PDF: ${downloadError?.message || 'Unknown error'}`);
    }

    // Convert Blob to Buffer for pdf-parse
    const arrayBuffer = await buffer.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Extract text using pdf-parse
    try {
      const data = await pdfParse(pdfBuffer);
      const text = (data.text || '').trim();
      
      if (text.length < 40) {
        throw new Error('No extractable text. PDF may be image-only (OCR needed).');
      }

      return text;
    } catch (error: any) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extracts structured data from raw text using AI
   */
  private async extractStructuredData(rawText: string, timezone: string): Promise<ExtractedData> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY not found in process.env');
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI')));
      throw new Error('OPENAI_API_KEY not set');
    }

    try {
      // Ensure OPENAI_API_KEY is set in process.env for the SDK
      // The @ai-sdk/openai package reads from process.env.OPENAI_API_KEY automatically
      if (!process.env.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = apiKey;
      }
      
      // Create OpenAI model instance - SDK reads from process.env.OPENAI_API_KEY
      const model = openai('gpt-4o-mini');
      
      const { object: parsed } = await generateObject({
        model,
        schema: SyllabusSchema,
        prompt: [
          'You are extracting structured syllabus data for a college course.',
          'Output must conform to the schema.',
          'Normalize times to 24h HH:mm strings; use the provided timezone context for any inferred dates.',
          'Prefer exact values present in the text; if unsure, omit fields.',
          `Timezone: ${timezone}`,
          'Text:',
          '----',
          rawText,
          '----',
        ].join('\n')
      });

      // Transform parsed data into staging items format
      const items: ExtractedData['items'] = [];
      const confidence = parsed.confidence || 0.5;

      // Course item
      items.push({
        type: 'course',
        payload: parsed.course,
        confidence
      });

      // Office hours items
      if (parsed.course.office_hours && Array.isArray(parsed.course.office_hours) && parsed.course.office_hours.length > 0) {
        for (const oh of parsed.course.office_hours) {
          items.push({
            type: 'office_hours',
            payload: oh,
            confidence
          });
        }
      }

      // Grade weights item
      if (parsed.course.grade_weights && typeof parsed.course.grade_weights === 'object' && Object.keys(parsed.course.grade_weights).length > 0) {
        items.push({
          type: 'grade_weights',
          payload: parsed.course.grade_weights,
          confidence
        });
      }

      // Class schedule items
      if (parsed.course.schedule && Array.isArray(parsed.course.schedule) && parsed.course.schedule.length > 0) {
        for (const schedule of parsed.course.schedule) {
          items.push({
            type: 'class_schedule',
            payload: schedule,
            confidence
          });
        }
      }

      // Assignment items
      if (parsed.assignments && Array.isArray(parsed.assignments) && parsed.assignments.length > 0) {
        for (const assignment of parsed.assignments) {
          items.push({
            type: 'assignment',
            payload: assignment,
            confidence
          });
        }
      }

      return {
        confidenceScore: confidence,
        items
      };
    } catch (error: any) {
      throw new Error(`AI parsing failed: ${error.message}`);
    }
  }

  /**
   * Populates staging items in the database
   * Items are marked with confidence for UI warnings (low confidence < 0.6)
   */
  private async populateStagingItems(parseRunId: string, items: ExtractedData['items']) {
    if (items.length === 0) {
      return;
    }

    // Create dedupe keys for each item to prevent duplicates
    // Use confidence_score (migration 0011) - also set legacy confidence for backward compatibility
    const stagingItems = items.map(item => ({
      parseRunId,
      type: item.type,
      payload: item.payload,
      confidence: item.confidence.toString(), // Legacy field
      confidenceScore: item.confidence.toString(), // Migration 0011: For preview UI sorting
      dedupeKey: this.generateDedupeKey(item.type, item.payload)
    }));

    // Insert all staging items in a single batch
    await db.insert(schema.syllabusStagingItems).values(stagingItems as any);
  }

  /**
   * Generates a dedupe key for an item to prevent duplicates
   */
  private generateDedupeKey(type: string, payload: any): string {
    // Create a normalized JSON string for hashing
    const normalized = JSON.stringify({ type, payload });
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }
}





