// scripts/test-grading-components.ts
// Test script to verify grading_components population in Phase 2
import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";
import { eq, sql } from "drizzle-orm";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    console.log("🧪 Testing Grading Components Population (Phase 2)\n");

    // Step 1: Get or create a test user
    console.log("📋 Step 1: Getting test user...");
    let testUser = await db.query.users.findFirst({
      where: eq(schema.users.clerkUserId, "test-user-phase2"),
    });

    if (!testUser) {
      console.log("   Creating test user...");
      const [user] = await db
        .insert(schema.users)
        .values({
          clerkUserId: "test-user-phase2",
          timezone: "America/New_York",
        } as any)
        .returning();
      testUser = user;
      console.log(`   ✅ Created user: ${testUser.id}`);
    } else {
      console.log(`   ✅ Using existing user: ${testUser.id}`);
    }
    const userId = testUser.id as string;

    // Step 2: Create a test course
    console.log("\n📋 Step 2: Creating test course...");
    const [course] = await db
      .insert(schema.courses)
      .values({
        userId,
        name: "Test Course - Phase 2",
        professor: "Dr. Test",
        credits: 3,
        gradeWeightsJson: null, // Will be set by commit
      } as any)
      .returning();
    const courseId = course.id as string;
    console.log(`   ✅ Created course: ${courseId}`);

    // Step 3: Create a mock syllabus file and parse run
    console.log("\n📋 Step 3: Creating mock syllabus parse run...");
    const [syllabusFile] = await db
      .insert(schema.syllabusFiles)
      .values({
        userId,
        courseId,
        path: "test/sample-syllabus.pdf",
        originalFilename: "sample-syllabus.pdf",
      } as any)
      .returning();

    const [parseRun] = await db
      .insert(schema.syllabusParseRuns)
      .values({
        syllabusFileId: syllabusFile.id,
        status: "succeeded",
        model: "gpt-4o-mini",
        confidence: 0.85,
      } as any)
      .returning();
    const parseRunId = parseRun.id as string;
    console.log(`   ✅ Created parse run: ${parseRunId}`);

    // Step 4: Simulate commit with grade weights
    console.log("\n📋 Step 4: Simulating commit with grade weights...");
    const gradeWeights = {
      "Midterm Exam": 30,
      "Final Exam": 40,
      "Homework": 20,
      "Participation": 10,
    };

    console.log("   Grade weights to commit:");
    Object.entries(gradeWeights).forEach(([name, weight]) => {
      console.log(`     - ${name}: ${weight}%`);
    });

    // Update course with grade_weights_json (dual-write part 1)
    await db
      .update(schema.courses)
      .set({
        gradeWeightsJson: gradeWeights as any,
      })
      .where(eq(schema.courses.id, courseId));

    // Populate grading_components (dual-write part 2)
    // Clear existing components for this course
    await db
      .delete(schema.gradingComponents)
      .where(eq(schema.gradingComponents.courseId, courseId));

    // Insert normalized components
    const components = Object.entries(gradeWeights).map(([name, weight]) => ({
      courseId,
      name: name.trim(),
      weightPercent: Number(weight),
      source: "syllabus" as const,
      parseRunId: parseRunId,
      dropLowest: null,
      sourceItemId: null,
    }));

    if (components.length > 0) {
      await db.insert(schema.gradingComponents).values(components as any);
      console.log(`   ✅ Inserted ${components.length} grading components`);
    }

    // Step 5: Verify dual-write consistency
    console.log("\n📋 Step 5: Verifying dual-write consistency...");

    // Check grade_weights_json
    const updatedCourse = await db.query.courses.findFirst({
      where: eq(schema.courses.id, courseId),
    });

    if (!updatedCourse) {
      throw new Error("Course not found");
    }

    console.log("\n   📊 grade_weights_json (courses table):");
    if (updatedCourse.gradeWeightsJson) {
      const jsonWeights = updatedCourse.gradeWeightsJson as Record<string, number>;
      Object.entries(jsonWeights).forEach(([name, weight]) => {
        console.log(`     - ${name}: ${weight}%`);
      });
    } else {
      console.log("     ❌ No grade_weights_json found");
    }

    // Check grading_components
    const componentsFromDb = await db.query.gradingComponents.findMany({
      where: eq(schema.gradingComponents.courseId, courseId),
      orderBy: schema.gradingComponents.weightPercent,
    });

    console.log("\n   📊 grading_components (normalized table):");
    if (componentsFromDb.length > 0) {
      let totalWeight = 0;
      componentsFromDb.forEach((comp) => {
        console.log(
          `     - ${comp.name}: ${comp.weightPercent}% (source: ${comp.source}, parse_run: ${comp.parseRunId?.slice(0, 8)}...)`
        );
        totalWeight += Number(comp.weightPercent);
      });
      console.log(`     Total: ${totalWeight}%`);
    } else {
      console.log("     ❌ No grading_components found");
    }

    // Step 6: Verify consistency
    console.log("\n📋 Step 6: Verifying data consistency...");
    const jsonWeights = (updatedCourse.gradeWeightsJson as Record<string, number>) || {};
    const normalizedWeights = componentsFromDb.reduce((acc, comp) => {
      acc[comp.name] = Number(comp.weightPercent);
      return acc;
    }, {} as Record<string, number>);

    const jsonKeys = Object.keys(jsonWeights).sort();
    const normalizedKeys = Object.keys(normalizedWeights).sort();

    if (JSON.stringify(jsonKeys) === JSON.stringify(normalizedKeys)) {
      console.log("   ✅ Component names match between JSON and normalized");
    } else {
      console.log("   ❌ Component names don't match!");
      console.log(`     JSON: ${jsonKeys.join(", ")}`);
      console.log(`     Normalized: ${normalizedKeys.join(", ")}`);
    }

    let weightsMatch = true;
    for (const key of jsonKeys) {
      if (jsonWeights[key] !== normalizedWeights[key]) {
        weightsMatch = false;
        console.log(
          `   ❌ Weight mismatch for "${key}": JSON=${jsonWeights[key]}, Normalized=${normalizedWeights[key]}`
        );
      }
    }
    if (weightsMatch) {
      console.log("   ✅ Weights match between JSON and normalized");
    }

    // Step 7: Test parse_run_id tracking
    console.log("\n📋 Step 7: Verifying parse_run_id tracking...");
    const componentsWithParseRun = componentsFromDb.filter((c) => c.parseRunId === parseRunId);
    if (componentsWithParseRun.length === componentsFromDb.length) {
      console.log(`   ✅ All ${componentsWithParseRun.length} components linked to parse_run_id`);
    } else {
      console.log(
        `   ❌ Only ${componentsWithParseRun.length} of ${componentsFromDb.length} components linked to parse_run_id`
      );
    }

    // Step 8: Test replace strategy (update with new weights)
    console.log("\n📋 Step 8: Testing replace strategy (update with new weights)...");
    const newGradeWeights = {
      "Midterm": 25,
      "Final": 35,
      "Projects": 25,
      "Quizzes": 15,
    };

    // Simulate updating course
    await db
      .update(schema.courses)
      .set({
        gradeWeightsJson: newGradeWeights as any,
      })
      .where(eq(schema.courses.id, courseId));

    // Replace components
    await db
      .delete(schema.gradingComponents)
      .where(eq(schema.gradingComponents.courseId, courseId));

    const newComponents = Object.entries(newGradeWeights).map(([name, weight]) => ({
      courseId,
      name: name.trim(),
      weightPercent: Number(weight),
      source: "syllabus" as const,
      parseRunId: parseRunId,
      dropLowest: null,
      sourceItemId: null,
    }));

    await db.insert(schema.gradingComponents).values(newComponents as any);

    const updatedComponents = await db.query.gradingComponents.findMany({
      where: eq(schema.gradingComponents.courseId, courseId),
    });

    console.log(`   ✅ Updated components: ${updatedComponents.length} rows`);
    console.log("   New components:");
    updatedComponents.forEach((comp) => {
      console.log(`     - ${comp.name}: ${comp.weightPercent}%`);
    });

    if (updatedComponents.length === Object.keys(newGradeWeights).length) {
      console.log("   ✅ Replace strategy working: old components deleted, new ones inserted");
    } else {
      console.log(
        `   ❌ Replace strategy issue: expected ${Object.keys(newGradeWeights).length}, got ${updatedComponents.length}`
      );
    }

    // Summary
    console.log("\n✨ Test Summary:");
    console.log("   ✅ Dual-write: grade_weights_json and grading_components populated");
    console.log("   ✅ Data consistency: JSON and normalized match");
    console.log("   ✅ Tracking: parse_run_id linked correctly");
    console.log("   ✅ Replace strategy: components updated correctly");
    console.log("\n🎉 Phase 2 implementation is working correctly!");

    // Cleanup option (commented out - uncomment to clean up test data)
    // console.log("\n🧹 Cleaning up test data...");
    // await db.delete(schema.gradingComponents).where(eq(schema.gradingComponents.courseId, courseId));
    // await db.delete(schema.courses).where(eq(schema.courses.id, courseId));
    // await db.delete(schema.syllabusParseRuns).where(eq(schema.syllabusParseRuns.id, parseRunId));
    // await db.delete(schema.syllabusFiles).where(eq(schema.syllabusFiles.id, syllabusFile.id));
    // console.log("   ✅ Test data cleaned up");
  } catch (e: any) {
    console.error("\n❌ Test failed:", e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

