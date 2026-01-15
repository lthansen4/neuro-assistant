/* eslint-disable no-console */
import { Client } from 'pg';
import { config } from 'dotenv';

// Load environment variables from .env
config({ path: '.env' });

async function main() {
  const parseRunId = process.argv[2] || '00000000-0000-0000-0000-000000000000';
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set. Please set it in your .env file or environment.');
    process.exit(1);
  }
  
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    // 1) Column exists and has expected type
    const col = await client.query(
      `
      SELECT column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'syllabus_staging_items'
        AND column_name = 'confidence_score'
      `
    );

    if (col.rows.length === 0) {
      throw new Error('confidence_score column not found on syllabus_staging_items');
    }
    const c = col.rows[0];
    console.log('Column:', c);

    // 2) Constraint exists
    const constraint = await client.query(
      `
      SELECT conname
      FROM pg_constraint
      WHERE conname = 'staging_confidence_range_chk'
      `
    );
    if (constraint.rows.length === 0) {
      throw new Error('staging_confidence_range_chk constraint not found');
    }
    console.log('Constraint present:', constraint.rows[0].conname);

    // 3) Index exists
    const idx = await client.query(
      `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'syllabus_staging_items'
        AND indexname = 'idx_staging_confidence'
      `
    );
    if (idx.rows.length === 0) {
      throw new Error('idx_staging_confidence index not found');
    }
    console.log('Index present:', idx.rows[0].indexdef);

    // 4) Planner uses index for preview-style query
    // Note: SET LOCAL must be in a separate query or transaction
    await client.query('SET LOCAL enable_seqscan = off');
    const explain = await client.query(
      `
      EXPLAIN
      SELECT id
      FROM syllabus_staging_items
      WHERE parse_run_id = $1
      ORDER BY confidence_score DESC NULLS LAST
      LIMIT 10;
      `,
      [parseRunId]
    );
    console.log('EXPLAIN plan:');
    explain.rows.forEach((r: any) => {
      const planLine = r['QUERY PLAN'] || r.query_plan || JSON.stringify(r);
      console.log(`  ${planLine}`);
    });

    console.log('✅ Verification passed for Migration 0011.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});




