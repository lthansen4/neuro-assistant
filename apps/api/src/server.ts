import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import app from './index';

// Load environment variables from .env file (absolute path from project root)
config({ path: '/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env' });

const port = Number(process.env.PORT || 8787);
console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
