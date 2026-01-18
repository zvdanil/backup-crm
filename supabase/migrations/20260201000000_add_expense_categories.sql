-- ============================================
-- Expense Categories (subcategories for expenses)
-- ============================================

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default now()
);

create unique index if not exists expense_categories_activity_name_unique
  on public.expense_categories(activity_id, name);

alter table public.finance_transactions
  add column if not exists expense_category_id uuid references public.expense_categories(id) on delete set null;

create index if not exists finance_transactions_expense_category_id_idx
  on public.finance_transactions(expense_category_id);
