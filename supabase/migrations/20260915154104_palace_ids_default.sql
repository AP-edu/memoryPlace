-- App-created rows need generated ids (the rebuild migration only covered
-- backfilled rows, which reuse legacy ids).
alter table public.palaces alter column id set default gen_random_uuid();
alter table public.rooms alter column id set default gen_random_uuid();
alter table public.cards alter column id set default gen_random_uuid();
alter table public.study_sessions alter column id set default gen_random_uuid();
