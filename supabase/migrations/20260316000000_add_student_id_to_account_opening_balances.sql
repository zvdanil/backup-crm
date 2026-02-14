-- ============================================
-- Додати student_id до account_opening_balances
-- Окремий залишок на рахунок на місяць для кожного учня
-- ============================================

-- Видаляємо старий UNIQUE constraint
ALTER TABLE public.account_opening_balances
  DROP CONSTRAINT IF EXISTS account_opening_balances_account_id_balance_date_key;

-- Додаємо student_id
ALTER TABLE public.account_opening_balances
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.students(id) ON DELETE CASCADE;

-- Видаляємо рядки без student_id (користувач має видалити тестові дані перед міграцією)
DELETE FROM public.account_opening_balances WHERE student_id IS NULL;

ALTER TABLE public.account_opening_balances
  ALTER COLUMN student_id SET NOT NULL;

-- Новий UNIQUE: один запис на учня+рахунок+місяць
ALTER TABLE public.account_opening_balances
  ADD CONSTRAINT account_opening_balances_student_account_date_key
  UNIQUE (student_id, account_id, balance_date);

-- Індекс для швидкого пошуку по учню
CREATE INDEX IF NOT EXISTS idx_account_opening_balances_student
  ON public.account_opening_balances(student_id);

-- Оновлюємо існуючий індекс для фільтрації
DROP INDEX IF EXISTS public.idx_account_opening_balances_account_date;
CREATE INDEX IF NOT EXISTS idx_account_opening_balances_student_account_date
  ON public.account_opening_balances(student_id, account_id, balance_date);

COMMENT ON COLUMN public.account_opening_balances.student_id IS 'Учень, для якого внесено залишок';
