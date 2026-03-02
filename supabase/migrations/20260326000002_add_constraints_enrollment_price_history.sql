-- Stage 2: minimal integrity constraints for enrollment_price_history
-- 1) valid interval: effective_to must be greater than effective_from (or NULL for open period)
-- 2) unique period start per enrollment: (enrollment_id, effective_from)

alter table public.enrollment_price_history
  drop constraint if exists enrollment_price_history_valid_interval_chk;

alter table public.enrollment_price_history
  add constraint enrollment_price_history_valid_interval_chk
  check (effective_to is null or effective_to > effective_from);

create unique index if not exists uq_enrollment_price_history_enrollment_from
  on public.enrollment_price_history (enrollment_id, effective_from);

