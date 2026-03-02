-- Stage 3: single server-side API for safe enrollment price history updates.
-- Model: [effective_from, effective_to), effective_to NULL = open-ended.

create or replace function public.set_enrollment_price(
  p_enrollment_id uuid,
  p_custom_price numeric,
  p_discount_percent numeric,
  p_effective_from date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_from date := coalesce(p_effective_from, current_date);
  v_enrollment_start date;
  v_old_custom_price numeric;
  v_old_discount_percent numeric;
  v_next_from date;
begin
  select
    coalesce(e.effective_from::date, e.enrolled_at::date),
    e.custom_price,
    coalesce(e.discount_percent, 0)
  into
    v_enrollment_start,
    v_old_custom_price,
    v_old_discount_percent
  from public.enrollments e
  where e.id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found: %', p_enrollment_id;
  end if;

  -- Lock history rows for this enrollment to avoid race writes.
  perform 1
  from public.enrollment_price_history h
  where h.enrollment_id = p_enrollment_id
  for update;

  -- Baseline: if there is no history yet, seed old price from enrollment start
  -- up to the new effective date.
  if not exists (
    select 1
    from public.enrollment_price_history h
    where h.enrollment_id = p_enrollment_id
  ) then
    if v_enrollment_start < v_effective_from then
      insert into public.enrollment_price_history (
        enrollment_id,
        custom_price,
        discount_percent,
        effective_from,
        effective_to
      ) values (
        p_enrollment_id,
        v_old_custom_price,
        v_old_discount_percent,
        v_enrollment_start,
        v_effective_from
      );
    end if;
  end if;

  -- Close interval covering the new date, if it started earlier.
  update public.enrollment_price_history
  set effective_to = v_effective_from
  where enrollment_id = p_enrollment_id
    and effective_from < v_effective_from
    and (effective_to is null or effective_to > v_effective_from);

  -- New interval should end where the next interval starts (if any).
  select min(h.effective_from)
  into v_next_from
  from public.enrollment_price_history h
  where h.enrollment_id = p_enrollment_id
    and h.effective_from > v_effective_from;

  -- Upsert record at exact effective_from date.
  insert into public.enrollment_price_history (
    enrollment_id,
    custom_price,
    discount_percent,
    effective_from,
    effective_to
  ) values (
    p_enrollment_id,
    p_custom_price,
    coalesce(p_discount_percent, 0),
    v_effective_from,
    v_next_from
  )
  on conflict (enrollment_id, effective_from)
  do update
    set custom_price = excluded.custom_price,
        discount_percent = excluded.discount_percent,
        effective_to = excluded.effective_to,
        updated_at = now();
end;
$$;

grant execute on function public.set_enrollment_price(uuid, numeric, numeric, date) to authenticated;
grant execute on function public.set_enrollment_price(uuid, numeric, numeric, date) to service_role;

