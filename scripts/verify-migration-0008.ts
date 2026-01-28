// scripts/verify-migration-0008.ts
// Verification script for Migration 0008: Calendar Split
// Checks that data was correctly migrated from course_office_hours_old to calendar_event_templates

import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface VerificationResult {
  passed: boolean;
  message: string;
  details?: any;
}

async function verifyTableExists(tableName: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    );
  `, [tableName]);
  return result.rows[0].exists;
}

async function verifyViewExists(viewName: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = $1
    );
  `, [viewName]);
  return result.rows[0].exists;
}

async function verifyDataIntegrity(): Promise<VerificationResult> {
  try {
    // Check if old table exists
    const oldTableExists = await verifyTableExists("course_office_hours_old");
    
    // Check if view exists
    const viewExists = await verifyViewExists("course_office_hours");
    
    // Check if new templates table exists
    const templatesTableExists = await verifyTableExists("calendar_event_templates");
    
    if (!oldTableExists && !templatesTableExists) {
      return {
        passed: false,
        message: "❌ Neither old table nor new table exists. Migration may not have run.",
      };
    }
    
    if (!viewExists) {
      return {
        passed: false,
        message: "❌ course_office_hours view does not exist.",
      };
    }
    
    if (!templatesTableExists) {
      return {
        passed: false,
        message: "❌ calendar_event_templates table does not exist.",
      };
    }
    
    // Count rows in old table (if it exists)
    let oldCount = 0;
    if (oldTableExists) {
      const oldResult = await pool.query(`
        SELECT COUNT(*) as count FROM course_office_hours_old;
      `);
      oldCount = parseInt(oldResult.rows[0].count, 10);
    }
    
    // Count rows in new templates table (OfficeHours only)
    const templatesResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM calendar_event_templates 
      WHERE event_type = 'OfficeHours';
    `);
    const templatesCount = parseInt(templatesResult.rows[0].count, 10);
    
    // Count rows in view
    const viewResult = await pool.query(`
      SELECT COUNT(*) as count FROM course_office_hours;
    `);
    const viewCount = parseInt(viewResult.rows[0].count, 10);
    
    // Verify counts match
    if (oldTableExists && oldCount !== templatesCount) {
      return {
        passed: false,
        message: `❌ Row count mismatch! Old table: ${oldCount}, Templates: ${templatesCount}`,
        details: {
          oldTableCount: oldCount,
          templatesCount: templatesCount,
          viewCount: viewCount,
        },
      };
    }
    
    if (templatesCount !== viewCount) {
      return {
        passed: false,
        message: `❌ View count doesn't match templates! Templates: ${templatesCount}, View: ${viewCount}`,
        details: {
          templatesCount: templatesCount,
          viewCount: viewCount,
        },
      };
    }
    
    // Verify data content matches (sample check)
    if (oldTableExists && oldCount > 0) {
      const sampleOld = await pool.query(`
        SELECT course_id, day_of_week, start_time, end_time, location
        FROM course_office_hours_old
        ORDER BY course_id, day_of_week
        LIMIT 10;
      `);
      
      const sampleNew = await pool.query(`
        SELECT 
          course_id, 
          day_of_week, 
          start_time_local as start_time, 
          end_time_local as end_time, 
          location
        FROM calendar_event_templates
        WHERE event_type = 'OfficeHours'
        ORDER BY course_id, day_of_week
        LIMIT 10;
      `);
      
      // Compare samples (simplified - exact match check)
      if (sampleOld.rows.length !== sampleNew.rows.length) {
        return {
          passed: false,
          message: "❌ Sample data count mismatch between old and new tables",
          details: {
            oldSampleCount: sampleOld.rows.length,
            newSampleCount: sampleNew.rows.length,
          },
        };
      }
      
      // Check each sample row
      for (let i = 0; i < sampleOld.rows.length; i++) {
        const oldRow = sampleOld.rows[i];
        const newRow = sampleNew.rows[i];
        
        if (
          oldRow.course_id !== newRow.course_id ||
          oldRow.day_of_week !== newRow.day_of_week ||
          oldRow.start_time !== newRow.start_time ||
          oldRow.end_time !== newRow.end_time ||
          (oldRow.location || null) !== (newRow.location || null)
        ) {
          return {
            passed: false,
            message: `❌ Data mismatch at sample row ${i}`,
            details: {
              oldRow: oldRow,
              newRow: newRow,
            },
          };
        }
      }
    }
    
    return {
      passed: true,
      message: `✅ Data integrity verified! Count: ${templatesCount} office hours migrated successfully.`,
      details: {
        oldTableCount: oldCount,
        templatesCount: templatesCount,
        viewCount: viewCount,
        oldTableExists: oldTableExists,
      },
    };
  } catch (error: any) {
    return {
      passed: false,
      message: `❌ Error during verification: ${error.message}`,
      details: { error: error.stack },
    };
  }
}

async function verifyStructure(): Promise<VerificationResult> {
  try {
    // Check templates table structure
    const templatesColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'calendar_event_templates'
      ORDER BY ordinal_position;
    `);
    
    const requiredColumns = [
      "id", "user_id", "course_id", "event_type", "day_of_week",
      "start_time_local", "end_time_local", "location", "created_at", "updated_at"
    ];
    
    const foundColumns = templatesColumns.rows.map((r: any) => r.column_name);
    const missingColumns = requiredColumns.filter((c) => !foundColumns.includes(c));
    
    if (missingColumns.length > 0) {
      return {
        passed: false,
        message: `❌ Missing required columns in calendar_event_templates: ${missingColumns.join(", ")}`,
        details: { foundColumns, missingColumns },
      };
    }
    
    // Check view structure
    const viewColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'course_office_hours'
      ORDER BY ordinal_position;
    `);
    
    const requiredViewColumns = ["id", "course_id", "day_of_week", "start_time", "end_time", "location"];
    const foundViewColumns = viewColumns.rows.map((r: any) => r.column_name);
    const missingViewColumns = requiredViewColumns.filter((c) => !foundViewColumns.includes(c));
    
    if (missingViewColumns.length > 0) {
      return {
        passed: false,
        message: `❌ Missing required columns in course_office_hours view: ${missingViewColumns.join(", ")}`,
        details: { foundViewColumns, missingViewColumns },
      };
    }
    
    // Check triggers exist
    const triggers = await pool.query(`
      SELECT trigger_name
      FROM information_schema.triggers
      WHERE event_object_table = 'course_office_hours'
      AND trigger_name LIKE 'course_office_hours_%_trigger';
    `);
    
    const requiredTriggers = [
      "course_office_hours_insert_trigger",
      "course_office_hours_update_trigger",
      "course_office_hours_delete_trigger",
    ];
    
    const foundTriggers = triggers.rows.map((r: any) => r.trigger_name);
    const missingTriggers = requiredTriggers.filter((t) => !foundTriggers.includes(t));
    
    if (missingTriggers.length > 0) {
      return {
        passed: false,
        message: `❌ Missing required triggers on course_office_hours view: ${missingTriggers.join(", ")}`,
        details: { foundTriggers, missingTriggers },
      };
    }
    
    return {
      passed: true,
      message: "✅ Structure verification passed! All required columns and triggers exist.",
      details: {
        templatesColumns: templatesColumns.rows.length,
        viewColumns: viewColumns.rows.length,
        triggers: foundTriggers.length,
      },
    };
  } catch (error: any) {
    return {
      passed: false,
      message: `❌ Error during structure verification: ${error.message}`,
      details: { error: error.stack },
    };
  }
}

async function verifyViewWritability(): Promise<VerificationResult> {
  try {
    // Try to query the view (should work)
    const selectTest = await pool.query(`
      SELECT COUNT(*) as count FROM course_office_hours LIMIT 1;
    `);
    
    if (!selectTest.rows[0]) {
      return {
        passed: false,
        message: "❌ Cannot SELECT from course_office_hours view",
      };
    }
    
    // Check if triggers are INSTEAD OF (writeable view)
    const triggerDetails = await pool.query(`
      SELECT 
        trigger_name,
        action_timing,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'course_office_hours'
      AND action_timing = 'INSTEAD OF';
    `);
    
    if (triggerDetails.rows.length < 3) {
      return {
        passed: false,
        message: `❌ Missing INSTEAD OF triggers. Found: ${triggerDetails.rows.length}, Expected: 3`,
        details: { triggers: triggerDetails.rows },
      };
    }
    
    return {
      passed: true,
      message: "✅ View is writeable! INSTEAD OF triggers are correctly configured.",
      details: {
        triggersFound: triggerDetails.rows.length,
        triggerNames: triggerDetails.rows.map((r: any) => r.trigger_name),
      },
    };
  } catch (error: any) {
    return {
      passed: false,
      message: `❌ Error during writability verification: ${error.message}`,
      details: { error: error.stack },
    };
  }
}

async function main() {
  console.log("🔍 Verifying Migration 0008: Calendar Split\n");
  console.log("=" .repeat(60));
  
  const results: VerificationResult[] = [];
  
  // Test 1: Structure verification
  console.log("\n1️⃣  Verifying table and view structure...");
  const structureResult = await verifyStructure();
  results.push(structureResult);
  console.log(`   ${structureResult.message}`);
  if (structureResult.details) {
    console.log(`   Details:`, JSON.stringify(structureResult.details, null, 2));
  }
  
  // Test 2: Data integrity verification
  console.log("\n2️⃣  Verifying data integrity...");
  const dataResult = await verifyDataIntegrity();
  results.push(dataResult);
  console.log(`   ${dataResult.message}`);
  if (dataResult.details) {
    console.log(`   Details:`, JSON.stringify(dataResult.details, null, 2));
  }
  
  // Test 3: View writability verification
  console.log("\n3️⃣  Verifying view writability...");
  const writabilityResult = await verifyViewWritability();
  results.push(writabilityResult);
  console.log(`   ${writabilityResult.message}`);
  if (writabilityResult.details) {
    console.log(`   Details:`, JSON.stringify(writabilityResult.details, null, 2));
  }
  
  // Summary
  console.log("\n" + "=".repeat(60));
  const allPassed = results.every((r) => r.passed);
  
  if (allPassed) {
    console.log("\n✨ All verifications passed! Migration 0008 is successful.");
    console.log("\n📝 Summary:");
    results.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.message.replace(/✅|❌/g, "").trim()}`);
    });
  } else {
    console.log("\n❌ Some verifications failed. Please review the errors above.");
    console.log("\n⚠️  Failed checks:");
    results
      .filter((r) => !r.passed)
      .forEach((r, idx) => {
        console.log(`   ${idx + 1}. ${r.message}`);
      });
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("\n💥 Fatal error:", e);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });







