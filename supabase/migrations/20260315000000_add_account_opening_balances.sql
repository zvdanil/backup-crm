-- ============================================
-- Таблиця початкових залишків по рахунках на місяць
-- Один запис на рахунок на місяць (1-ше число)
-- Не входить у реальний дохід, враховується в реальному балансі
-- ============================================

CREATE TABLE IF NOT EXISTS public.account_opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
  balance_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, balance_date)
);

COMMENT ON TABLE public.account_opening_balances IS 'Початкові залишки на рахунках на дату (1-ше число місяця); один запис на рахунок на місяць';
COMMENT ON COLUMN public.account_opening_balances.balance_date IS 'Дата залишку (зазвичай 1-ше число місяця)';
COMMENT ON COLUMN public.account_opening_balances.amount IS 'Сума залишку; може бути відʼємною (борг)';

CREATE INDEX IF NOT EXISTS idx_account_opening_balances_account_date
  ON public.account_opening_balances(account_id, balance_date);

ALTER TABLE public.account_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to account_opening_balances"
  ON public.account_opening_balances FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_account_opening_balances_updated_at
  BEFORE UPDATE ON public.account_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
