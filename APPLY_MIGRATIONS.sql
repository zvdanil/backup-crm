-- ============================================
-- Применить эти миграции в Supabase SQL Editor
-- ============================================

-- Миграция 1: Добавить account_id в enrollments
-- ============================================
ALTER TABLE public.enrollments
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.enrollments.account_id IS 'Payment account for charges (рахунок для нарахувань). If NULL, uses account_id from activities table. Priority: enrollment.account_id > activity.account_id';

CREATE INDEX IF NOT EXISTS idx_enrollments_account_id ON public.enrollments(account_id);

-- Миграция 2: Добавить account_id в finance_transactions
-- ============================================
ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.finance_transactions.account_id IS 'Payment account for this transaction. For student charges: uses enrollment.account_id ?? activity.account_id';

CREATE INDEX IF NOT EXISTS idx_finance_transactions_account_id ON public.finance_transactions(account_id);
