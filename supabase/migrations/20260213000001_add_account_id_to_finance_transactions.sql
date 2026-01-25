-- ============================================
-- Add account_id field to finance_transactions
-- Links transactions to payment accounts
-- ============================================

-- Add account_id column to finance_transactions
ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.finance_transactions.account_id IS 'Payment account for this transaction. For student charges: uses enrollment.account_id ?? activity.account_id';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_finance_transactions_account_id ON public.finance_transactions(account_id);
