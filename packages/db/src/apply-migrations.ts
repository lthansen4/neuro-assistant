import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  console.log('Connecting to:', connectionString.split('@')[1]); // Log host only for safety

  const pool = new pg.Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  const db = drizzle(pool);

  console.log('Applying migrations...');
  
  try {
    await migrate(db, { 
      migrationsFolder: path.join(__dirname, '../migrations') 
    });
    console.log('✅ Migrations applied successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();





