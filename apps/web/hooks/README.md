# Dashboard Realtime Hook

## Overview

The `useDashboardRealtime` hook provides real-time updates for the dashboard via Supabase Realtime subscriptions. It automatically subscribes to changes in:
- `assignments` table
- `user_streaks` table  
- `sessions` table (optional)

## Setup

### 1. Environment Variables

Ensure these are set in your `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Supabase Realtime Configuration

Enable Realtime for the following tables in Supabase:
- `assignments`
- `user_streaks`
- `sessions` (optional)

In Supabase Dashboard:
1. Go to Database → Replication
2. Enable replication for each table
3. Ensure RLS policies allow the current user to read their own data

### 3. RLS Policies

The hook queries the `users` table to resolve Clerk user IDs to database UUIDs. Ensure you have an RLS policy like:

```sql
-- Allow users to read their own user record by clerk_user_id
CREATE POLICY "Users can read own record by clerk_id"
ON users FOR SELECT
USING (auth.uid()::text = clerk_user_id OR clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');
```

Or use a service role key for the lookup (less secure but simpler for MVP).

## Usage

### Basic Example (with callbacks)

```tsx
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { fetchDashboardSummary } from '@/lib/api';

export default function DashboardPage() {
  const { user } = useUser();
  const [data, setData] = useState(null);

  const refetchDashboard = async () => {
    if (user) {
      const summary = await fetchDashboardSummary(user.id, 'week');
      setData(summary);
    }
  };

  // Set up realtime subscriptions
  useDashboardRealtime({
    userId: user?.id || '', // Clerk user ID
    onAssignmentsChange: refetchDashboard,
    onStreaksChange: refetchDashboard,
    enabled: !!user
  });

  // ... rest of component
}
```

### With React Query (Alternative)

If you install `@tanstack/react-query`, use `useDashboardRealtimeWithReactQuery` instead:

```tsx
import { useDashboardRealtimeWithReactQuery } from '@/hooks/useDashboardRealtimeWithReactQuery';

useDashboardRealtimeWithReactQuery({
  userId: dbUserId, // Database UUID (not Clerk ID)
  enabled: !!dbUserId
});
```

## Important Notes

1. **User ID Resolution**: The hook automatically resolves Clerk user IDs to database UUIDs by querying the `users` table. This requires proper RLS policies.

2. **Database User ID**: Supabase Realtime filters require database UUIDs, not Clerk IDs. The hook handles this conversion automatically.

3. **Channel Cleanup**: The hook automatically cleans up subscriptions on unmount.

4. **Error Handling**: The hook logs warnings if it cannot resolve the database user ID, but continues to work if the userId is already a UUID.

## Troubleshooting

- **No updates received**: Check that Realtime is enabled for the tables in Supabase Dashboard
- **RLS policy errors**: Ensure your RLS policies allow reading the `users` table by `clerk_user_id`
- **Subscription not connecting**: Check browser console for connection errors and verify your Supabase URL and anon key are correct




