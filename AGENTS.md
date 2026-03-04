# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

Gesso is a Turborepo monorepo with npm workspaces:

| Service | Path | Port | Command |
|---------|------|------|---------|
| API (Hono) | `apps/api` | 8787 | `npm run dev -w @gesso/api` |
| Web (Next.js 14) | `apps/web` | 3000 | `npm run dev -w @gesso/web` |
| DB schema | `packages/db` | — | Shared Drizzle ORM schema |

Or start both with `npm run dev` (uses Turborepo).

### Local PostgreSQL

A local PostgreSQL 16 instance is used instead of Supabase. Connection string is in `.env`, `apps/api/.env`, and `apps/web/.env.local`:

```
postgresql://gesso:gesso_dev_password@localhost:5432/gesso_dev
```

Start PostgreSQL if not running: `sudo pg_ctlcluster 16 main start`

### Database migrations

SQL migration files are in `packages/db/migrations/` (0001–0035). Run them in order with `psql`:

```bash
PGPASSWORD=gesso_dev_password psql -h localhost -U gesso -d gesso_dev -f packages/db/migrations/<file>.sql
```

Additional migrations (0033 homework progress, 0034 professor questions) from `packages/db/run-migrations-now.mjs` are not duplicated as SQL files; they were applied during initial setup.

### Gotchas

- **Clerk auth**: The web frontend requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` for page rendering. Without it, the Clerk middleware returns 500 on all routes. The layout has a graceful fallback, but middleware blocks first. API endpoints do not require Clerk — they accept a bare `x-clerk-user-id` header for user identification.
- **API `ssl` setting**: `apps/api/src/lib/db.ts` hardcodes `ssl: { rejectUnauthorized: false }` on the pg Pool. This works with local PostgreSQL (falls back to non-SSL) but is worth knowing.
- **Lint**: Only `@gesso/web` has a lint script, and it's a no-op (`echo "(no lint configured)"`).
- **Build**: `npm run build -w @gesso/api` runs `tsc`. `npm run build -w @gesso/web` runs `next build`. Both succeed cleanly.
- **Next.js SWC warning**: On first start, Next.js may log a "Failed to patch lockfile" warning related to `packageManager` field. This is cosmetic and does not affect functionality.
