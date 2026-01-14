import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import app from './index';

// Load environment variables from .env file
// Railway and other platforms provide env vars automatically
config();

const port = Number(process.env.PORT || 8787);
console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
