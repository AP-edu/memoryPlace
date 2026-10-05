-- Cards get a study order within their locus (mirrors loci.position).
-- Backfill keeps the previous implicit order (oldest first per locus).
alter table public.cards
  add column if not exists position integer not null default 0;

with ranked as (
  select id, row_number() over (partition by locus_id order by created_at, id) - 1 as rn
  from public.cards
)
update public.cards c
set position = r.rn
from ranked r
where r.id = c.id;
