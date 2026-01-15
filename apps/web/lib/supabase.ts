import { createClient } from '@supabase/supabase-js';

// Client-side Supabase client for realtime subscriptions
// Uses anon key (public) - RLS policies will enforce security
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);




