import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  console.log('Connecting to Railway Database...');

  const client = new pg.Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  await client.connect();

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Run in order: 0001, 0002, etc.

  console.log(`Found ${files.length} migration files.`);

  try {
    // 1. Create a migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS __manual_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    for (const file of files) {
      // Check if already applied
      const { rows } = await client.query('SELECT 1 FROM __manual_migrations WHERE name = $1', [file]);
      
      if (rows.length > 0) {
        console.log(`⏩ Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`⏳ Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Execute the SQL. Some files might have multiple statements.
      // node-postgres can execute multiple statements in one query call if they are separated by semicolons.
      await client.query(sql);
      
      await client.query('INSERT INTO __manual_migrations (name) VALUES ($1)', [file]);
      console.log(`✅ Applied ${file}`);
    }

    console.log('\n🎉 ALL MIGRATIONS APPLIED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ MIGRATION FAILED!');
    console.error('Error in file:', files.find(f => !f.startsWith('applied'))); // rough estimate
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();




