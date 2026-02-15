-- ============================================
-- Add fields for Financial Summary Report
-- 1. is_actual_expense in activities (to distinguish forecast vs actual expenses)
-- 2. account_id in expense_journal_entries (for actual expenses only)
-- 3. account_id in staff_payouts (for actual salary payments)
-- ============================================

-- 1. Add is_actual_expense to activities
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS is_actual_expense BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.activities.is_actual_expense IS 
'Если true - журнал расходов считается "Факт", иначе "Прогноз". По умолчанию false (прогноз).';

-- 2. Add account_id to expense_journal_entries (used only for actual expenses)
ALTER TABLE public.expense_journal_entries
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.expense_journal_entries.account_id IS 
'Счет списания средств (только для реальных расходов, когда activity.is_actual_expense = true). 
По умолчанию используется activity.account_id, но можно переопределить в журнале. 
Если NULL, используется activity.account_id. 
Приоритет: expense_journal_entries.account_id > activity.account_id';

CREATE INDEX IF NOT EXISTS idx_expense_journal_entries_account_id 
ON public.expense_journal_entries(account_id);

-- 3. Add account_id to staff_payouts (for actual salary payments) - REQUIRED
ALTER TABLE public.staff_payouts
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.staff_payouts.account_id IS 
'Счет списания средств при выплате зарплаты (факт). ОБЯЗАТЕЛЬНО указывать при создании выплаты. 
Реальная выплата может быть частями с разных счетов (ТОВ, ФОП и т.д.)';

CREATE INDEX IF NOT EXISTS idx_staff_payouts_account_id 
ON public.staff_payouts(account_id);
