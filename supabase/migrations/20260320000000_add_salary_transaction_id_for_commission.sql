-- ============================================
-- Link commission entries to their parent salary transaction
-- Link salary transactions to staff_payouts (when created from staff payout form)
-- Enables: display commission in salary records, edit/update commission when editing salary
-- ============================================

-- Commission transaction points to the salary transaction that generated it
ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS salary_transaction_id UUID REFERENCES public.finance_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_salary_transaction_id 
ON public.finance_transactions(salary_transaction_id);

COMMENT ON COLUMN public.finance_transactions.salary_transaction_id IS 
'Якщо вказано, ця транзакція (комісія) прив''язана до зарплатної транзакції. Дозволяє відображати та редагувати комісію разом із виплатою.';

-- Salary transaction created from staff_payouts form links back to the payout
ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS staff_payout_id UUID REFERENCES public.staff_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_staff_payout_id 
ON public.finance_transactions(staff_payout_id);

COMMENT ON COLUMN public.finance_transactions.staff_payout_id IS 
'Якщо вказано, ця зарплатна транзакція створена з форми реєстрації виплати (staff_payouts).';
