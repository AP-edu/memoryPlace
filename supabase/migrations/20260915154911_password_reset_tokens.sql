-- One-time password reset tokens for the credentials auth flow.
-- Tokens are stored as SHA-256 hashes; only the hash ever touches the DB.
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_id_idx on public.password_reset_tokens (user_id);

alter table public.password_reset_tokens enable row level security;
-- No authenticated-role policies: reset tokens are only ever touched
-- server-side with the service-role key. Enabling RLS with zero policies
-- denies all anon/authenticated access by default.
