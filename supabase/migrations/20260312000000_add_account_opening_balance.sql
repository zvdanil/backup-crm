-- ============================================
-- Остаток на начало периода по счёту
-- Не считается доходом, учитывается в балансе счёта
-- ============================================

ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS opening_balance_date DATE,
  ADD COLUMN IF NOT EXISTS opening_balance_amount DECIMAL(12,2) DEFAULT 0;

COMMENT ON COLUMN public.payment_accounts.opening_balance_date IS 'Дата, на которую задан початковий залишок (наприклад 2024-01-01)';
COMMENT ON COLUMN public.payment_accounts.opening_balance_amount IS 'Залишок на рахунку на дату opening_balance_date; не входить у дохід, враховується в балансі';
