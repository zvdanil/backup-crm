-- ============================================
-- Add config column to activities table
-- For Garden Attendance Journal v1 metadata
-- ============================================

-- Add config column to activities table
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN public.activities.config IS 'Configuration metadata for activity. For Garden Attendance Journal: contains base_tariff_ids and food_tariff_ids arrays.';
