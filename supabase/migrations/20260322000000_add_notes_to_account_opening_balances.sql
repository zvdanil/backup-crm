-- Додати поле коментаря до залишків на баланс дитини
ALTER TABLE public.account_opening_balances
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.account_opening_balances.notes IS 'Коментар до внесеного залишку (індивідуально для кожного запису)';
