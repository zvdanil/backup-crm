-- ============================================
-- Add accrual_mode to staff table
-- ============================================

-- Add accrual_mode column to staff table
-- 'auto' = автоматичне нарахування з журналу відвідуваності
-- 'manual' = ручне внесення в журналі витрат
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS accrual_mode VARCHAR(10) DEFAULT 'auto' CHECK (accrual_mode IN ('auto', 'manual'));

-- Update existing records to have 'auto' as default (if needed)
UPDATE public.staff 
SET accrual_mode = 'auto' 
WHERE accrual_mode IS NULL;
