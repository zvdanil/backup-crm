-- ============================================
-- Add manual rate fields to staff table
-- ============================================

-- Add manual_rate_type column (тільки для manual режиму)
-- 'hourly' = почасово (години * ставка)
-- 'per_session' = за заняття (ставка за замовчуванням або ручне введення)
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS manual_rate_type VARCHAR(20);

-- Add manual_rate_value column (значення ставки за замовчуванням)
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS manual_rate_value DECIMAL(10,2);

-- Update existing records to have default values FIRST
UPDATE public.staff 
SET manual_rate_type = 'per_session', manual_rate_value = 0 
WHERE manual_rate_type IS NULL OR manual_rate_value IS NULL;

-- Now add DEFAULT constraint and CHECK constraint
ALTER TABLE public.staff 
ALTER COLUMN manual_rate_type SET DEFAULT 'per_session';

ALTER TABLE public.staff 
ALTER COLUMN manual_rate_value SET DEFAULT 0;

-- Add CHECK constraint
ALTER TABLE public.staff 
ADD CONSTRAINT chk_manual_rate_type 
CHECK (manual_rate_type IS NULL OR manual_rate_type IN ('hourly', 'per_session'));
