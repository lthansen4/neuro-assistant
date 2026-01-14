import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import app from './index';

// Load environment variables
config();

const port = Number(process.env.PORT || 8787);

// Catch fatal errors and log to Railway
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (err: any) => {
  console.error('[FATAL] unhandledRejection:', err);
});

console.log(`[API] Starting on port ${port}...`);
console.log('[API] ENV check:', {
  hasDatabase: !!process.env.DATABASE_URL,
  hasOpenAI: !!process.env.OPENAI_API_KEY,
  hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
});

serve({ fetch: app.fetch, port });
console.log(`[API] Server ready at http://localhost:${port}`);
