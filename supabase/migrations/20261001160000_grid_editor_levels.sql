-- Grid editor v1: levels, room placement on a level grid, linked openings,
-- absolute opening widths, palace grid settings.
-- Additive and idempotent: safe to re-run (IF NOT EXISTS everywhere, guarded
-- constraints, backfills only touch rows that still need them).
--
-- Coordinate convention (see AGENTS.md "Geometry convention"):
--   World y-up, metres. On a level, a room's min corner is (pos_x, pos_z) and
--   it spans x in [pos_x, pos_x + width], z in [pos_z, pos_z + depth].
--   North = +z and is drawn at the TOP of every 2D view.
--   Walls: north (z = depth), south (z = 0), east (x = width), west (x = 0),
--   all room-local. wall_offset stays 0..1 from the wall's start corner
--   (west end for north/south, south end for east/west).
--   Openings: width_m is the authoritative opening width in metres. The legacy
--   `width` column is the same width as a fraction (0..1) of the wall length at
--   the time it was written; readers should prefer width_m (lib/geometry.ts
--   openingWidthM falls back to width * wallLength when width_m is null).
--
-- Polygon rooms are future work: rooms.outline (nullable jsonb, list of
-- {x, z} room-local vertices) is reserved and unused in v1. When null the
-- room is the width x depth rectangle.

-- -------------------------------------------------- palaces: grid settings
alter table public.palaces
  add column if not exists grid_snap double precision not null default 0.5,
  add column if not exists unit text not null default 'm';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.palaces'::regclass and conname = 'palaces_grid_snap_check') then
    alter table public.palaces
      add constraint palaces_grid_snap_check check (grid_snap > 0 and grid_snap <= 10);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.palaces'::regclass and conname = 'palaces_unit_check') then
    alter table public.palaces add constraint palaces_unit_check check (unit in ('m'));
  end if;
end $$;

-- -------------------------------------------------- levels
create table if not exists public.levels (
  id uuid primary key default gen_random_uuid(),
  palace_id uuid not null references public.palaces (id) on delete cascade,
  idx integer not null default 0,
  name text not null default 'Level',
  elevation double precision not null default 0,
  default_height double precision not null default 3,
  created_at timestamptz not null default now()
);
create index if not exists levels_palace_id_idx on public.levels (palace_id, idx);

-- -------------------------------------------------- rooms: placement on a level
alter table public.rooms
  add column if not exists level_id uuid references public.levels (id) on delete set null,
  add column if not exists pos_x double precision not null default 0,
  add column if not exists pos_z double precision not null default 0,
  add column if not exists rotation integer not null default 0,
  add column if not exists outline jsonb;
create index if not exists rooms_level_id_idx on public.rooms (level_id);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.rooms'::regclass and conname = 'rooms_rotation_check') then
    alter table public.rooms add constraint rooms_rotation_check check (rotation in (0, 90, 180, 270));
  end if;
end $$;

-- -------------------------------------------------- openings: links + metres
alter table public.openings
  add column if not exists target_room_id uuid references public.rooms (id) on delete set null,
  add column if not exists width_m double precision;
create index if not exists openings_target_room_id_idx on public.openings (target_room_id);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.openings'::regclass and conname = 'openings_width_m_check') then
    alter table public.openings add constraint openings_width_m_check check (width_m is null or width_m > 0);
  end if;
end $$;

-- -------------------------------------------------- backfill
-- 1) One 'Ground' level (idx 0) for every palace that has no level yet.
insert into public.levels (palace_id, idx, name, elevation, default_height)
select p.id, 0, 'Ground', 0, 3
from public.palaces p
where not exists (select 1 from public.levels l where l.palace_id = p.id);

-- 2) Unassigned rooms go onto their palace's lowest level, laid out
--    left-to-right (by created_at) with 1 m gaps, starting 1 m to the right of
--    anything already placed on that level (0 if the level is empty).
with target as (
  select distinct on (l.palace_id) l.palace_id, l.id as level_id
  from public.levels l
  order by l.palace_id, l.idx, l.created_at
),
base as (
  select t.palace_id, t.level_id,
         coalesce(max(r.pos_x + r.width) + 1, 0) as start_x
  from target t
  left join public.rooms r on r.level_id = t.level_id
  group by t.palace_id, t.level_id
),
pending as (
  select r.id, b.level_id,
         b.start_x + coalesce(sum(r.width + 1) over (
           partition by r.palace_id order by r.created_at, r.id
           rows between unbounded preceding and 1 preceding), 0) as new_x
  from public.rooms r
  join base b on b.palace_id = r.palace_id
  where r.level_id is null
)
update public.rooms r
set level_id = p.level_id, pos_x = p.new_x, pos_z = 0
from pending p
where r.id = p.id;

-- 3) Absolute opening widths from the legacy fraction-of-wall widths.
update public.openings o
set width_m = round((o.width * case when o.wall in ('north', 'south') then r.width else r.depth end)::numeric, 3)
from public.rooms r
where r.id = o.room_id and o.width_m is null;

-- -------------------------------------------------- RLS (service-role bypasses; API enforces ownership)
alter table public.levels enable row level security;
grant all on public.levels to authenticated;

drop policy if exists levels_parent_owner_all on public.levels;
create policy levels_parent_owner_all on public.levels
  for all to authenticated
  using (exists (select 1 from public.palaces p where p.id = levels.palace_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.palaces p where p.id = levels.palace_id and p.user_id = auth.uid()));
