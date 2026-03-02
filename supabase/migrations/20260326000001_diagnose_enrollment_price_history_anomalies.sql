-- Read-only diagnostics for enrollment_price_history integrity.
-- This script does NOT modify data.
--
-- Checks:
-- 1) inverted/invalid intervals (effective_to <= effective_from)
-- 2) duplicate starts (same enrollment_id + effective_from)
-- 3) overlapping intervals for the same enrollment_id
-- 4) history starts after enrollment start (possible missing baseline)

-- 1) Invalid intervals: end must be strictly greater than start
select
  h.id,
  h.enrollment_id,
  h.effective_from,
  h.effective_to,
  h.custom_price,
  h.discount_percent,
  h.created_at
from public.enrollment_price_history h
where h.effective_to is not null
  and h.effective_to <= h.effective_from
order by h.enrollment_id, h.effective_from, h.created_at;

-- 2) Duplicate starts for the same enrollment
select
  h.enrollment_id,
  h.effective_from,
  count(*) as rows_count,
  array_agg(h.id order by h.created_at asc) as row_ids
from public.enrollment_price_history h
group by h.enrollment_id, h.effective_from
having count(*) > 1
order by rows_count desc, h.enrollment_id, h.effective_from;

-- 3) Overlapping intervals (using [from, to) model)
with norm as (
  select
    h.id,
    h.enrollment_id,
    h.effective_from::date as from_d,
    coalesce(h.effective_to::date, 'infinity'::date) as to_d
  from public.enrollment_price_history h
),
valid_norm as (
  -- Keep only valid intervals for overlap check.
  -- Invalid rows are already returned by check #1 above.
  select *
  from norm
  where to_d > from_d
),
pairs as (
  select
    a.enrollment_id,
    a.id as id_a,
    a.from_d as from_a,
    a.to_d as to_a,
    b.id as id_b,
    b.from_d as from_b,
    b.to_d as to_b
  from valid_norm a
  join valid_norm b
    on a.enrollment_id = b.enrollment_id
   and a.id < b.id
)
select
  p.enrollment_id,
  p.id_a,
  p.from_a,
  nullif(p.to_a, 'infinity'::date) as to_a,
  p.id_b,
  p.from_b,
  nullif(p.to_b, 'infinity'::date) as to_b
from pairs p
where daterange(p.from_a, p.to_a, '[)') && daterange(p.from_b, p.to_b, '[)')
order by p.enrollment_id, p.from_a, p.from_b;

-- 4) Missing baseline coverage: first history starts after enrollment start
with first_history as (
  select distinct on (h.enrollment_id)
    h.enrollment_id,
    h.effective_from::date as first_from
  from public.enrollment_price_history h
  order by h.enrollment_id, h.effective_from asc, h.created_at asc
),
enrollment_start as (
  select
    e.id as enrollment_id,
    coalesce(e.effective_from::date, e.enrolled_at::date) as baseline_from
  from public.enrollments e
)
select
  es.enrollment_id,
  es.baseline_from,
  fh.first_from
from enrollment_start es
join first_history fh on fh.enrollment_id = es.enrollment_id
where es.baseline_from is not null
  and es.baseline_from < fh.first_from
order by es.enrollment_id;

