-- Fix enrollment account rebinding behavior:
-- when user sets account from a date, rewrite binding from that date forward.
-- This removes future split intervals so one account is used from effective date onward.

create or replace function public.set_enrollment_account(
  p_enrollment_id uuid,
  p_account_id uuid,
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
  v_old_account_id uuid;
  v_prev_id uuid;
  v_prev_account_id uuid;
begin
  select
    coalesce(e.effective_from::date, e.enrolled_at::date, current_date),
    e.account_id
  into
    v_enrollment_start,
    v_old_account_id
  from public.enrollments e
  where e.id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found: %', p_enrollment_id;
  end if;

  -- Do not allow effective date earlier than enrollment start.
  if v_effective_from < v_enrollment_start then
    v_effective_from := v_enrollment_start;
  end if;

  -- Lock enrollment history rows for this enrollment.
  perform 1
  from public.enrollment_account_history h
  where h.enrollment_id = p_enrollment_id
  for update;

  -- Bootstrap history if absent.
  if not exists (
    select 1
    from public.enrollment_account_history h
    where h.enrollment_id = p_enrollment_id
  ) then
    insert into public.enrollment_account_history (
      enrollment_id,
      account_id,
      effective_from,
      effective_to
    ) values (
      p_enrollment_id,
      v_old_account_id,
      v_enrollment_start,
      null
    );
  end if;

  -- Close interval that covers v_effective_from.
  update public.enrollment_account_history
  set effective_to = v_effective_from
  where enrollment_id = p_enrollment_id
    and effective_from < v_effective_from
    and (effective_to is null or effective_to > v_effective_from);

  -- Remove all intervals from v_effective_from and later (full rewrite from date onward).
  delete from public.enrollment_account_history
  where enrollment_id = p_enrollment_id
    and effective_from >= v_effective_from;

  -- If previous interval has same account, just reopen it; otherwise insert a new one.
  select h.id, h.account_id
  into v_prev_id, v_prev_account_id
  from public.enrollment_account_history h
  where h.enrollment_id = p_enrollment_id
    and h.effective_from < v_effective_from
  order by h.effective_from desc
  limit 1;

  if v_prev_id is not null and (v_prev_account_id is not distinct from p_account_id) then
    update public.enrollment_account_history
    set effective_to = null,
        updated_at = now()
    where id = v_prev_id;
  else
    insert into public.enrollment_account_history (
      enrollment_id,
      account_id,
      effective_from,
      effective_to
    ) values (
      p_enrollment_id,
      p_account_id,
      v_effective_from,
      null
    );
  end if;
end;
$$;

grant execute on function public.set_enrollment_account(uuid, uuid, date) to authenticated;
grant execute on function public.set_enrollment_account(uuid, uuid, date) to service_role;
