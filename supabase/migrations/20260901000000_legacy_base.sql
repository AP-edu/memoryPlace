-- Base tables that predate versioned migrations: users, courses, decks,
-- flashcards, quiz_results. The hosted production database already has them
-- (created by hand early on), so every statement is IF NOT EXISTS and this
-- file is a no-op there. On a fresh project it makes the rest of the
-- migrations (which read and alter these tables) run start to finish.
-- Shapes match the live tables as introspected on 2026-10-10; later files
-- add decks.palace_id/tags, drop decks.course_id NOT NULL and add
-- flashcards.source_card_id.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password text not null,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  onboarded_at timestamptz
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course_id uuid not null references public.courses (id) on delete cascade,
  owner uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  deck_id uuid not null references public.decks (id) on delete cascade,
  owner uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  score integer not null,
  total integer not null,
  created_at timestamptz not null default now()
);

create index if not exists flashcards_deck_id_idx on public.flashcards (deck_id);

-- The app reads and writes with the service-role key (bypasses RLS). RLS on
-- with no policies keeps the public Data API from exposing these tables to
-- the anon/publishable key.
alter table public.users enable row level security;
alter table public.courses enable row level security;
alter table public.decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.quiz_results enable row level security;
