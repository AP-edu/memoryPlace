-- MemoryPlace palace rebuild (additive, idempotent).
-- New spatial model alongside the legacy courses/decks/flashcards/quiz_results
-- tables. Ids are reused from legacy rows so backfill is traceable and stable.
-- Safe to re-run: every backfill uses ON CONFLICT DO NOTHING.
-- NOTE: the app still uses the service-role key (bypasses RLS). The RLS
-- policies below only take effect for future Supabase Auth (anon/authenticated)
-- usage during the Phase-2 auth cutover.

-- ---------------------------------------------------------------- palaces
create table if not exists public.palaces (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  description text,
  theme jsonb not null default '{}'::jsonb,
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public')),
  created_at timestamptz not null default now()
);
create index if not exists palaces_user_id_idx on public.palaces (user_id);

-- ---------------------------------------------------------------- rooms
create table if not exists public.rooms (
  id uuid primary key,
  palace_id uuid not null references public.palaces (id) on delete cascade,
  user_id uuid not null,
  title text not null,
  background text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rooms_palace_id_idx on public.rooms (palace_id);
create index if not exists rooms_user_id_idx on public.rooms (user_id);

-- ---------------------------------------------------------------- loci
create table if not exists public.loci (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision,
  label text not null default '',
  tags text[] not null default '{}',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists loci_room_id_idx on public.loci (room_id);
create index if not exists loci_tags_idx on public.loci using gin (tags);

-- ---------------------------------------------------------------- cards
create table if not exists public.cards (
  id uuid primary key,
  locus_id uuid not null references public.loci (id) on delete cascade,
  user_id uuid not null,
  type text not null default 'basic' check (type in ('basic', 'cloze', 'image', 'audio')),
  front jsonb not null default '{}'::jsonb,
  back jsonb not null default '{}'::jsonb,
  media_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cards_locus_id_idx on public.cards (locus_id);
create index if not exists cards_user_id_idx on public.cards (user_id);

-- ---------------------------------------------------------------- study sessions
create table if not exists public.study_sessions (
  id uuid primary key,
  user_id uuid not null,
  palace_id uuid references public.palaces (id) on delete set null,
  room_id uuid references public.rooms (id) on delete set null,
  scope jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists study_sessions_user_id_idx on public.study_sessions (user_id);
create index if not exists study_sessions_room_id_idx on public.study_sessions (room_id);

-- ---------------------------------------------------------------- backfill
-- courses -> palaces (same ids)
insert into public.palaces (id, user_id, title, description, theme, visibility, created_at)
select c.id, c.owner, c.title, c.description, '{}'::jsonb, 'private', c.created_at
from public.courses c
on conflict (id) do nothing;

-- decks -> rooms (same ids)
insert into public.rooms (id, palace_id, user_id, title, background, metadata, created_at)
select d.id, d.course_id, d.owner, d.title, null, '{}'::jsonb, d.created_at
from public.decks d
join public.palaces p on p.id = d.course_id
on conflict (id) do nothing;

-- one default locus per room for pre-existing rooms (deterministic id per room
-- so re-runs stay idempotent even though loci ids are normally generated).
-- md5 hex has no dashes, so reformat to uuid shape 8-4-4-4-12.
insert into public.loci (id, room_id, x, y, label, tags, position, created_at)
select (
    substring(h from 1 for 8) || '-' || substring(h from 9 for 4) || '-' ||
    substring(h from 13 for 4) || '-' || substring(h from 17 for 4) || '-' ||
    substring(h from 21 for 12)
  )::uuid, r.id, 0, 0, 'Entrance', '{}', 0, r.created_at
from public.rooms r
cross join lateral (select md5('default-locus:' || r.id::text) as h) m
on conflict (id) do nothing;

-- flashcards -> cards (same ids, question/answer wrapped as rich-text json)
insert into public.cards (id, locus_id, user_id, type, front, back, media_refs, created_at)
select f.id, (
    substring(h from 1 for 8) || '-' || substring(h from 9 for 4) || '-' ||
    substring(h from 13 for 4) || '-' || substring(h from 17 for 4) || '-' ||
    substring(h from 21 for 12)
  )::uuid, f.owner, 'basic',
  jsonb_build_object('text', f.question),
  jsonb_build_object('text', f.answer),
  '[]'::jsonb, f.created_at
from public.flashcards f
join public.rooms r on r.id = f.deck_id
cross join lateral (select md5('default-locus:' || f.deck_id::text) as h) m
on conflict (id) do nothing;

-- quiz_results -> study_sessions (same ids)
insert into public.study_sessions (id, user_id, palace_id, room_id, scope, results, created_at)
select q.id, q.user_id, d.course_id, q.deck_id,
  jsonb_build_object('room_id', q.deck_id),
  jsonb_build_object('score', q.score, 'total', q.total),
  q.created_at
from public.quiz_results q
join public.decks d on d.id = q.deck_id
on conflict (id) do nothing;

-- ---------------------------------------------------------------- RLS (future Supabase Auth; service-role bypasses)
alter table public.palaces enable row level security;
alter table public.rooms enable row level security;
alter table public.loci enable row level security;
alter table public.cards enable row level security;
alter table public.study_sessions enable row level security;

grant all on public.palaces to authenticated;
grant all on public.rooms to authenticated;
grant all on public.loci to authenticated;
grant all on public.cards to authenticated;
grant all on public.study_sessions to authenticated;

-- owners manage their own rows (auth.uid() matches user_id after cutover).
-- (CREATE POLICY has no IF NOT EXISTS, so drop-then-create for idempotence.)
drop policy if exists palaces_owner_all on public.palaces;
create policy palaces_owner_all on public.palaces
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists rooms_owner_all on public.rooms;
create policy rooms_owner_all on public.rooms
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cards_owner_all on public.cards;
create policy cards_owner_all on public.cards
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists study_sessions_owner_all on public.study_sessions;
create policy study_sessions_owner_all on public.study_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- loci inherit access from their parent room
drop policy if exists loci_parent_owner_all on public.loci;
create policy loci_parent_owner_all on public.loci
  for all to authenticated
  using (exists (select 1 from public.rooms r where r.id = loci.room_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.rooms r where r.id = loci.room_id and r.user_id = auth.uid()));
