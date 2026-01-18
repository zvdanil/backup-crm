-- ============================================
-- Activity balance display mode
-- ============================================

ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS balance_display_mode TEXT;

-- Allowed values:
-- 'subscription' | 'recalculation' | 'subscription_and_recalculation'
