import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import app from './index';

// Load environment variables from .env file
// Railway and other platforms provide env vars automatically
config();

const port = Number(process.env.PORT || 8787);
console.log(`API listening on http://localhost:${port}`);

// #region agent log
fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'debug-session',
    runId: 'startup',
    hypothesisId: 'startup',
    location: 'server.ts:start',
    message: 'API starting',
    data: { port },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

// Capture unexpected errors and log to ingest
const logFatal = (type: string, err: any) => {
  const payload = {
    sessionId: 'debug-session',
    runId: 'startup',
    hypothesisId: 'fatal',
    location: `server.ts:${type}`,
    message: `${type}`,
    data: { error: err?.message || String(err) },
    timestamp: Date.now(),
  };
  fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
};

process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err);
  logFatal('uncaughtException', err);
});
process.on('unhandledRejection', (err: any) => {
  console.error('unhandledRejection', err);
  logFatal('unhandledRejection', err);
});

serve({ fetch: app.fetch, port });
