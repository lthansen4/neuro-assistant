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
  },
  {
    name: '0033: Add buffer time tracking (Epic 4)',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_daily_productivity' AND column_name = 'buffer_minutes_earned') THEN
          ALTER TABLE user_daily_productivity ADD COLUMN buffer_minutes_earned INTEGER NOT NULL DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_daily_productivity' AND column_name = 'buffer_minutes_used') THEN
          ALTER TABLE user_daily_productivity ADD COLUMN buffer_minutes_used INTEGER NOT NULL DEFAULT 0;
        END IF;
      END $$;

      COMMENT ON COLUMN user_daily_productivity.buffer_minutes_earned IS 'Total buffer minutes earned today (15 min per focus session, refreshes not stacks)';
      COMMENT ON COLUMN user_daily_productivity.buffer_minutes_used IS 'Buffer minutes redeemed today (expires at midnight)';
    `
  },
  {
    name: '0035: Add alert dismissals table',
    sql: `
      CREATE TABLE IF NOT EXISTS alert_dismissals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alert_id TEXT NOT NULL,
        dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uniq_alert_dismissals_user_alert
        ON alert_dismissals(user_id, alert_id);

      CREATE INDEX IF NOT EXISTS idx_alert_dismissals_user
        ON alert_dismissals(user_id);
    `
  }
];

export async function runMigrations() {
  console.log('🚀 [Internal Migration Runner] Starting...');
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ [Internal Migration Runner] DATABASE_URL environment variable is not set');
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
      } catch (err: any) {
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`   ⏭️  Skipped (already applied)\n`);
        } else {
          console.error(`   ❌ Error: ${err.message}\n`);
        }
      }
    }

    console.log('📋 Verifying migrations...\n');
    const checks = await client.query(`
      SELECT 
        'assignments.total_pages' as item,
        EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'assignments' AND column_name = 'total_pages'
        ) as exists
      UNION ALL
      SELECT
        'alert_dismissals table',
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'alert_dismissals'
        )
    `);

    const allGood = checks.rows.every((row: any) => row.exists);
    if (allGood) {
      console.log('🎉 Migrations verified successfully!');
    } else {
      console.error('❌ Migration verification failed!');
    }

  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

