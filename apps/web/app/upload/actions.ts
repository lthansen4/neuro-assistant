"use server";

import { supabaseServer } from "../../lib/supabaseServer";
import { db, schema } from "../../lib/db";
import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";

async function getOrCreateUserId(): Promise<{ dbUserId: string; clerkUserId: string }> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new Error("Not authenticated. Please sign in to upload a syllabus.");
  }
  const found = await db.query.users.findFirst({
    where: eq(schema.users.clerkUserId, clerkUserId),
  });
  let dbUserId: string;
  if (found) {
    dbUserId = found.id;
  } else {
    const [u] = await db.insert(schema.users).values({
      clerkUserId,
      timezone: "UTC",
      targetStudyRatio: "2.50",
    }).returning();
    dbUserId = u.id;
  }
  return { dbUserId, clerkUserId };
}

export async function getDbUserId(): Promise<string> {
  const { dbUserId } = await getOrCreateUserId();
  return dbUserId;
}

async function updateParseRunStatus(syllFileId: string, errorMessage: string) {
  try {
    const parseRuns = await db
      .select()
      .from(schema.syllabusParseRuns)
      .where(eq(schema.syllabusParseRuns.syllabusFileId, syllFileId))
      .orderBy(desc(schema.syllabusParseRuns.createdAt))
      .limit(1);
    
    if (parseRuns.length > 0) {
      const parseRun = parseRuns[0];
      await db
        .update(schema.syllabusParseRuns)
        .set({ 
          status: "failed", 
          error: errorMessage,
          completedAt: new Date() 
        })
        .where(eq(schema.syllabusParseRuns.id, parseRun.id));
    }
  } catch (updateError) {
    console.error("Failed to update parse run status:", updateError);
  }
}

export async function uploadSyllabus(formData: FormData) {
  const tz = (formData.get("timezone") as string) || "UTC";
  let syllFile: { id: string } | undefined;
  
  try {
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return {
        ok: false,
        success: false,
        error: "No file provided",
        parseRunId: null,
        fileId: null,
        parsed: null,
        timezone: tz,
      };
    }
    
    if (file.type !== "application/pdf") {
      return {
        ok: false,
        success: false,
        error: "Only PDF files are supported",
        parseRunId: null,
        fileId: null,
        parsed: null,
        timezone: tz,
      };
    }

    const { dbUserId, clerkUserId } = await getOrCreateUserId();
    const supabase = supabaseServer();

    // 1. Upload to Supabase Storage
    const buf = Buffer.from(await file.arrayBuffer());
    const path = `syllabi/${dbUserId}/${crypto.randomUUID()}-${file.name ?? "syllabus.pdf"}`;
    const { data, error: upErr } = await supabase.storage.from("syllabi").upload(path, buf, {
      contentType: "application/pdf",
      upsert: false
    });
    if (upErr) {
      console.error("Supabase upload error:", upErr);
      return {
        ok: false,
        success: false,
        error: `Upload failed: ${upErr.message}`,
        parseRunId: null,
        fileId: null,
        parsed: null,
        timezone: tz,
      };
    }

    // 2. Create syllabus_files record (use database user ID)
    const [fileRecord] = await db.insert(schema.syllabusFiles).values({
      userId: dbUserId,
      path,
      originalFilename: file.name ?? "syllabus.pdf",
    }).returning();
    syllFile = fileRecord;

    // 3. Call API parse endpoint to extract and stage items
    // The API route's getUserId() function will look up the database user from Clerk ID
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://neuroapi-production.up.railway.app").replace(/\/$/, ""); // Remove trailing slash
    const parseUrl = `${apiBase}/api/upload/parse`;
    console.log("[Upload Action] API Base from env:", process.env.NEXT_PUBLIC_API_BASE, "| Final URL:", parseUrl);
    const parseResponse = await fetch(parseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clerk-user-id": clerkUserId, // Pass Clerk user ID for API to look up database user
      },
      body: JSON.stringify({
        fileId: syllFile.id,
        timezone: tz,
      }),
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text().catch(() => "Could not read error response");
      console.error("[Parse API] Failed with status:", parseResponse.status, "Body:", errorText);
      
      let errorMsg = `Parsing failed: ${parseResponse.status}`;
      try {
        const errorData = JSON.parse(errorText);
        errorMsg = `Parsing failed: ${errorData.error || "Unknown error"}`;
      } catch (e) {
        errorMsg = `Parsing failed (Non-JSON response): ${errorText.slice(0, 100)}`;
      }
      
      // Update parse run status
      await updateParseRunStatus(syllFile.id, errorMsg);
      
      return {
        ok: false,
        success: false,
        error: errorMsg,
        parseRunId: null,
        fileId: syllFile.id,
        parsed: null,
        timezone: tz,
      };
    }

    const parseResult = await parseResponse.json();

    if (!parseResult.ok) {
      const errorMsg = parseResult.error || "Parsing failed";
      await updateParseRunStatus(syllFile.id, errorMsg);
      
      return {
        ok: false,
        success: false,
        error: errorMsg,
        parseRunId: null,
        fileId: syllFile.id,
        parsed: null,
        timezone: tz,
      };
    }

    // 4. Fetch staged items to build response (for backward compatibility with review component)
    // The review component expects parsed data, so we fetch all staged items
    const allStagedItems = await db
      .select()
      .from(schema.syllabusStagingItems)
      .where(eq(schema.syllabusStagingItems.parseRunId, parseResult.runId));

    // Get course item to extract basic info
    const courseItem = allStagedItems.find((item) => item.type === "course");
    
    if (!courseItem) {
      const errorMsg = "Parsing completed but no course data was extracted. Please check the syllabus format.";
      await updateParseRunStatus(syllFile.id, errorMsg);
      
      return {
        ok: false,
        success: false,
        error: errorMsg,
        parseRunId: parseResult.runId,
        fileId: syllFile.id,
        parsed: null,
        timezone: tz,
      };
    }

    // Build parsed response structure matching what SyllabusReview expects
    // The parser creates separate staging items for class_schedule and office_hours,
    // but the frontend expects them nested in course.schedule and course.office_hours
    const coursePayload = courseItem.payload as any;
    const scheduleItems = allStagedItems
      .filter((item) => item.type === "class_schedule")
      .map((item) => item.payload as any);
    const officeHoursItems = allStagedItems
      .filter((item) => item.type === "office_hours")
      .map((item) => item.payload as any);
    
    const parsedData = {
      course: {
        ...coursePayload,
        // Merge schedule and office_hours from separate staging items into course object
        schedule: scheduleItems.length > 0 ? scheduleItems : (coursePayload.schedule || null),
        office_hours: officeHoursItems.length > 0 ? officeHoursItems : (coursePayload.office_hours || null),
      },
      assignments: allStagedItems
        .filter((item) => item.type === "assignment")
        .map((item) => item.payload as any),
      confidence: Number(courseItem.confidence || courseItem.confidenceScore || 0),
    };

    return {
      ok: true,
      parseRunId: parseResult.runId,
      fileId: syllFile.id,
      parsed: parsedData,
      timezone: tz,
      success: true,
      message: `Uploaded and parsed successfully. ${parseResult.itemsCount || 0} items staged.`,
      itemsCount: parseResult.itemsCount || 0,
    };
  } catch (err: any) {
    console.error("Upload/parse error:", err);
    
    // For Next.js Server Actions, we need to return errors in a serializable format
    const errorMessage = err?.message || err?.toString() || "Upload/parse failed";
    
    // Update parse run status if we have a file record
    // Note: syllFile might not be defined if error occurred before file creation
    if (syllFile?.id) {
      await updateParseRunStatus(syllFile.id, errorMessage);
    }
    
    // Return error in a format Next.js can handle
    return {
      ok: false,
      success: false,
      error: errorMessage,
      parseRunId: null,
      fileId: syllFile?.id || null,
      parsed: null,
      timezone: tz,
    };
  }
}

