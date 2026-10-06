-- Live-link room-world <-> deck-world at card grain + server onboarding flag.
-- Idempotent: safe to re-run (IF NOT EXISTS, guarded constraints, partial
-- unique indexes). App uses service-role bypass (lib/supabase.ts), so new
-- columns inherit table RLS/GRANTS; no POLICY/GRANT changes here.

-- 1) cards.source_flashcard_id -> flashcards(id) SET NULL
alter table public.cards
  add column if not exists source_flashcard_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_source_flashcard_id_fkey'
  ) then
    alter table public.cards
      add constraint cards_source_flashcard_id_fkey
      foreign key (source_flashcard_id)
      references public.flashcards (id)
      on delete set null;
  end if;
end $$;

-- 2) flashcards.source_card_id -> cards(id) SET NULL
alter table public.flashcards
  add column if not exists source_card_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.flashcards'::regclass
      and conname = 'flashcards_source_card_id_fkey'
  ) then
    alter table public.flashcards
      add constraint flashcards_source_card_id_fkey
      foreign key (source_card_id)
      references public.cards (id)
      on delete set null;
  end if;
end $$;

-- 3) 1:1 link hygiene: at most one card per flashcard and vice versa.
-- Partial uniques keep the index small and ignore NULLs explicitly.
-- If 1:many is ever wanted, drop one side's index deliberately.
create unique index if not exists cards_source_flashcard_id_uniq
  on public.cards (source_flashcard_id)
  where source_flashcard_id is not null;

create unique index if not exists flashcards_source_card_id_uniq
  on public.flashcards (source_card_id)
  where source_card_id is not null;

-- 4) users.onboarded_at: NULL = never onboarded (matches the
-- localStorage mp.onboarded default in app/home/page.tsx). No backfill:
-- clients set it on next dismiss/complete.
alter table public.users
  add column if not exists onboarded_at timestamptz;
