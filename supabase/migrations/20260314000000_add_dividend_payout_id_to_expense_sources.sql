-- Link expense sources to dividend payouts: records with dividend_payout_id set
-- are excluded from "real expenses" (counted only via dividend journal).

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS dividend_payout_id UUID REFERENCES public.dividend_payouts(id) ON DELETE SET NULL;

ALTER TABLE public.expense_journal_entries
  ADD COLUMN IF NOT EXISTS dividend_payout_id UUID REFERENCES public.dividend_payouts(id) ON DELETE SET NULL;

ALTER TABLE public.staff_payouts
  ADD COLUMN IF NOT EXISTS dividend_payout_id UUID REFERENCES public.dividend_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_dividend_payout_id ON public.finance_transactions(dividend_payout_id);
CREATE INDEX IF NOT EXISTS idx_expense_journal_entries_dividend_payout_id ON public.expense_journal_entries(dividend_payout_id);
CREATE INDEX IF NOT EXISTS idx_staff_payouts_dividend_payout_id ON public.staff_payouts(dividend_payout_id);

COMMENT ON COLUMN public.finance_transactions.dividend_payout_id IS 'Якщо вказано, витрата виведена як дивіденд; не враховується в реальних витратах';
COMMENT ON COLUMN public.expense_journal_entries.dividend_payout_id IS 'Якщо вказано, запис виведено як дивіденд; не враховується в реальних витратах';
COMMENT ON COLUMN public.staff_payouts.dividend_payout_id IS 'Якщо вказано, виплату виведено як дивіденд; не враховується в реальних витратах';
