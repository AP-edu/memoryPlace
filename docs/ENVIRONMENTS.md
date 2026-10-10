# Environments: production vs testing

Two Supabase projects (both free), so testing never touches real users' data.

| | Supabase project | Used by |
|---|---|---|
| **Production** | the existing one ("Memory PALce") | Vercel **Production** (https://memoryplace-app.vercel.app) |
| **Testing** | a new free project, e.g. `memoryplace-dev` | `.env.local` (local dev, `npm run livecheck`) and Vercel **Preview** deployments (one per PR) |

`supabase/migrations` builds the whole schema from empty (checked 2026-10-10:
a fresh database matched production table for table, column for column, and
passed the full live check 45/45).

## Set up the testing project

1. **Create it.** supabase.com → New project → name `memoryplace-dev`, same
   organisation and region as production. Save the database password.
2. **Build the schema** from the repo root, with the new project's direct
   connection string (Project → Connect):

   ```bash
   supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
   ```

   Use `--db-url`, not `supabase link`: this repo is linked to production,
   and `db push` without `--db-url` would target it.
3. **Point local dev at it.** Project Settings → API Keys. In `.env.local`
   replace `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   and `SUPABASE_JWKS_URL` with the testing project's values. Keep the
   production values in a password manager, not in the repo.
4. **Scope Vercel's variables** (Project → Settings → Environment Variables):
   - The existing `SUPABASE_*` values (production): tick **Production** only.
   - Add the same names with the testing values: tick **Preview** (and
     **Development**).
   - `NEXTAUTH_URL`: **Production** only (`https://memoryplace-app.vercel.app`).
     Previews work it out from `VERCEL_URL`.
   - `NEXTAUTH_SECRET`: optionally a different value for Preview.
5. **Redeploy** a preview (any PR) and check it signs up into the testing
   project, not production.

## Notes

- Free Supabase projects pause after a week with no activity. The testing
  one will pause between work sessions; un-pause it in the dashboard. If the
  beta goes quiet for a week, production pauses too.
- New migrations: test them on the testing project first
  (`supabase db push --db-url ...`), then apply to production the same way
  with production's connection string.
- Password reset email needs `RESEND_API_KEY` + `EMAIL_FROM` on a verified
  domain (`lib/mailer.ts`). Without them the site says reset isn't available.
