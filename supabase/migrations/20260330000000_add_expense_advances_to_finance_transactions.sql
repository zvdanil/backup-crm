-- Expense advances for activity expense journal (subcategory-level).
-- Keeps account movement and real purchase amount separately.

ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS expense_advance_type text;

ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS real_amount numeric(10,2);

ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS advance_consumed_amount numeric(10,2);

ALTER TABLE public.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_expense_advance_type_chk;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_expense_advance_type_chk
  CHECK (
    expense_advance_type IS NULL
    OR expense_advance_type IN ('issue', 'spend')
  );

ALTER TABLE public.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_real_amount_non_negative_chk;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_real_amount_non_negative_chk
  CHECK (real_amount IS NULL OR real_amount >= 0);

ALTER TABLE public.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_advance_consumed_amount_non_negative_chk;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_advance_consumed_amount_non_negative_chk
  CHECK (advance_consumed_amount IS NULL OR advance_consumed_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_expense_advance_type
ON public.finance_transactions(expense_advance_type);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_activity_category_advance
ON public.finance_transactions(activity_id, expense_category_id, expense_advance_type, date);

COMMENT ON COLUMN public.finance_transactions.expense_advance_type IS
'Авансовий тип витрати: issue = видача авансу, spend = покупка з авансу.';

COMMENT ON COLUMN public.finance_transactions.real_amount IS
'Реальна сума покупки (для операцій з авансом).';

COMMENT ON COLUMN public.finance_transactions.advance_consumed_amount IS
'Сума, яка була погашена з доступного авансу.';
