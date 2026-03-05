-- Enrollment account binding history per enrollment.
-- Model: [effective_from, effective_to), effective_to NULL = open-ended.

create table if not exists public.enrollment_account_history (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  account_id uuid null references public.payment_accounts(id) on delete set null,
  effective_from date not null,
  effective_to date null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_enrollment_account_history_enrollment_id
  on public.enrollment_account_history(enrollment_id);
create index if not exists idx_enrollment_account_history_effective_from
  on public.enrollment_account_history(effective_from);
create index if not exists idx_enrollment_account_history_effective_to
  on public.enrollment_account_history(effective_to);
create unique index if not exists uq_enrollment_account_history_enrollment_from
  on public.enrollment_account_history(enrollment_id, effective_from);

alter table public.enrollment_account_history
  drop constraint if exists enrollment_account_history_valid_interval_chk;
alter table public.enrollment_account_history
  add constraint enrollment_account_history_valid_interval_chk
  check (effective_to is null or effective_to > effective_from);

alter table public.enrollment_account_history enable row level security;
drop policy if exists "Allow all enrollment_account_history" on public.enrollment_account_history;
create policy "Allow all enrollment_account_history"
  on public.enrollment_account_history
  for all
  using (true)
  with check (true);

drop trigger if exists update_enrollment_account_history_updated_at on public.enrollment_account_history;
create trigger update_enrollment_account_history_updated_at
  before update on public.enrollment_account_history
  for each row execute function public.update_updated_at_column();

insert into public.enrollment_account_history (
  enrollment_id,
  account_id,
  effective_from,
  effective_to
)
select
  e.id,
  e.account_id,
  coalesce(e.effective_from::date, e.enrolled_at::date, current_date),
  null
from public.enrollments e
where not exists (
  select 1
  from public.enrollment_account_history h
  where h.enrollment_id = e.id
);

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
  v_next_from date;
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

  perform 1
  from public.enrollment_account_history h
  where h.enrollment_id = p_enrollment_id
  for update;

  if not exists (
    select 1
    from public.enrollment_account_history h
    where h.enrollment_id = p_enrollment_id
  ) then
    if v_enrollment_start < v_effective_from then
      insert into public.enrollment_account_history (
        enrollment_id,
        account_id,
        effective_from,
        effective_to
      ) values (
        p_enrollment_id,
        v_old_account_id,
        v_enrollment_start,
        v_effective_from
      );
    end if;
  end if;

  update public.enrollment_account_history
  set effective_to = v_effective_from
  where enrollment_id = p_enrollment_id
    and effective_from < v_effective_from
    and (effective_to is null or effective_to > v_effective_from);

  select min(h.effective_from)
  into v_next_from
  from public.enrollment_account_history h
  where h.enrollment_id = p_enrollment_id
    and h.effective_from > v_effective_from;

  insert into public.enrollment_account_history (
    enrollment_id,
    account_id,
    effective_from,
    effective_to
  ) values (
    p_enrollment_id,
    p_account_id,
    v_effective_from,
    v_next_from
  )
  on conflict (enrollment_id, effective_from)
  do update
    set account_id = excluded.account_id,
        effective_to = excluded.effective_to,
        updated_at = now();
end;
$$;

grant execute on function public.set_enrollment_account(uuid, uuid, date) to authenticated;
grant execute on function public.set_enrollment_account(uuid, uuid, date) to service_role;

