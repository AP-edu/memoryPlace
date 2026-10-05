-- Phase D: authored MCQ distractors on cards.
-- options holds up to 3 wrong answers (plain strings). NULL/empty means the
-- quiz auto-derives distractors from sibling cards' answers.
alter table public.cards
  add column if not exists options jsonb;
