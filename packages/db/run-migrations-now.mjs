#!/usr/bin/env node
// Triggering redeploy for migration fix - v4 (Semicolon fix)
/**
 * Quick migration runner for Railway
 * 
 * Usage:
 *   DATABASE_URL="your-railway-postgres-url" node packages/db/run-migrations-now.mjs
 * 
 * Or copy your DATABASE_URL from Railway and run:
 *   export DATABASE_URL="postgresql://..."
 *   node packages/db/run-migrations-now.mjs
 */

import pg from 'pg';

const migrations = [
  {
    name: '0029: Add description to assignments',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'assignments' AND column_name = 'description'
        ) THEN
          ALTER TABLE assignments ADD COLUMN description TEXT;
          RAISE NOTICE 'Added description column to assignments';
        END IF;
      END $$;
    `
  },
  {
    name: '0030: Add description to calendar_events_new',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'calendar_events_new' AND column_name = 'description'
        ) THEN
          ALTER TABLE calendar_events_new ADD COLUMN description TEXT;
          RAISE NOTICE 'Added description column to calendar_events_new';
        END IF;
      END $$;
    `
  },
  {
    name: '0031: Create assignment_time_logs table',
    sql: `
      CREATE TABLE IF NOT EXISTS assignment_time_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        category TEXT,
        estimated_minutes INTEGER,
        actual_minutes INTEGER NOT NULL,
        accuracy_ratio NUMERIC(5,2),
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    name: '0031b: Create indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_time_logs_user ON assignment_time_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_time_logs_user_category ON assignment_time_logs(user_id, category);
      CREATE INDEX IF NOT EXISTS idx_time_logs_user_course ON assignment_time_logs(user_id, course_id);
      CREATE INDEX IF NOT EXISTS idx_time_logs_completed ON assignment_time_logs(completed_at DESC);
    `
  },
  {
    name: '0031c: Create accuracy trigger',
    sql: `
      CREATE OR REPLACE FUNCTION calculate_accuracy_ratio()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.estimated_minutes IS NOT NULL AND NEW.estimated_minutes > 0 THEN
          NEW.accuracy_ratio := ROUND((NEW.actual_minutes::NUMERIC / NEW.estimated_minutes::NUMERIC), 2);
        ELSE
          NEW.accuracy_ratio := NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_calculate_accuracy_ratio ON assignment_time_logs;
      CREATE TRIGGER trg_calculate_accuracy_ratio
      BEFORE INSERT OR UPDATE ON assignment_time_logs
      FOR EACH ROW
      EXECUTE FUNCTION calculate_accuracy_ratio();
    `
  },
  {
    name: '0032: Add reading tracking to assignments (Robust)',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'total_pages') THEN
          ALTER TABLE assignments ADD COLUMN total_pages INTEGER;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'pages_completed') THEN
          ALTER TABLE assignments ADD COLUMN pages_completed INTEGER;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'last_deferred_at') THEN
          ALTER TABLE assignments ADD COLUMN last_deferred_at TIMESTAMPTZ;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'reading_questions') THEN
          ALTER TABLE assignments ADD COLUMN reading_questions JSONB DEFAULT '[]'::jsonb;
        END IF;
      END $$;

      COMMENT ON COLUMN assignments.total_pages IS 'Total number of pages in the reading assignment';
      COMMENT ON COLUMN assignments.pages_completed IS 'Number of pages student has finished';
      COMMENT ON COLUMN assignments.last_deferred_at IS 'When this assignment was last deferred';
      COMMENT ON COLUMN assignments.reading_questions IS 'Array of [{text: string, createdAt: string}] questions for the professor';
    `
  }
];

export async function run() {
  console.log('🚀 [Migration Runner] Starting...');
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ [Migration Runner] DATABASE_URL environment variable is not set');
    return;
  }

  // Mask URL for logging
  const host = connectionString.split('@')[1]?.split('/')[0] || 'unknown';
  console.log(`🔌 Connecting to: ${host}`);

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    for (const migration of migrations) {
      console.log(`📦 Running: ${migration.name}`);
      try {
        await client.query(migration.sql);
        console.log(`   ✅ Success\n`);
      } catch (err) {
        // Some errors are OK (like "already exists")
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`   ⏭️  Skipped (already applied)\n`);
        } else {
          console.error(`   ❌ Error: ${err.message}\n`);
        }
      }
    }

    // Verify
    console.log('📋 Verifying migrations...\n');
    
    const checks = await client.query(`
      SELECT 
        'assignments.description' as item,
        EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'assignments' AND column_name = 'description'
        ) as exists
      UNION ALL
      SELECT 
        'calendar_events_new.description',
        EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'calendar_events_new' AND column_name = 'description'
        )
      UNION ALL
      SELECT 
        'assignment_time_logs table',
        EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'assignment_time_logs'
        )
      UNION ALL
      SELECT 
        'assignments.total_pages',
        EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'assignments' AND column_name = 'total_pages'
        )
      UNION ALL
      SELECT 
        'assignments.last_deferred_at',
        EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'assignments' AND column_name = 'last_deferred_at'
        )
    `);

    let allGood = true;
    for (const row of checks.rows) {
      const status = row.exists ? '✅' : '❌';
      console.log(`   ${status} ${row.item}`);
      if (!row.exists) allGood = false;
    }

    console.log('');
    if (allGood) {
      console.log('🎉 All migrations applied successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Redeploy the API service on Railway');
      console.log('2. The app should now work with description fields');
      process.exit(0);
    } else {
      console.log('⚠️  Some migrations may have failed. Check errors above.');
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore end errors
    }
  }
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    console.error('Unhandled error in migration runner:', err);
    process.exit(1);
  });
}


