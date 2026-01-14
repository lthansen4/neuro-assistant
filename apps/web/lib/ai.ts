import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

// OpenAI structured output requires all properties to be in 'required' array
// All fields must be present but can be null for optional values
const SyllabusSchema = z.object({
  confidence: z.number().min(0).max(1),
  course: z.object({
    name: z.string(),
    professor: z.string().nullable(),
    credits: z.number().nullable(),
    semester_start_date: z.string().nullable(), // ISO date string (YYYY-MM-DD) or null
    semester_end_date: z.string().nullable(),   // ISO date string (YYYY-MM-DD) - typically final exam date
    schedule: z.array(z.object({
      day: z.string(),           // e.g., "Mon"
      start: z.string(),         // "HH:mm"
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
    due_date: z.string().nullable(),       // ISO or date-like; FE can confirm
    category: z.string().nullable(),
    effort_estimate_minutes: z.number().nullable(),
  })),
});

export type ParsedSyllabus = z.infer<typeof SyllabusSchema>;

export async function parseSyllabusText(input: string, timezone: string): Promise<ParsedSyllabus> {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: SyllabusSchema,
    prompt: [
      "You are extracting structured syllabus data for a college course.",
      "Output must conform to the schema.",
      "Normalize times to 24h HH:mm strings; use the provided timezone context for any inferred dates.",
      "Prefer exact values present in the text; if unsure, omit fields.",
      "",
      "IMPORTANT: Extract semester dates:",
      "- semester_start_date: First day of classes (if mentioned), or null",
      "- semester_end_date: Last day of classes OR final exam date (use the later date).",
      "  Look for phrases like 'Final: [date]', 'Final Exam: [date]', 'Last day of classes: [date]'.",
      "  If only a final exam date is found, use that as semester_end_date.",
      "  Format as YYYY-MM-DD (e.g., '2024-04-27' for April 27, 2024).",
      "",
      `Timezone: ${timezone}`,
      "Text:",
      "----",
      input,
      "----",
    ].join("\n")
  });
  
  return object;
}

