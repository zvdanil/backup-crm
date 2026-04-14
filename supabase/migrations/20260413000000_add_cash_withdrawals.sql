-- ============================================
-- Add cash_withdrawals table for marking expense transactions as cash withdrawals
-- ============================================

CREATE TABLE IF NOT EXISTS public.cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_transaction_id UUID NOT NULL REFERENCES public.finance_transactions(id) ON DELETE CASCADE,
      income_transaction_id UUID REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
        cash_account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE RESTRICT,
          commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
            commission_amount NUMERIC(10, 2) NOT NULL CHECK (commission_amount >= 0),
              credited_amount NUMERIC(10, 2) NOT NULL CHECK (credited_amount >= 0),
                recipient_note TEXT,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );

                    COMMENT ON TABLE public.cash_withdrawals IS 'Marks expense transactions that have been converted into cash withdrawals and stores commission metadata.';
                    COMMENT ON COLUMN public.cash_withdrawals.expense_transaction_id IS 'Source expense transaction which was marked as a cash withdrawal.';
                    COMMENT ON COLUMN public.cash_withdrawals.income_transaction_id IS 'Resulting income transaction for the cash account.';
                    COMMENT ON COLUMN public.cash_withdrawals.cash_account_id IS 'Account where the cash was credited.';
                    COMMENT ON COLUMN public.cash_withdrawals.commission_percent IS 'Commission percent used to calculate the credited cash amount.';
                    COMMENT ON COLUMN public.cash_withdrawals.commission_amount IS 'Commission amount that remained with the expense recipient.';
                    COMMENT ON COLUMN public.cash_withdrawals.credited_amount IS 'Amount credited to the cash account after commission.';
                    COMMENT ON COLUMN public.cash_withdrawals.recipient_note IS 'Optional note about the original expense recipient or description.';

                    CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_expense_transaction_id ON public.cash_withdrawals(expense_transaction_id);
                    CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_income_transaction_id ON public.cash_withdrawals(income_transaction_id);
                    CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_cash_account_id ON public.cash_withdrawals(cash_account_id);

                    ALTER TABLE public.finance_transactions
                      ADD COLUMN IF NOT EXISTS cash_withdrawal_id UUID REFERENCES public.cash_withdrawals(id) ON DELETE SET NULL;

                      COMMENT ON COLUMN public.finance_transactions.cash_withdrawal_id IS 'Links expense transaction to a cash withdrawal record. Used when the expense is converted to cash received after commission.';

                      CREATE INDEX IF NOT EXISTS idx_finance_transactions_cash_withdrawal_id ON public.finance_transactions(cash_withdrawal_id);
                      