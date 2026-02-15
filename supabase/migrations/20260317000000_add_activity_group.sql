-- ============================================
-- Група для активності (для категорій Дохід, Дод. дохід)
-- Дозволяє фільтрувати: Дитячій садок, Додаткові заняття
-- ============================================

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS activity_group TEXT;

-- Для існуючих активностей — «Додаткові заняття»
UPDATE public.activities
  SET activity_group = 'additional_classes'
  WHERE activity_group IS NULL;

-- За замовчуванням для нових активностей
ALTER TABLE public.activities
  ALTER COLUMN activity_group SET DEFAULT 'additional_classes';

COMMENT ON COLUMN public.activities.activity_group IS 'Група активності: kindergarten (Дитячій садок), additional_classes (Додаткові заняття). Тільки для категорій income, additional_income.';
