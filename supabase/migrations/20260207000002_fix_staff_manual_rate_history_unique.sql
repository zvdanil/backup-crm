-- Fix UNIQUE constraint on staff_manual_rate_history to include activity_id
-- This allows different rates for different activities on the same date

-- Drop the old constraint
ALTER TABLE public.staff_manual_rate_history
DROP CONSTRAINT IF EXISTS staff_manual_rate_history_staff_id_effective_from_key;

-- Create new unique constraint that includes activity_id
-- Using partial unique index to handle NULL activity_id correctly
CREATE UNIQUE INDEX IF NOT EXISTS staff_manual_rate_history_staff_activity_date_unique
ON public.staff_manual_rate_history(staff_id, COALESCE(activity_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);
