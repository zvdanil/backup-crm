-- Step 7 diagnostics for enrollment price history.
-- Read-only checks: duplicates, invalid intervals, overlaps, and baseline gaps.

-- 1) Duplicate starts (should be empty)
select
  enrollment_id,
  effective_from,
  count(*) as cnt
from public.enrollment_price_history
group by enrollment_id, effective_from
having count(*) > 1
order by cnt desc, enrollment_id, effective_from;

-- 2) Invalid intervals (effective_to must be null or > effective_from)
select
  id,
  enrollment_id,
  effective_from,
  effective_to,
  custom_price,
  discount_percent,
  created_at
from public.enrollment_price_history
where effective_to is not null
  and effective_to <= effective_from
order by enrollment_id, effective_from, created_at;

-- 3) Overlapping intervals for same enrollment (should be empty)
with valid_norm as (
  select
    id,
    enrollment_id,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') as dr
  from public.enrollment_price_history
  where effective_to is null or effective_to > effective_from
)
select
  a.enrollment_id,
  a.id as id_a,
  lower(a.dr) as from_a,
  upper(a.dr) as to_a,
  b.id as id_b,
  lower(b.dr) as from_b,
  upper(b.dr) as to_b
from valid_norm a
join valid_norm b
  on a.enrollment_id = b.enrollment_id
 and a.id < b.id
 and a.dr && b.dr
order by a.enrollment_id, from_a, from_b;

-- 4) Optional: missing baseline vs enrollment start
with first_history as (
  select enrollment_id, min(effective_from) as first_from
  from public.enrollment_price_history
  group by enrollment_id
)
select
  e.id as enrollment_id,
  coalesce(e.effective_from::date, e.enrolled_at::date) as enrollment_start,
  f.first_from as first_history_from
from public.enrollments e
join first_history f on f.enrollment_id = e.id
where coalesce(e.effective_from::date, e.enrolled_at::date) < f.first_from
order by enrollment_start, first_history_from;
