-- ============================================
-- Harden RLS for core tables with role-based policies
-- Target lint issues:
-- - rls_disabled_in_public
-- - policy_exists_rls_disabled
-- ============================================

-- Helper: current authenticated app role from user_profiles
-- SECURITY DEFINER avoids policy recursion if user_profiles RLS is tightened later.
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select up.role
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1
$$;

-- Helper: role membership check
create or replace function public.has_app_role(allowed_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any(allowed_roles), false)
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_app_role(public.user_role[]) to authenticated;

-- Shared role sets
-- Internal staff roles (application users, excluding parent/newregistration)
-- ['owner','admin','manager','accountant','viewer']
-- Elevated write roles
-- ['owner','admin']

-- ==========================================================
-- groups
-- ==========================================================
alter table public.groups enable row level security;

drop policy if exists "Allow all access to groups" on public.groups;

create policy "groups_select_internal_roles"
on public.groups
for select
to authenticated
using (
  public.has_app_role(array['owner','admin','manager','accountant','viewer']::public.user_role[])
);

create policy "groups_insert_admin_roles"
on public.groups
for insert
to authenticated
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "groups_update_admin_roles"
on public.groups
for update
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
)
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "groups_delete_admin_roles"
on public.groups
for delete
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

-- ==========================================================
-- activity_price_history
-- ==========================================================
alter table public.activity_price_history enable row level security;

drop policy if exists "Allow all access to activity_price_history" on public.activity_price_history;

create policy "activity_price_history_select_internal_roles"
on public.activity_price_history
for select
to authenticated
using (
  public.has_app_role(array['owner','admin','manager','accountant','viewer']::public.user_role[])
);

create policy "activity_price_history_insert_admin_roles"
on public.activity_price_history
for insert
to authenticated
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "activity_price_history_update_admin_roles"
on public.activity_price_history
for update
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
)
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "activity_price_history_delete_admin_roles"
on public.activity_price_history
for delete
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

-- ==========================================================
-- expense_categories
-- ==========================================================
alter table public.expense_categories enable row level security;

drop policy if exists "Allow all access to expense_categories" on public.expense_categories;

create policy "expense_categories_select_internal_roles"
on public.expense_categories
for select
to authenticated
using (
  public.has_app_role(array['owner','admin','manager','accountant','viewer']::public.user_role[])
);

create policy "expense_categories_insert_admin_roles"
on public.expense_categories
for insert
to authenticated
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "expense_categories_update_admin_roles"
on public.expense_categories
for update
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
)
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "expense_categories_delete_admin_roles"
on public.expense_categories
for delete
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

-- ==========================================================
-- staff_billing_rules
-- ==========================================================
alter table public.staff_billing_rules enable row level security;

drop policy if exists "Allow all access to staff_billing_rules" on public.staff_billing_rules;

create policy "staff_billing_rules_select_internal_roles"
on public.staff_billing_rules
for select
to authenticated
using (
  public.has_app_role(array['owner','admin','manager','accountant','viewer']::public.user_role[])
);

create policy "staff_billing_rules_insert_admin_roles"
on public.staff_billing_rules
for insert
to authenticated
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "staff_billing_rules_update_admin_roles"
on public.staff_billing_rules
for update
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
)
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "staff_billing_rules_delete_admin_roles"
on public.staff_billing_rules
for delete
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

-- ==========================================================
-- staff_journal_entries
-- ==========================================================
alter table public.staff_journal_entries enable row level security;

drop policy if exists "Allow all access to staff_journal_entries" on public.staff_journal_entries;

create policy "staff_journal_entries_select_internal_roles"
on public.staff_journal_entries
for select
to authenticated
using (
  public.has_app_role(array['owner','admin','manager','accountant','viewer']::public.user_role[])
);

create policy "staff_journal_entries_insert_admin_roles"
on public.staff_journal_entries
for insert
to authenticated
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "staff_journal_entries_update_admin_roles"
on public.staff_journal_entries
for update
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
)
with check (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

create policy "staff_journal_entries_delete_admin_roles"
on public.staff_journal_entries
for delete
to authenticated
using (
  public.has_app_role(array['owner','admin']::public.user_role[])
);

-- ==========================================================
-- NOTE ABOUT "own data"
-- ==========================================================
-- The target tables do not contain ownership columns (like user_id/created_by),
-- so row-level per-user isolation is not currently possible here.
-- If needed, add created_by UUID references auth.users(id) and extend policies:
--   USING (created_by = auth.uid() OR public.has_app_role(...))
--   WITH CHECK (created_by = auth.uid() OR public.has_app_role(...))
