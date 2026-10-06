-- Decks go standalone: optional palace link + tags, course_id nullable.
-- Keeps palace = course mental model; unblocks POST /api/decks without
-- resurrecting the courses UI. No data deleted, no courses drop here.
-- Idempotent: safe to re-run (IF NOT EXISTS, guarded FK, conditional backfill).

-- 1) course_id nullable (was required when decks belonged to courses).
-- Harmless if already nullable; fails only if the legacy column is gone,
-- in which case inspect live DDL before proceeding.
alter table public.decks
  alter column course_id drop not null;

-- 2) Optional palace link (standalone decks allowed). SET NULL so deleting
-- a palace never deletes quiz decks (cf. study_sessions.palace_id SET NULL).
alter table public.decks
  add column if not exists palace_id uuid
    references public.palaces (id) on delete set null;

create index if not exists decks_palace_id_idx on public.decks (palace_id);

-- Backfill from the rebuild lineage: course_id values ARE palace ids for
-- surviving decks (see 20260915145542_palace_rebuild.sql:84-89). LEFT-style:
-- orphans stay NULL (standalone), no rows dropped.
update public.decks d
set palace_id = d.course_id
where d.palace_id is null
  and d.course_id is not null
  and exists (select 1 from public.palaces p where p.id = d.course_id);

-- 3) Tags for organization without courses (mirrors loci.tags).
alter table public.decks
  add column if not exists tags text[] not null default '{}';

create index if not exists decks_tags_idx on public.decks using gin (tags);

-- 4) Owner lookup helper (list is owner-scoped in app/api/decks/route.ts).
create index if not exists decks_owner_idx on public.decks (owner);
