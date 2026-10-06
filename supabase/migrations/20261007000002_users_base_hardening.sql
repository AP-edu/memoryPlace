-- Users base table + auth hardening (email uniqueness, role check).
-- The users table predates versioned migrations (only referenced by FK in
-- 20260915154911_password_reset_tokens.sql:5). This file makes fresh
-- databases work and hardens existing ones. Idempotent: safe to re-run.
-- NOTE: onboarded_at is included here for fresh DBs; the later
-- 20261007000001_live_link_onboarded.sql ADD COLUMN IF NOT EXISTS stays
-- harmless on databases that run this file first.

-- 1) Base table (skipped where it already exists, e.g. hosted prod).
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password text not null,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  onboarded_at timestamptz
);

-- 2) Normalize legacy emails (case/whitespace variants) where unambiguous.
-- Rows that would collide after normalization are left untouched so a human
-- can resolve them; the unique index below is then skipped with a notice.
update public.users u
set email = lower(trim(u.email))
where u.email <> lower(trim(u.email))
  and not exists (
    select 1 from public.users v
    where v.id <> u.id
      and lower(trim(v.email)) = lower(trim(u.email))
  );

-- 3) Role check (skipped if violating rows exist — resolve manually).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_role_check'
  ) and not exists (
    select 1 from public.users where role not in ('user', 'admin')
  ) then
    alter table public.users
      add constraint users_role_check check (role in ('user', 'admin'));
  else
    raise notice 'users: skipping role check (already exists or violating rows present)';
  end if;
end $$;

-- 4) Case-insensitive email uniqueness (skipped on duplicates — see step 2).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'users_email_lower_uniq'
  ) and not exists (
    select lower(trim(email)) from public.users
    group by 1 having count(*) > 1
  ) then
    create unique index users_email_lower_uniq
      on public.users (lower(trim(email)));
  else
    raise notice 'users: skipping unique email index (already exists or duplicates present)';
  end if;
end $$;
