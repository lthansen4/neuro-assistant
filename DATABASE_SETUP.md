# Database Setup Instructions

## Getting Your Supabase Connection String

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **Database**
4. Scroll down to **Connection string**
5. Select **URI** tab
6. Copy the connection string - it should look like:
   ```
   postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
   OR for direct connection:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

## Common Issues

### Port 5432 vs 6543
- **5432**: Direct connection (recommended for migrations and scripts)
- **6543**: Connection pooler (better for serverless/edge functions)

### Connection String Format
Make sure your connection string includes:
- Correct project reference
- Correct password
- Correct port (5432 for direct, 6543 for pooler)
- Correct hostname format

## Update Your .env File

Once you have the correct connection string, update your `.env` file:

```bash
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[CORRECT-HOSTNAME]:[PORT]/postgres
DRIZZLE_DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[CORRECT-HOSTNAME]:[PORT]/postgres
```

## After Updating .env

1. **Apply migrations manually** (recommended):
   - Go to Supabase SQL Editor
   - Copy contents of `packages/db/migrations/0001_unified.sql`
   - Paste and run in SQL Editor

2. **OR use Drizzle push** (if connection works):
   ```bash
   npm run db:push -w @neuro/db
   ```

3. **Run seed script**:
   ```bash
   npm run seed
   ```




