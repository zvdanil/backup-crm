-- ============================================
-- История корректировок баланса по платежным счетам
-- ============================================

CREATE TABLE IF NOT EXISTS public.payment_account_adjustments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
  adjustment_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_account_adjustments IS 'Історія коригувань балансу рахунку; сума коригування діє з обраної дати далі';
COMMENT ON COLUMN public.payment_account_adjustments.adjustment_date IS 'Дата коригування балансу';
COMMENT ON COLUMN public.payment_account_adjustments.amount IS 'Сума коригування балансу';
COMMENT ON COLUMN public.payment_account_adjustments.notes IS 'Примітка до коригування балансу';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_account_adjustments_account_date
  ON public.payment_account_adjustments(account_id, adjustment_date);

ALTER TABLE public.payment_account_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to payment_account_adjustments"
  ON public.payment_account_adjustments FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_payment_account_adjustments_updated_at
  BEFORE UPDATE ON public.payment_account_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
