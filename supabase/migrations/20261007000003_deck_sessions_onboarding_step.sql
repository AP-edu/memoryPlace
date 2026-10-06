-- Deck practice joins the unified SRS loop: study_sessions can now point at
-- a deck (deck-only quiz sessions have neither room_id nor palace_id).
-- SET NULL so deleting a deck never deletes session history.
-- Idempotent: safe to re-run.
alter table public.study_sessions
  add column if not exists deck_id uuid
    references public.decks (id) on delete set null;

create index if not exists study_sessions_deck_id_idx
  on public.study_sessions (deck_id);

-- Onboarding progress beyond the done flag (which step the guided overlay
-- is on), so it resumes across devices. NULL = start from step 0.
alter table public.users
  add column if not exists onboarding_step integer;
