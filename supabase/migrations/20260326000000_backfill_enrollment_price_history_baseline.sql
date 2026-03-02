-- Backfill baseline rows for enrollment_price_history.
-- Goal: prevent old months from "disappearing" when history starts only from a later change date.
--
-- Strategy:
-- 1) find enrollments where the first history record starts AFTER enrollment start date;
-- 2) insert a baseline row from enrollment start date up to first history effective_from;
-- 3) use earliest known history values (custom_price/discount) as safe fallback.
--
-- Note:
-- historical values before the first saved change may be unknown in legacy data.
-- This migration restores continuity of periods (coverage), not perfect historical reconstruction.

with first_history as (
  select distinct on (h.enrollment_id)
    h.enrollment_id,
    h.effective_from::date as first_from,
    h.custom_price,
    h.discount_percent
  from public.enrollment_price_history h
  order by h.enrollment_id, h.effective_from asc, h.created_at asc
),
enrollment_start as (
  select
    e.id as enrollment_id,
    coalesce(e.effective_from::date, e.enrolled_at::date) as baseline_from,
    e.custom_price as enrollment_custom_price,
    coalesce(e.discount_percent, 0) as enrollment_discount_percent
  from public.enrollments e
),
candidates as (
  select
    es.enrollment_id,
    es.baseline_from,
    fh.first_from,
    coalesce(fh.custom_price, es.enrollment_custom_price) as baseline_custom_price,
    coalesce(fh.discount_percent, es.enrollment_discount_percent, 0) as baseline_discount_percent
  from enrollment_start es
  join first_history fh on fh.enrollment_id = es.enrollment_id
  where es.baseline_from is not null
    and es.baseline_from < fh.first_from
)
insert into public.enrollment_price_history (
  enrollment_id,
  custom_price,
  discount_percent,
  effective_from,
  effective_to
)
select
  c.enrollment_id,
  c.baseline_custom_price,
  c.baseline_discount_percent,
  c.baseline_from,
  c.first_from
from candidates c
where not exists (
  select 1
  from public.enrollment_price_history h
  where h.enrollment_id = c.enrollment_id
    and h.effective_from = c.baseline_from
);

