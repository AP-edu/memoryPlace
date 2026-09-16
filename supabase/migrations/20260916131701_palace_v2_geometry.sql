-- MemoryPlace palace model v2 (additive, idempotent).
-- Rooms get rect geometry; loci get wall anchoring; new openings + card_reviews
-- tables feed the 2D blueprint builder (Phase B), spatial quiz/due engine (C/D),
-- and the first-person walk (F).
--
-- GEOMETRY CONVENTION (single source of truth for builder + 3D):
--   World: y-up. A room spans x in [0,width], z in [0,depth], y in [0,height].
--   Top-down 2D floorplan renders (x -> right, z -> down).
--   Walls: north (z = depth), south (z = 0), east (x = width), west (x = 0).
--   Loci anchor: wall + wall_offset (0..1, relative along the wall from its
--   start corner, so room resizes don't orphan them) + height (absolute units).
--   `position` remains the canonical spatial traversal order everywhere.

-- -------------------------------------------------- rooms: rect geometry
alter table public.rooms
  add column if not exists width double precision not null default 10,
  add column if not exists depth double precision not null default 8,
  add column if not exists height double precision not null default 3;

-- -------------------------------------------------- loci: wall anchoring
alter table public.loci
  add column if not exists wall text,
  add column if not exists wall_offset double precision,
  add column if not exists height double precision;

-- Check constraint on `wall` (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.loci'::regclass and conname = 'loci_wall_check'
  ) then
    alter table public.loci
      add constraint loci_wall_check check (wall in ('north', 'south', 'east', 'west'));
  end if;
end
$$;

-- Backfill legacy loci onto the north wall; idempotent (only nulls).
update public.loci
  set wall = 'north', wall_offset = 0, height = 1.5
  where wall is null;

-- -------------------------------------------------- openings (doors/archways)
create table if not exists public.openings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  wall text not null check (wall in ('north', 'south', 'east', 'west')),
  wall_offset double precision not null default 0.5,
  width double precision not null default 0.2,
  kind text not null default 'door' check (kind in ('door', 'archway')),
  created_at timestamptz not null default now()
);
create index if not exists openings_room_id_idx on public.openings (room_id);

-- -------------------------------------------------- card reviews (SRS state)
create table if not exists public.card_reviews (
  card_id uuid primary key references public.cards (id) on delete cascade,
  user_id uuid not null,
  ease double precision not null default 2.5,
  interval_days integer not null default 0,
  due_at timestamptz not null default now(),
  last_grade integer,
  reviews_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_reviews_user_id_idx on public.card_reviews (user_id);
create index if not exists card_reviews_due_idx on public.card_reviews (due_at);

-- -------------------------------------------------- RLS (service-role bypasses; applies on future Supabase Auth cutover)
alter table public.openings enable row level security;
alter table public.card_reviews enable row level security;

grant all on public.openings to authenticated;
grant all on public.card_reviews to authenticated;

drop policy if exists openings_parent_owner_all on public.openings;
create policy openings_parent_owner_all on public.openings
  for all to authenticated
  using (exists (select 1 from public.rooms r where r.id = openings.room_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.rooms r where r.id = openings.room_id and r.user_id = auth.uid()));

drop policy if exists card_reviews_owner_all on public.card_reviews;
create policy card_reviews_owner_all on public.card_reviews
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());