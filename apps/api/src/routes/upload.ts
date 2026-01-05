import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';

export const uploadRoute = new Hono();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

uploadRoute.post('/syllabus', async (c) => {
  const form = await c.req.parseBody();
  const file = form['file'] as File | undefined;
  if (!file) return c.json({ error: 'No file' }, 400);
  const path = `syllabi/${crypto.randomUUID()}-${(file as any).name ?? 'syllabus.pdf'}`;
  const { error } = await supabase.storage.from('syllabi').upload(path, await file.arrayBuffer(), {
    contentType: (file as any).type || 'application/pdf',
    upsert: false
  });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ bucket: 'syllabi', path });
});
