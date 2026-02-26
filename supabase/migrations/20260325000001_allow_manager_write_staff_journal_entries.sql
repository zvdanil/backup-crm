-- ==========================================================
-- Hotfix: allow manager to maintain attendance marks
-- Reason: manager is primary role for setting/removing attendance,
-- and this flow writes to staff_journal_entries.
-- ==========================================================

-- Keep SELECT policy as is; widen write policies for manager.

drop policy if exists "staff_journal_entries_insert_admin_roles" on public.staff_journal_entries;
create policy "staff_journal_entries_insert_manager_roles"
on public.staff_journal_entries
for insert
to authenticated
with check (
  public.has_app_role(array['owner','admin','manager']::public.user_role[])
);

drop policy if exists "staff_journal_entries_update_admin_roles" on public.staff_journal_entries;
create policy "staff_journal_entries_update_manager_roles"
on public.staff_journal_entries
for update
to authenticated
using (
  public.has_app_role(array['owner','admin','manager']::public.user_role[])
)
with check (
  public.has_app_role(array['owner','admin','manager']::public.user_role[])
);

drop policy if exists "staff_journal_entries_delete_admin_roles" on public.staff_journal_entries;
create policy "staff_journal_entries_delete_manager_roles"
on public.staff_journal_entries
for delete
to authenticated
using (
  public.has_app_role(array['owner','admin','manager']::public.user_role[])
);
